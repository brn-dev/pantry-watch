import type { Household, PantryLocation as Location, ShoppingListItem } from "@shared/models";

export const households: Household[] = [
  {
    id: "household-1",
    name: "Default Household",
    locations: [
      {
        id: "loc-fridge",
        name: "Fridge",
        items: [
          { id: "item-milk", name: "Milk", quantity: 1, unit: "liter", expirationDate: "2026-04-25" },
          { id: "item-eggs", name: "Eggs", quantity: 6, unit: "pieces", expirationDate: "2026-04-28" }
        ]
      },
      {
        id: "loc-pantry",
        name: "Pantry",
        items: [{ id: "item-pasta", name: "Pasta", quantity: 2, unit: "packs", expirationDate: "2026-05-25" }]
      }
    ],
    shoppingList: [
      { id: "shopping-item-bread", name: "Bread", amount: "1 loaf", shop: "Bakery", done: false },
      { id: "shopping-item-tomatoes", name: "Tomatoes", amount: "500 g", shop: "Supermarket", done: true }
    ]
  }
];

let idCounter = 1;

export const makeId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
};

export const findHousehold = (householdId: string): Household | undefined => {
  return households.find((household) => household.id === householdId);
};

export const findLocation = (household: Household, locationId: string): Location | undefined => {
  return household.locations.find((location) => location.id === locationId);
};

export const findShoppingListItem = (household: Household, itemId: string): ShoppingListItem | undefined => {
  return household.shoppingList.find((item) => item.id === itemId);
};

export const normalizeText = (value: string): string => {
  return value.trim().toLowerCase();
};

export const normalizeExpirationDate = (rawValue: unknown): string | null => {
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
