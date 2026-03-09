import cors from "cors";
import express from "express";
import morgan from "morgan";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aiRouter } from "./routes/ai.js";
import type { Household, PantryItem as Item, PantryLocation as Location } from "@shared/models";

type CreateLocationBody = {
  name?: string;
};

type UpdateLocationBody = {
  name?: string;
};

type CreateItemBody = {
  name?: string;
  quantity?: number;
  unit?: string;
  expirationDate?: string | null;
};

type UpdateItemBody = {
  name?: string;
  quantity?: number;
  unit?: string;
  expirationDate?: string | null;
  locationId?: string;
};

type VoiceTextBody = {
  householdId?: string;
};

type ParseVoiceTextBody = {
  text?: string;
};

type AiChefMessage = {
  role: "user" | "assistant";
  content: string;
};

type AiChefChatBody = {
  householdId?: string;
  householdIds?: string[];
  selectedItemIds?: string[];
  extraIngredients?: string;
  context?: string;
  message?: string;
  history?: AiChefMessage[];
};

type ParsedItem = {
  locationName: string;
  name: string;
  quantity: number;
  unit: string;
  expirationDate: string | null;
};

const loadBackendEnvFile = (): void => {
  const currentFilePath = fileURLToPath(import.meta.url);
  const backendRootPath = resolve(dirname(currentFilePath), "..");
  const envFilePath = resolve(backendRootPath, ".env.local");
  if (!existsSync(envFilePath)) {
    return;
  }

  const envFileContent = readFileSync(envFilePath, "utf8");
  const lines = envFileContent.split(/\r?\n/u);

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const delimiterIndex = trimmedLine.indexOf("=");
    if (delimiterIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, delimiterIndex).trim();
    const rawValue = trimmedLine.slice(delimiterIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const isQuoted = rawValue.length >= 2 && rawValue.startsWith("\"") && rawValue.endsWith("\"");
    process.env[key] = isQuoted ? rawValue.slice(1, -1) : rawValue;
  }
};

loadBackendEnvFile();

const app = express();
const port = Number(process.env.PORT ?? 3000);

const households: Household[] = [
  {
    id: "household-1",
    name: "Default Household",
    locations: [
      {
        id: "loc-fridge",
        name: "Fridge",
        items: [
          { id: "item-milk", name: "Milk", quantity: 1, unit: "liter", expirationDate: "2026-03-12" },
          { id: "item-eggs", name: "Eggs", quantity: 6, unit: "pieces", expirationDate: "2026-03-09" }
        ]
      },
      {
        id: "loc-pantry",
        name: "Pantry",
        items: [{ id: "item-pasta", name: "Pasta", quantity: 2, unit: "packs", expirationDate: "2026-03-25" }]
      }
    ]
  }
];

let idCounter = 1;

const makeId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
};

const findHousehold = (householdId: string): Household | undefined => {
  return households.find((household) => household.id === householdId);
};

const findLocation = (household: Household, locationId: string): Location | undefined => {
  return household.locations.find((location) => location.id === locationId);
};

const normalizeText = (value: string): string => {
  return value.trim().toLowerCase();
};

const parseNumber = (rawQuantity: string): number => {
  const quantity = Number(rawQuantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
};

const normalizeExpirationDate = (rawValue: unknown): string | null => {
  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  if (typeof rawValue !== "string") {
    throw new Error("Expiration date must be a string in YYYY-MM-DD format or null.");
  }

  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return null;
  }

  const isoDateParts = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(trimmedValue);
  const dotDateParts = /^(?<day>\d{2})\.(?<month>\d{2})\.(?<year>\d{4})$/u.exec(trimmedValue);
  const groups = isoDateParts?.groups ?? dotDateParts?.groups;

  if (!groups) {
    throw new Error("Expiration date must use YYYY-MM-DD format.");
  }

  const year = Number(groups.year);
  const month = Number(groups.month);
  const day = Number(groups.day);
  const normalizedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    normalizedDate.getUTCFullYear() !== year ||
    normalizedDate.getUTCMonth() + 1 !== month ||
    normalizedDate.getUTCDate() !== day
  ) {
    throw new Error("Expiration date is not a valid calendar date.");
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const extractExpirationDateFromItemText = (itemText: string): { itemTextWithoutDate: string; expirationDate: string | null } => {
  const sourceText = itemText.trim();
  const datePatterns = [
    /\b(?:best\s*before|bbd|mhd)\s*[:=]?\s*(?<date>\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\b/iu,
    /\b(?<date>\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\s*(?:best\s*before|bbd|mhd)\b/iu,
    /\b(?:best\s*before|bbd|mhd)\s*(?<date>\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\b/iu
  ];

  for (const pattern of datePatterns) {
    const match = pattern.exec(sourceText);
    const rawDate = match?.groups?.date;
    if (!match || !rawDate) {
      continue;
    }

    try {
      const expirationDate = normalizeExpirationDate(rawDate);
      const itemTextWithoutDate = `${sourceText.slice(0, match.index)} ${sourceText.slice(match.index + match[0].length)}`
        .replace(/\s+/g, " ")
        .replace(/^[\s,;:-]+|[\s,;:-]+$/g, "")
        .trim();

      return {
        itemTextWithoutDate: itemTextWithoutDate || sourceText,
        expirationDate
      };
    } catch {
      continue;
    }
  }

  return {
    itemTextWithoutDate: sourceText,
    expirationDate: null
  };
};

const parseItemCore = (itemText: string): { name: string; quantity: number; unit: string; expirationDate: string | null } => {
  const { itemTextWithoutDate, expirationDate } = extractExpirationDateFromItemText(itemText);
  const match = /^(?<quantity>\d+(?:\.\d+)?)\s+(?<unit>[a-zA-Z]+)\s+(?<name>.+)$/u.exec(itemTextWithoutDate.trim());
  if (!match?.groups) {
    return {
      name: itemTextWithoutDate.trim(),
      quantity: 1,
      unit: "pcs",
      expirationDate
    };
  }

  return {
    name: match.groups.name.trim(),
    quantity: parseNumber(match.groups.quantity),
    unit: match.groups.unit.trim(),
    expirationDate
  };
};

const parseItemsFromText = (text: string): ParsedItem[] => {
  return text
    .split(/[\n,;]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const locationPrefixMatch = /^(?<location>[^:]+):\s*(?<itemText>.+)$/u.exec(segment);
      if (locationPrefixMatch?.groups) {
        const parsedItemCore = parseItemCore(locationPrefixMatch.groups.itemText);
        return {
          locationName: locationPrefixMatch.groups.location.trim(),
          ...parsedItemCore
        };
      }

      const locationSuffixMatch = /^(?<itemText>.+)\s+in\s+(?<location>[a-zA-Z][\w\s-]*)$/iu.exec(segment);
      if (locationSuffixMatch?.groups) {
        const parsedItemCore = parseItemCore(locationSuffixMatch.groups.itemText);
        return {
          locationName: locationSuffixMatch.groups.location.trim(),
          ...parsedItemCore
        };
      }

      return {
        locationName: "General",
        ...parseItemCore(segment)
      };
    });
};

type RecipeTemplate = {
  name: string;
  requiredAny: string[];
  optional: string[];
  tags: string[];
  instruction: string;
};

const recipeTemplates: RecipeTemplate[] = [
  {
    name: "Pasta with Tomato-Garlic Sauce",
    requiredAny: ["pasta", "tomato", "tomatoes"],
    optional: ["garlic", "olive oil", "parmesan", "cheese", "basil"],
    tags: ["vegetarian", "quick"],
    instruction: "Cook pasta, simmer tomatoes with garlic and olive oil, toss together, finish with parmesan."
  },
  {
    name: "Vegetable Omelette",
    requiredAny: ["egg", "eggs"],
    optional: ["tomato", "onion", "cheese", "spinach", "pepper"],
    tags: ["quick", "high-protein", "vegetarian"],
    instruction: "Whisk eggs, cook vegetables in a pan, add eggs, fold and serve."
  },
  {
    name: "Creamy Pantry Soup",
    requiredAny: ["milk", "cream", "potato", "potatoes", "onion"],
    optional: ["carrot", "garlic", "pepper", "cheese"],
    tags: ["comfort", "vegetarian"],
    instruction: "Saute vegetables, add water or stock, simmer until soft, blend, then finish with milk."
  },
  {
    name: "Stir-Fried Rice",
    requiredAny: ["rice"],
    optional: ["egg", "eggs", "carrot", "peas", "onion", "soy sauce"],
    tags: ["quick"],
    instruction: "Stir-fry aromatics, add cooked rice and vegetables, season and finish with egg if available."
  }
];

const splitIngredients = (rawText: string): string[] => {
  return rawText
    .toLowerCase()
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

const buildAiChefReply = (
  selectedIngredientNames: string[],
  extraIngredients: string,
  context: string,
  userMessage: string
): string => {
  const normalizedSelected = selectedIngredientNames.map((ingredient) => ingredient.toLowerCase());
  const normalizedExtra = splitIngredients(extraIngredients);
  const ingredientPool = [...normalizedSelected, ...normalizedExtra];
  const contextText = `${context} ${userMessage}`.toLowerCase();

  const scoredRecipes = recipeTemplates
    .map((recipe) => {
      const requiredHits = recipe.requiredAny.filter((token) =>
        ingredientPool.some((ingredient) => ingredient.includes(token))
      ).length;
      const optionalHits = recipe.optional.filter((token) =>
        ingredientPool.some((ingredient) => ingredient.includes(token))
      ).length;

      let score = requiredHits * 4 + optionalHits;
      if (contextText.includes("vegetarian") && recipe.tags.includes("vegetarian")) {
        score += 2;
      }
      if ((contextText.includes("quick") || contextText.includes("fast")) && recipe.tags.includes("quick")) {
        score += 2;
      }
      if ((contextText.includes("protein") || contextText.includes("high-protein")) && recipe.tags.includes("high-protein")) {
        score += 2;
      }

      return { recipe, score, requiredHits, optionalHits };
    })
    .sort((left, right) => right.score - left.score);

  const topRecipes = scoredRecipes.filter((entry) => entry.score > 0).slice(0, 3);
  if (!topRecipes.length) {
    return [
      "I do not have a strong recipe match yet.",
      "Try selecting more pantry items or adding context like dietary goals, cooking time, and cuisine."
    ].join("\n");
  }

  const recipeLines = topRecipes.map((entry, index) => {
    const confidence = entry.requiredHits > 0 ? "strong" : "partial";
    return [
      `${index + 1}. ${entry.recipe.name} (${confidence} match)`,
      `Why: ${entry.requiredHits} core + ${entry.optionalHits} supporting ingredients matched.`,
      `How: ${entry.recipe.instruction}`
    ].join("\n");
  });

  return ["Here are my best recipe suggestions:", ...recipeLines].join("\n\n");
};

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));
app.use("/api/ai", aiRouter);

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "Backend is running. Open http://localhost:5173 for the frontend in dev mode."
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/hello", (_req, res) => {
  res.json({ message: "Backend is reachable." });
});

app.get("/api/households/:householdId/locations-with-items", (req, res) => {
  const household = findHousehold(req.params.householdId);
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  res.json({
    householdId: household.id,
    householdName: household.name,
    locations: household.locations
  });
});

app.post("/api/households/:householdId/locations", (req, res) => {
  const household = findHousehold(req.params.householdId);
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const body = req.body as CreateLocationBody;
  const name = body.name?.trim();
  if (!name) {
    res.status(400).json({ error: "Location name is required." });
    return;
  }

  const duplicate = household.locations.some((location) => normalizeText(location.name) === normalizeText(name));
  if (duplicate) {
    res.status(409).json({ error: "Location already exists." });
    return;
  }

  const location: Location = {
    id: makeId("loc"),
    name,
    items: []
  };

  household.locations.push(location);
  res.status(201).json(location);
});

app.patch("/api/households/:householdId/locations/:locationId", (req, res) => {
  const household = findHousehold(req.params.householdId);
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const location = findLocation(household, req.params.locationId);
  if (!location) {
    res.status(404).json({ error: "Location not found." });
    return;
  }

  const body = req.body as UpdateLocationBody;
  const nextName = body.name?.trim();
  if (!nextName) {
    res.status(400).json({ error: "Location name is required." });
    return;
  }

  const duplicate = household.locations.some(
    (candidate) => candidate.id !== location.id && normalizeText(candidate.name) === normalizeText(nextName)
  );
  if (duplicate) {
    res.status(409).json({ error: "Location name already in use." });
    return;
  }

  location.name = nextName;
  res.json(location);
});

app.delete("/api/households/:householdId/locations/:locationId", (req, res) => {
  const household = findHousehold(req.params.householdId);
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const locationIndex = household.locations.findIndex((location) => location.id === req.params.locationId);
  if (locationIndex < 0) {
    res.status(404).json({ error: "Location not found." });
    return;
  }

  const [deletedLocation] = household.locations.splice(locationIndex, 1);
  res.json(deletedLocation);
});

app.post("/api/households/:householdId/locations/:locationId/items", (req, res) => {
  const household = findHousehold(req.params.householdId);
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const location = findLocation(household, req.params.locationId);
  if (!location) {
    res.status(404).json({ error: "Location not found." });
    return;
  }

  const body = req.body as CreateItemBody;
  const name = body.name?.trim();
  if (!name) {
    res.status(400).json({ error: "Item name is required." });
    return;
  }

  const quantity = Number(body.quantity ?? 1);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    res.status(400).json({ error: "Quantity must be greater than zero." });
    return;
  }

  let expirationDate: string | null;
  try {
    expirationDate = normalizeExpirationDate(body.expirationDate);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid Expiration date." });
    return;
  }

  const item: Item = {
    id: makeId("item"),
    name,
    quantity,
    unit: body.unit?.trim() || "pcs",
    expirationDate
  };

  location.items.push(item);
  res.status(201).json(item);
});

app.patch("/api/households/:householdId/items/:itemId", (req, res) => {
  const household = findHousehold(req.params.householdId);
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const body = req.body as UpdateItemBody;

  let sourceLocation: Location | undefined;
  let itemIndex = -1;

  for (const location of household.locations) {
    const candidateIndex = location.items.findIndex((item) => item.id === req.params.itemId);
    if (candidateIndex >= 0) {
      sourceLocation = location;
      itemIndex = candidateIndex;
      break;
    }
  }

  if (!sourceLocation || itemIndex < 0) {
    res.status(404).json({ error: "Item not found." });
    return;
  }

  const item = sourceLocation.items[itemIndex];

  if (body.name !== undefined) {
    const nextName = body.name.trim();
    if (!nextName) {
      res.status(400).json({ error: "Item name must not be empty." });
      return;
    }
    item.name = nextName;
  }

  if (body.quantity !== undefined) {
    if (!Number.isFinite(body.quantity) || body.quantity <= 0) {
      res.status(400).json({ error: "Quantity must be greater than zero." });
      return;
    }
    item.quantity = body.quantity;
  }

  if (body.unit !== undefined) {
    const nextUnit = body.unit.trim();
    if (!nextUnit) {
      res.status(400).json({ error: "Unit must not be empty." });
      return;
    }
    item.unit = nextUnit;
  }

  if (body.expirationDate !== undefined) {
    try {
      item.expirationDate = normalizeExpirationDate(body.expirationDate);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid Expiration date." });
      return;
    }
  }

  if (body.locationId && body.locationId !== sourceLocation.id) {
    const targetLocation = findLocation(household, body.locationId);
    if (!targetLocation) {
      res.status(404).json({ error: "Target location not found." });
      return;
    }

    const [movedItem] = sourceLocation.items.splice(itemIndex, 1);
    targetLocation.items.push(movedItem);
  }

  res.json(item);
});

app.delete("/api/households/:householdId/items/:itemId", (req, res) => {
  const household = findHousehold(req.params.householdId);
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  for (const location of household.locations) {
    const itemIndex = location.items.findIndex((item) => item.id === req.params.itemId);
    if (itemIndex >= 0) {
      const [deletedItem] = location.items.splice(itemIndex, 1);
      res.json(deletedItem);
      return;
    }
  }

  res.status(404).json({ error: "Item not found." });
});

app.post("/api/voice/recording-text", (req, res) => {
  const body = req.body as VoiceTextBody;
  const householdId = body.householdId ?? "household-1";
  const household = findHousehold(householdId);

  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const locationSummaries = household.locations.map(
    (location) =>
      `${location.name}: ${location.items.map((item) => `${item.quantity} ${item.unit} ${item.name}${item.expirationDate ? ` (expiration ${item.expirationDate})` : ""}`).join(", ") || "no items"}`
  );

  const text = [
    `Household ${household.name}.`,
    "Current pantry state:",
    ...locationSummaries,
    "Say changes like: 'Fridge: 2 pcs tomatoes, Pantry: 3 packs pasta' or '1 liter milk in Fridge'."
  ].join(" ");

  res.json({ text });
});

app.post("/api/voice/text-to-items", (req, res) => {
  const body = req.body as ParseVoiceTextBody;
  const text = body.text?.trim();

  if (!text) {
    res.status(400).json({ error: "Text is required." });
    return;
  }

  const parsedItems = parseItemsFromText(text);
  res.json({ items: parsedItems });
});

app.post("/api/ai-chef/chat", (req, res) => {
  const body = req.body as AiChefChatBody;
  const householdIds =
    Array.isArray(body.householdIds) && body.householdIds.length
      ? body.householdIds.map((householdId) => householdId.trim()).filter((householdId) => householdId.length > 0)
      : body.householdId?.trim()
        ? [body.householdId.trim()]
        : [];
  const selectedIds = Array.isArray(body.selectedItemIds) ? body.selectedItemIds : [];
  const extraIngredients = body.extraIngredients?.trim() ?? "";
  const context = body.context?.trim() ?? "";
  const message = body.message?.trim() ?? "";

  if (!householdIds.length) {
    res.status(400).json({ error: "At least one household is required." });
    return;
  }

  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  const householdsForChef = householdIds
    .map((householdId) => findHousehold(householdId))
    .filter((household): household is Household => household !== undefined);
  if (!householdsForChef.length) {
    res.status(404).json({ error: "No valid households found." });
    return;
  }

  const allItems = householdsForChef.flatMap((household) => household.locations.flatMap((location) => location.items));
  const selectedItems = allItems.filter((item) => selectedIds.includes(item.id));
  const selectedIngredientNames = selectedItems.map((item) => item.name);

  const reply = buildAiChefReply(selectedIngredientNames, extraIngredients, context, message);
  res.json({ reply });
});

app.get("/api/households", (_req, res) => {
  res.json({ households });
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
