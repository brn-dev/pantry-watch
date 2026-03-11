import { Router, type Response } from "express";
import { z } from "zod/v3";
import { zodToJsonSchema } from "zod-to-json-schema";

type VoiceToTextBody = {
  audioBase64?: string;
  mimeType?: string;
  language?: string;
};

type ParseTextBody = {
  text?: string;
  availableLocations?: string[];
  currentDate?: string;
  llmModel?: string;
};

type ParseShoppingListTextBody = {
  text?: string;
  currentDate?: string;
  llmModel?: string;
};

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ChatSelectedItem = {
  name?: string;
  quantity?: number;
  unit?: string;
  locationName?: string;
  householdName?: string;
  expirationDate?: string | null;
};

type AiChatBody = {
  message?: string;
  history?: ChatMessage[];
  selectedItems?: ChatSelectedItem[];
  extraIngredients?: string;
  context?: string;
  language?: string;
  llmModel?: string;
};

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const supportedLlmModels = ["gpt-5.4", "gpt-5", "gpt-5-mini", "gpt-5-nano"] as const;
type LlmModel = (typeof supportedLlmModels)[number];
const defaultLlmModel: LlmModel = "gpt-5-mini";

const parseLlmModel = (value: unknown): LlmModel | null => {
  if (typeof value !== "string") {
    return defaultLlmModel;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return defaultLlmModel;
  }

  if (supportedLlmModels.includes(trimmedValue as LlmModel)) {
    return trimmedValue as LlmModel;
  }

  return null;
};

const buildParsedItemsEnvelopeSchema = (availableLocations: string[]) => {
  const [firstLocation, ...otherLocations] = availableLocations;
  if (!firstLocation) {
    throw new Error("At least one available location is required.");
  }

  const locationOptions = [firstLocation, ...otherLocations] as [string, ...string[]];
  const locationNameSchema = z.enum(locationOptions);

  return z
    .object({
      items: z.array(
        z
          .object({
            locationName: locationNameSchema,
            name: z.string().min(1),
            quantity: z.number().min(0.000001),
            unit: z.string().min(0),
            expirationDate: dateStringSchema.nullable()
          })
          .strict()
      )
    })
    .strict();
};

type ParsedItem = {
  locationName: string;
  name: string;
  quantity: number;
  unit: string;
  expirationDate: string | null;
};

type ParsedShoppingListItem = {
  name: string;
  quantity: number;
  unit: string;
  shop: string;
};

function normalizeTranscriptionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}"']/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function isKnownSubtitleWatermark(text: string): boolean {
  const normalizedText = normalizeTranscriptionText(text);
  return normalizedText.startsWith("untertitel") || normalizedText.startsWith("subtitles");
}

const createTranscription = async (audioBase64: string, mimeType: string, language?: string): Promise<string> => {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");
  if (!audioBuffer.length) {
    throw new Error("Audio payload is empty.");
  }

  const formData = new FormData();
  const audioBlob = new Blob([audioBuffer], { type: mimeType || "audio/webm" });
  formData.append("file", audioBlob, "recording.webm");
  formData.append("model", "whisper-1");
  if (language) {
    formData.append("language", language);
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI transcription failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { text?: string };
  const text = data.text?.trim() ?? "";
  if (!text || isKnownSubtitleWatermark(text)) {
    throw new Error("OpenAI transcription returned empty text.");
  }

  return text;
};

const extractResponseOutputText = (responseData: unknown): string => {
  if (typeof responseData !== "object" || responseData === null) {
    throw new Error("OpenAI returned an invalid response payload.");
  }

  const topLevelOutputText = (responseData as { output_text?: unknown }).output_text;
  if (typeof topLevelOutputText === "string" && topLevelOutputText.trim()) {
    return topLevelOutputText;
  }

  const output = (responseData as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    throw new Error("OpenAI returned no parseable output.");
  }

  for (const outputItem of output) {
    if (typeof outputItem !== "object" || outputItem === null) {
      continue;
    }

    const content = (outputItem as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (typeof contentItem !== "object" || contentItem === null) {
        continue;
      }

      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        return text;
      }
    }
  }

  throw new Error("OpenAI returned empty structured output.");
};

const parseItemsWithStructuredOutput = async (
  text: string,
  availableLocations: string[],
  currentDate: string,
  llmModel: LlmModel
): Promise<ParsedItem[]> => {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const parsedItemsEnvelopeSchema = buildParsedItemsEnvelopeSchema(availableLocations);
  const pantryItemsSchema = zodToJsonSchema(parsedItemsEnvelopeSchema, {
    target: "openAi",
    $refStrategy: "none"
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: llmModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                `Extract pantry items from user text. Current date is ${currentDate}. ` +
                "The input may come from voice transcription and can contain recognition errors. " +
                "Infer and correct obvious transcription mistakes from context while preserving user intent. " +
                "When users mention dates, assume day-month ordering (dd-mm) unless a different format is explicit. " +
                "Use only one of the provided available locations for locationName. Never invent or alter location names. " +
                "If location is missing, set the location to '?'. Abbreviate the quantity if possible, i.e. liter -> L. " +
                "Use quantity=1 and unit='' if omitted. expirationDate must be YYYY-MM-DD or null."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Available locations: ${availableLocations.join(", ")}`
            },
            {
              type: "input_text",
              text
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "pantry_items",
          strict: true,
          schema: pantryItemsSchema
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI structured parsing failed (${response.status}): ${errorText}`);
  }

  const responseData = (await response.json()) as unknown;
  const outputText = extractResponseOutputText(responseData);
  const parsedJson = JSON.parse(outputText) as unknown;
  return parsedItemsEnvelopeSchema.parse(parsedJson).items as ParsedItem[];
};

const ParsedShoppingListItemsEnvelopeSchema = z
  .object({
    items: z.array(
      z
        .object({
          name: z.string().min(1),
          quantity: z.number().min(0.000001),
          unit: z.string().min(0),
          shop: z.string().min(1)
        })
        .strict()
    )
  })
  .strict();

const parseShoppingListItemsWithStructuredOutput = async (
  text: string,
  currentDate: string,
  llmModel: LlmModel
): Promise<ParsedShoppingListItem[]> => {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const shoppingListItemsSchema = zodToJsonSchema(ParsedShoppingListItemsEnvelopeSchema, {
    target: "openAi",
    $refStrategy: "none"
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: llmModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                `Extract shopping list items from natural language. Current date is ${currentDate}. ` +
                "The input may come from voice transcription and can contain recognition errors. " +
                "Infer and correct obvious transcription mistakes from context while preserving user intent. " +
                "Each item must include name, quantity, unit, and shop. " +
                "If quantity is missing, use 1. If unit is missing, use ''. If shop is missing, use '?'."
            }
          ]
        },
        {
          role: "user",
          content: [{ type: "input_text", text }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "shopping_list_items",
          strict: true,
          schema: shoppingListItemsSchema
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI shopping list parsing failed (${response.status}): ${errorText}`);
  }

  const responseData = (await response.json()) as unknown;
  const outputText = extractResponseOutputText(responseData);
  const parsedJson = JSON.parse(outputText) as unknown;
  return ParsedShoppingListItemsEnvelopeSchema.parse(parsedJson).items;
};

const sanitizeChatHistory = (history: unknown): ChatMessage[] => {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return [];
      }

      const role = (entry as { role?: unknown }).role;
      const content = (entry as { content?: unknown }).content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
        return [];
      }

      const trimmedContent = content.trim();
      if (!trimmedContent) {
        return [];
      }

      return [{ role: role as ChatRole, content: trimmedContent }];
    })
    .slice(-20);
};

const sanitizeSelectedItems = (selectedItems: unknown): Required<Pick<ChatSelectedItem, "name" | "quantity" | "unit" | "locationName" | "householdName"> & { expirationDate: string | null }>[] => {
  if (!Array.isArray(selectedItems)) {
    return [];
  }

  return selectedItems
    .flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        return [];
      }

      const candidate = item as ChatSelectedItem;
      const name = candidate.name?.trim() ?? "";
      if (!name) {
        return [];
      }

      const quantity = Number(candidate.quantity);
      const normalizedQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
      const unit = candidate.unit?.trim() ?? "";
      const locationName = candidate.locationName?.trim() ?? "?";
      const householdName = candidate.householdName?.trim() ?? "?";
      const expirationDate =
        typeof candidate.expirationDate === "string" && dateStringSchema.safeParse(candidate.expirationDate).success
          ? candidate.expirationDate
          : null;

      return [
        {
          name,
          quantity: normalizedQuantity,
          unit,
          locationName,
          householdName,
          expirationDate
        }
      ];
    })
    .slice(0, 200);
};

const buildAiChefInput = (
  message: string,
  history: ChatMessage[],
  selectedItems: ReturnType<typeof sanitizeSelectedItems>,
  extraIngredients: string,
  context: string,
  language?: string
): {
  role: "system" | "user" | "assistant";
  content: { type: "input_text"; text: string }[];
}[] => {
  const pantrySummary = selectedItems.length
    ? selectedItems
      .map((item) => {
        const unitPart = item.unit ? ` ${item.unit}` : "";
        const expirationPart = item.expirationDate ? `, expires ${item.expirationDate}` : "";
        return `- ${item.quantity}${unitPart} ${item.name} (${item.householdName}/${item.locationName}${expirationPart})`;
      })
      .join("\n")
    : "- no selected pantry items";

  const systemPrompt =
    "You are AI Chef for a pantry app. " +
    "Give practical cooking suggestions based on available pantry items and user context. " +
    "If ingredients are missing, explicitly list short substitutes or a minimal shopping list. " +
    "Prefer concise, actionable responses with sections: Best idea, Why it fits, Steps, Optional upgrades.";

  const userPrompt = [
    `Preferred language: ${language?.trim() || "en"}`,
    "Selected pantry items:",
    pantrySummary,
    `Extra ingredients: ${extraIngredients || "(none)"}`,
    `Additional context: ${context || "(none)"}`,
    `Latest user message: ${message}`
  ].join("\n");

  return [
    {
      role: "system",
      content: [{ type: "input_text", text: systemPrompt }]
    },
    ...history.map((entry) => ({
      role: entry.role,
      content: [{ type: "input_text" as const, text: entry.content }]
    })),
    {
      role: "user",
      content: [{ type: "input_text", text: userPrompt }]
    }
  ];
};

const writeSseEvent = (res: Response, eventName: string, payload: unknown): void => {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const parseSseBlocks = (buffer: string): { blocks: string[]; rest: string } => {
  const normalizedBuffer = buffer.replace(/\r\n/gu, "\n");
  const blocks = normalizedBuffer.split("\n\n");
  const rest = blocks.pop() ?? "";
  return { blocks, rest };
};

const extractSseData = (block: string): string => {
  return block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
};

const createAiChefReply = async (
  message: string,
  history: ChatMessage[],
  selectedItems: ReturnType<typeof sanitizeSelectedItems>,
  extraIngredients: string,
  context: string,
  language?: string,
  llmModel: LlmModel = defaultLlmModel
): Promise<string> => {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const input = buildAiChefInput(message, history, selectedItems, extraIngredients, context, language);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: llmModel,
      input
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI chat failed (${response.status}): ${errorText}`);
  }

  const responseData = (await response.json()) as unknown;
  return extractResponseOutputText(responseData);
};

export const aiRouter = Router();

aiRouter.post("/voice-to-text", async (req, res) => {
  const body = req.body as VoiceToTextBody;
  const audioBase64 = body.audioBase64?.trim();
  const mimeType = body.mimeType?.trim() || "audio/webm";
  const language = body.language?.trim();

  if (!audioBase64) {
    res.status(400).json({ error: "audioBase64 is required." });
    return;
  }

  try {
    const text = await createTranscription(audioBase64, mimeType, language);
    res.json({ text });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Voice transcription failed." });
  }
});

aiRouter.post("/text-to-items", async (req, res) => {
  const body = req.body as ParseTextBody;
  const text = body.text?.trim();
  const availableLocations = Array.isArray(body.availableLocations)
    ? Array.from(new Set(body.availableLocations.map((location) => location.trim()).filter((location) => location.length > 0)))
    : [];
  const currentDate = body.currentDate?.trim();
  const llmModel = parseLlmModel(body.llmModel);

  if (!text) {
    res.status(400).json({ error: "Text is required." });
    return;
  }
  if (!availableLocations.length) {
    res.status(400).json({ error: "availableLocations must contain at least one location." });
    return;
  }
  if (!currentDate || !dateStringSchema.safeParse(currentDate).success) {
    res.status(400).json({ error: "currentDate is required in YYYY-MM-DD format." });
    return;
  }
  if (!llmModel) {
    res.status(400).json({ error: `llmModel must be one of: ${supportedLlmModels.join(", ")}` });
    return;
  }

  try {
    const items = await parseItemsWithStructuredOutput(text, availableLocations, currentDate, llmModel);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Text parsing failed." });
  }
});

aiRouter.post("/shopping-list/text-to-items", async (req, res) => {
  const body = req.body as ParseShoppingListTextBody;
  const text = body.text?.trim();
  const currentDate = body.currentDate?.trim();
  const llmModel = parseLlmModel(body.llmModel);

  if (!text) {
    res.status(400).json({ error: "Text is required." });
    return;
  }
  if (!currentDate || !dateStringSchema.safeParse(currentDate).success) {
    res.status(400).json({ error: "currentDate is required in YYYY-MM-DD format." });
    return;
  }
  if (!llmModel) {
    res.status(400).json({ error: `llmModel must be one of: ${supportedLlmModels.join(", ")}` });
    return;
  }

  try {
    const items = await parseShoppingListItemsWithStructuredOutput(text, currentDate, llmModel);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Shopping list parsing failed." });
  }
});

aiRouter.post("/chat", async (req, res) => {
  const body = req.body as AiChatBody;
  const message = body.message?.trim();
  const history = sanitizeChatHistory(body.history);
  const selectedItems = sanitizeSelectedItems(body.selectedItems);
  const extraIngredients = body.extraIngredients?.trim() ?? "";
  const context = body.context?.trim() ?? "";
  const language = body.language?.trim();
  const llmModel = parseLlmModel(body.llmModel);

  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }
  if (!llmModel) {
    res.status(400).json({ error: `llmModel must be one of: ${supportedLlmModels.join(", ")}` });
    return;
  }

  try {
    const reply = await createAiChefReply(message, history, selectedItems, extraIngredients, context, language, llmModel);
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "AI chat failed." });
  }
});

aiRouter.post("/chat/stream", async (req, res) => {
  const body = req.body as AiChatBody;
  const message = body.message?.trim();
  const history = sanitizeChatHistory(body.history);
  const selectedItems = sanitizeSelectedItems(body.selectedItems);
  const extraIngredients = body.extraIngredients?.trim() ?? "";
  const context = body.context?.trim() ?? "";
  const language = body.language?.trim();
  const llmModel = parseLlmModel(body.llmModel);

  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }
  if (!llmModel) {
    res.status(400).json({ error: `llmModel must be one of: ${supportedLlmModels.join(", ")}` });
    return;
  }

  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const input = buildAiChefInput(message, history, selectedItems, extraIngredients, context, language);
  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: llmModel,
        input,
        stream: true
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI chat failed (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error("OpenAI returned an empty stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullReply = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseBlocks(buffer);
      buffer = parsed.rest;

      for (const block of parsed.blocks) {
        const rawData = extractSseData(block);
        if (!rawData || rawData === "[DONE]") {
          continue;
        }

        let eventPayload: unknown;
        try {
          eventPayload = JSON.parse(rawData);
        } catch {
          continue;
        }

        if (typeof eventPayload !== "object" || eventPayload === null) {
          continue;
        }

        const type = (eventPayload as { type?: unknown }).type;
        if (type === "response.output_text.delta") {
          const delta = (eventPayload as { delta?: unknown }).delta;
          if (typeof delta === "string" && delta.length > 0) {
            fullReply += delta;
            writeSseEvent(res, "token", { delta });
          }
          continue;
        }

        if (type === "response.output_text.done") {
          const text = (eventPayload as { text?: unknown }).text;
          if (typeof text === "string" && !fullReply) {
            fullReply = text;
          }
          continue;
        }

        if (type === "error") {
          const messageText = (eventPayload as { message?: unknown }).message;
          throw new Error(typeof messageText === "string" && messageText.trim() ? messageText : "OpenAI stream error.");
        }
      }
    }

    writeSseEvent(res, "done", { reply: fullReply });
  } catch (error) {
    const isAbortError =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError");
    if (!isAbortError) {
      writeSseEvent(res, "error", { error: error instanceof Error ? error.message : "AI chat stream failed." });
    }
  } finally {
    res.end();
  }
});
