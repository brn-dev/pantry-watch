import { Router } from "express";
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
};

type ParseShoppingListTextBody = {
  text?: string;
  currentDate?: string;
};

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

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
            unit: z.string().min(1),
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
  if (!text) {
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
  currentDate: string
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
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                `Extract pantry items from user text. Current date is ${currentDate}. ` +
                "Use only one of the provided available locations for locationName. Never invent or alter location names. " +
                "If location is missing, set the location to '-'. Abbreviate the quantity if possible, i.e. liter -> L. " +
                "Use quantity=1 and unit='-' if omitted. expirationDate must be YYYY-MM-DD or null."
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
          unit: z.string().min(1),
          shop: z.string().min(1)
        })
        .strict()
    )
  })
  .strict();

const parseShoppingListItemsWithStructuredOutput = async (
  text: string,
  currentDate: string
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
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                `Extract shopping list items from natural language. Current date is ${currentDate}. ` +
                "Each item must include name, quantity, unit, and shop. " +
                "If quantity is missing, use 1. If unit is missing, use 'pcs'. If shop is missing, use '-'."
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

  try {
    const items = await parseItemsWithStructuredOutput(text, availableLocations, currentDate);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Text parsing failed." });
  }
});

aiRouter.post("/shopping-list/text-to-items", async (req, res) => {
  const body = req.body as ParseShoppingListTextBody;
  const text = body.text?.trim();
  const currentDate = body.currentDate?.trim();

  if (!text) {
    res.status(400).json({ error: "Text is required." });
    return;
  }
  if (!currentDate || !dateStringSchema.safeParse(currentDate).success) {
    res.status(400).json({ error: "currentDate is required in YYYY-MM-DD format." });
    return;
  }

  try {
    const items = await parseShoppingListItemsWithStructuredOutput(text, currentDate);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Shopping list parsing failed." });
  }
});
