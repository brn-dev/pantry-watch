import { Router } from "express";
import type { PantryItem as Item, PantryLocation as Location } from "@shared/models";
import {
  addPantryItem,
  deletePantryItem,
  findHousehold,
  findLocation,
  makeId,
  movePantryItem,
  normalizeExpirationDate,
  updatePantryItem
} from "../store.js";

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

export const pantryItemsRouter = Router({ mergeParams: true });

const getHouseholdId = (params: Record<string, string>): string => {
  return params.householdId;
};

pantryItemsRouter.post("/locations/:locationId/items", async (req, res) => {
  const household = await findHousehold(getHouseholdId(req.params));
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

  await addPantryItem(household.id, location.id, item);
  res.status(201).json(item);
});

pantryItemsRouter.patch("/items/:itemId", async (req, res) => {
  const household = await findHousehold(getHouseholdId(req.params));
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

    await movePantryItem(household.id, item.id, item, targetLocation.id);
    res.json(item);
    return;
  }

  await updatePantryItem(household.id, item.id, item);
  res.json(item);
});

pantryItemsRouter.delete("/items/:itemId", async (req, res) => {
  const household = await findHousehold(getHouseholdId(req.params));
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  for (const location of household.locations) {
    const itemIndex = location.items.findIndex((item) => item.id === req.params.itemId);
    if (itemIndex >= 0) {
      const deletedItem = location.items[itemIndex];
      await deletePantryItem(household.id, deletedItem.id);
      res.json(deletedItem);
      return;
    }
  }

  res.status(404).json({ error: "Item not found." });
});
