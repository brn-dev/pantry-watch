import { Router } from "express";
import { findHousehold, households } from "../mockStore.js";

export const householdsRouter = Router();

householdsRouter.get("/", (_req, res) => {
  res.json({ households });
});

householdsRouter.get("/:householdId/locations-with-items", (req, res) => {
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
