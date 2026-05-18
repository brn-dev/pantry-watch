import { Router } from "express";
import type { ShoppingListItem } from "@shared/models";
import { findHousehold, findShoppingListItem, makeId } from "../mockStore.js";

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

shoppingListRouter.get("/", (req, res) => {
  const household = findHousehold(getHouseholdId(req.params));
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  res.json({ items: household.shoppingList });
});

shoppingListRouter.post("/items", (req, res) => {
  const household = findHousehold(getHouseholdId(req.params));
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

  household.shoppingList.push(item);
  res.status(201).json(item);
});

shoppingListRouter.patch("/items/:itemId", (req, res) => {
  const household = findHousehold(getHouseholdId(req.params));
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

  res.json(item);
});

shoppingListRouter.delete("/items/:itemId", (req, res) => {
  const household = findHousehold(getHouseholdId(req.params));
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const itemIndex = household.shoppingList.findIndex((item) => item.id === req.params.itemId);
  if (itemIndex < 0) {
    res.status(404).json({ error: "Shopping list item not found." });
    return;
  }

  const [deletedItem] = household.shoppingList.splice(itemIndex, 1);
  res.json(deletedItem);
});

shoppingListRouter.delete("/done", (req, res) => {
  const household = findHousehold(getHouseholdId(req.params));
  if (!household) {
    res.status(404).json({ error: "Household not found." });
    return;
  }

  const deletedItems = household.shoppingList.filter((item) => item.done);
  household.shoppingList = household.shoppingList.filter((item) => !item.done);
  res.json({ deletedItems });
});
