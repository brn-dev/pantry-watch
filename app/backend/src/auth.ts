import type { RequestHandler } from "express";
import { findHousehold } from "./store.js";

const AUTHENTICATED_HOUSEHOLD_ID_HEADER = "x-household-id";
const ACCESS_TOKEN_HEADER = "x-access-token";

const getHeaderValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
};

const getHouseholdIdFromRequest = (path: string): string | null => {
  const match = /^\/households\/(?<householdId>[^/]+)/u.exec(path);
  return match?.groups?.householdId ? decodeURIComponent(match.groups.householdId) : null;
};

export const hasHouseholdAccess = async (householdId: string, accessToken: string): Promise<boolean> => {
  const household = await findHousehold(householdId);
  return !!household && household.accessToken === accessToken;
};

export const requireHouseholdAccess: RequestHandler = async (req, res, next) => {
  const providedHouseholdId = getHeaderValue(req.headers[AUTHENTICATED_HOUSEHOLD_ID_HEADER]);
  const providedAccessToken = getHeaderValue(req.headers[ACCESS_TOKEN_HEADER]);

  if (!providedHouseholdId || !providedAccessToken) {
    res.status(401).json({ error: "Household id and access token are required." });
    return;
  }

  const authenticatedHousehold = await findHousehold(providedHouseholdId);
  if (!(await hasHouseholdAccess(providedHouseholdId, providedAccessToken)) || !authenticatedHousehold) {
    res.status(401).json({ error: "Invalid household id or access token." });
    return;
  }

  const routeHouseholdId = getHouseholdIdFromRequest(req.path);
  if (routeHouseholdId && routeHouseholdId !== authenticatedHousehold.id) {
    res.status(403).json({ error: "Access token does not allow access to this household." });
    return;
  }

  next();
};
