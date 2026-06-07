import { Router } from "express";
import { hasHouseholdAccess } from "../auth.js";

export const authRouter = Router();

authRouter.post("/check-token", async (req, res) => {
  const householdId = typeof req.body?.householdId === "string" ? req.body.householdId.trim() : "";
  const accessToken = typeof req.body?.accessToken === "string" ? req.body.accessToken : "";

  res.json({
    valid: !!householdId && !!accessToken && (await hasHouseholdAccess(householdId, accessToken))
  });
});
