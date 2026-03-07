import cors from "cors";
import express from "express";
import morgan from "morgan";

type Item = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
};

type Location = {
  id: string;
  name: string;
  items: Item[];
};

type Household = {
  id: string;
  name: string;
  locations: Location[];
};

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
};

type UpdateItemBody = {
  name?: string;
  quantity?: number;
  unit?: string;
  locationId?: string;
};

type VoiceTextBody = {
  householdId?: string;
};

type ParseVoiceTextBody = {
  text?: string;
};

type ParsedItem = {
  locationName: string;
  name: string;
  quantity: number;
  unit: string;
};

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
          { id: "item-milk", name: "Milk", quantity: 1, unit: "liter" },
          { id: "item-eggs", name: "Eggs", quantity: 6, unit: "pieces" }
        ]
      },
      {
        id: "loc-pantry",
        name: "Pantry",
        items: [{ id: "item-pasta", name: "Pasta", quantity: 2, unit: "packs" }]
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

const parseItemCore = (itemText: string): Omit<Item, "id"> => {
  const match = /^(?<quantity>\d+(?:\.\d+)?)\s+(?<unit>[a-zA-Z]+)\s+(?<name>.+)$/u.exec(itemText.trim());
  if (!match?.groups) {
    return {
      name: itemText.trim(),
      quantity: 1,
      unit: "pcs"
    };
  }

  return {
    name: match.groups.name.trim(),
    quantity: parseNumber(match.groups.quantity),
    unit: match.groups.unit.trim()
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

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

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

  const item: Item = {
    id: makeId("item"),
    name,
    quantity,
    unit: body.unit?.trim() || "pcs"
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
      `${location.name}: ${location.items.map((item) => `${item.quantity} ${item.unit} ${item.name}`).join(", ") || "no items"}`
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

app.get("/api/households", (_req, res) => {
  res.json({ households });
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
