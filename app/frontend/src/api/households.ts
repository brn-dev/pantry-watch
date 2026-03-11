import type { Household, PantryLocation } from "@shared/models";
import type { HouseholdsResponse } from "../types/app";
import { assertApiOk } from "./http";

export async function fetchHouseholds(): Promise<Household[]> {
  const response = await fetch("/api/households");
  assertApiOk(response, "Failed to load households");

  const data = (await response.json()) as HouseholdsResponse;
  return data.households;
}

export async function createHouseholdLocation(householdId: string, locationName: string): Promise<PantryLocation> {
  const response = await fetch(`/api/households/${householdId}/locations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: locationName.trim() })
  });

  assertApiOk(response, "Failed to create location");

  return (await response.json()) as PantryLocation;
}

export async function updateHouseholdLocation(
  householdId: string,
  locationId: string,
  locationName: string
): Promise<void> {
  const response = await fetch(`/api/households/${householdId}/locations/${locationId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: locationName.trim() })
  });

  assertApiOk(response, "Failed to update location");
}

export async function createHouseholdItem(
  householdId: string,
  locationId: string,
  input: { name: string; quantity: number; unit: string; expirationDate: string | null }
): Promise<void> {
  const response = await fetch(`/api/households/${householdId}/locations/${locationId}/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: input.name.trim(),
      quantity: input.quantity,
      unit: input.unit.trim() || "pcs",
      expirationDate: input.expirationDate
    })
  });

  assertApiOk(response, "Failed to add item");
}

export async function patchHouseholdItem(
  householdId: string,
  itemId: string,
  input: Partial<{
    name: string;
    quantity: number;
    unit: string;
    expirationDate: string | null;
    locationId: string;
  }>
): Promise<void> {
  const response = await fetch(`/api/households/${householdId}/items/${itemId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  assertApiOk(response, "Failed to update item");
}

export async function deleteHouseholdItem(householdId: string, itemId: string): Promise<void> {
  const response = await fetch(`/api/households/${householdId}/items/${itemId}`, {
    method: "DELETE"
  });

  assertApiOk(response, "Failed to remove item");
}
