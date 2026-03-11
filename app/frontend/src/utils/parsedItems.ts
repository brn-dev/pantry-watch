import type { ParsedItem } from "../types/quickAdd";

export function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function mapParsedItemFromApi(parsedItemApi: Omit<ParsedItem, "id">): ParsedItem {
  return {
    id: createParsedItemId(),
    ...parsedItemApi
  };
}

export function updateParsedItemById(
  parsedItems: ParsedItem[],
  parsedItemId: string,
  input: { name: string; quantity: number; unit: string; expirationDate: string | null; locationName: string }
): ParsedItem[] {
  return parsedItems.map((parsedItem) => {
    if (parsedItem.id !== parsedItemId) {
      return parsedItem;
    }

    return {
      ...parsedItem,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      expirationDate: input.expirationDate,
      locationName: input.locationName
    };
  });
}

export function updateParsedItemExpirationDateById(
  parsedItems: ParsedItem[],
  parsedItemId: string,
  value: string
): ParsedItem[] {
  return parsedItems.map((parsedItem) => {
    if (parsedItem.id !== parsedItemId) {
      return parsedItem;
    }

    return {
      ...parsedItem,
      expirationDate: value || null
    };
  });
}

function createParsedItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `parsed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
