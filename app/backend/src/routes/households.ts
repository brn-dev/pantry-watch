import { Router } from "express";
import { findHousehold, publicHouseholds } from "../store.js";

export const householdsRouter = Router();

householdsRouter.get("/", async (_req, res) => {
  res.json({ households: await publicHouseholds() });
});

householdsRouter.get("/:householdId/locations-with-items", async (req, res) => {
  const household = await findHousehold(req.params.householdId);
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
