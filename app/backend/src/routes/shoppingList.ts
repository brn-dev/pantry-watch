import { Router } from "express";
import type { ShoppingListItem } from "@shared/models";
import { notifyHouseholdChanged } from "../realtime.js";
import {
  addShoppingListItem,
  deleteDoneShoppingListItems,
  deleteShoppingListItem,
  findHousehold,
  findShoppingListItem,
  makeId,
  updateShoppingListItem
} from "../store.js";

type CreateShoppingListItemBody = {
  name?: string;
  amount?: string;
  shop?: string;
  done?: boolean;
};

type UpdateShoppingListItemBody = Partial<CreateShoppingListItemBody>;

export const shoppingListRouter = Router({ mergeParams: true });

const getHouseholdId = (params: Record<string, string>): string => {
  return params.householdId;
};

shoppingListRouter.get("/", async (req, res) => {
  const household = await findHousehold(getHouseholdId(req.params));
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  res.json({ items: household.shoppingList });
});

shoppingListRouter.post("/items", async (req, res) => {
  const household = await findHousehold(getHouseholdId(req.params));
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const body = req.body as CreateShoppingListItemBody;
  const name = body.name?.trim();
  if (!name) {
    res.status(400).json({ error: "Shopping list item name is required." });
    return;
  }

  const item: ShoppingListItem = {
    id: makeId("shopping-item"),
    name,
    amount: body.amount?.trim() ?? "",
    shop: body.shop?.trim() || "?",
    done: body.done ?? false
  };

  await addShoppingListItem(household.id, item);
  notifyHouseholdChanged(household.id, "shopping-list");
  res.status(201).json(item);
});

shoppingListRouter.patch("/items/:itemId", async (req, res) => {
  const household = await findHousehold(getHouseholdId(req.params));
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const item = findShoppingListItem(household, req.params.itemId);
  if (!item) {
    res.status(404).json({ error: "Shopping list item not found." });
    return;
  }

  const body = req.body as UpdateShoppingListItemBody;

  if (body.name !== undefined) {
    const nextName = body.name.trim();
    if (!nextName) {
      res.status(400).json({ error: "Shopping list item name must not be empty." });
      return;
    }
    item.name = nextName;
  }

  if (body.amount !== undefined) {
    item.amount = body.amount.trim();
  }

  if (body.shop !== undefined) {
    item.shop = body.shop.trim() || "?";
  }

  if (body.done !== undefined) {
    item.done = body.done;
  }

  await updateShoppingListItem(household.id, item.id, item);
  notifyHouseholdChanged(household.id, "shopping-list");
  res.json(item);
});

shoppingListRouter.delete("/items/:itemId", async (req, res) => {
  const household = await findHousehold(getHouseholdId(req.params));
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const itemIndex = household.shoppingList.findIndex((item) => item.id === req.params.itemId);
  if (itemIndex < 0) {
    res.status(404).json({ error: "Shopping list item not found." });
    return;
  }

  const deletedItem = household.shoppingList[itemIndex];
  await deleteShoppingListItem(household.id, deletedItem.id);
  notifyHouseholdChanged(household.id, "shopping-list");
  res.json(deletedItem);
});

shoppingListRouter.delete("/done", async (req, res) => {
  const household = await findHousehold(getHouseholdId(req.params));
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const deletedItems = household.shoppingList.filter((item) => item.done);
  await deleteDoneShoppingListItems(household.id);
  notifyHouseholdChanged(household.id, "shopping-list");
  res.json({ deletedItems });
});
