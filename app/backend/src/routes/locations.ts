import { Router } from "express";
import type { PantryLocation as Location } from "@shared/models";
import { findHousehold, findLocation, makeId, normalizeText } from "../mockStore.js";

type CreateLocationBody = {
  name?: string;
};

type UpdateLocationBody = {
  name?: string;
};

export const locationsRouter = Router({ mergeParams: true });

const getHouseholdId = (params: Record<string, string>): string => {
  return params.householdId;
};

locationsRouter.post("/", (req, res) => {
  const household = findHousehold(getHouseholdId(req.params));
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

locationsRouter.patch("/:locationId", (req, res) => {
  const household = findHousehold(getHouseholdId(req.params));
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

locationsRouter.delete("/:locationId", (req, res) => {
  const household = findHousehold(getHouseholdId(req.params));
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
