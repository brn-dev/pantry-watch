import type { HouseholdCredential } from "../utils/localPersistence";

type TokenCheckResponse = {
  valid: boolean;
};

export async function checkHouseholdToken(credential: HouseholdCredential): Promise<boolean> {
  const response = await fetch("/api/auth/check-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      householdId: credential.householdId.trim(),
      accessToken: credential.accessToken
    })
  });

  if (!response.ok) {
    return false;
  }

  const data = (await response.json()) as TokenCheckResponse;
  return data.valid === true;
}
