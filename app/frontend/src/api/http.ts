import type { ErrorResponse } from "../types/app";
import { getStoredHouseholdCredentials, type HouseholdCredential } from "../utils/localPersistence";

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export function assertApiOk(response: Response, message: string): void {
  if (!response.ok) {
    throw new ApiRequestError(response.status, `${message} (${response.status})`);
  }
}

function getRouteHouseholdId(input: RequestInfo | URL): string | null {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  const match = /^\/api\/households\/(?<householdId>[^/]+)/u.exec(url);
  return match?.groups?.householdId ? decodeURIComponent(match.groups.householdId) : null;
}

function getCredentialForRequest(credentials: HouseholdCredential[], input: RequestInfo | URL): HouseholdCredential | null {
  const routeHouseholdId = getRouteHouseholdId(input);
  if (!routeHouseholdId) {
    return credentials[0] ?? null;
  }

  return credentials.find((credential) => credential.householdId === routeHouseholdId) ?? null;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const credentials = await getStoredHouseholdCredentials();
  const credential = getCredentialForRequest(credentials, input);

  if (credential) {
    headers.set("X-Household-Id", credential.householdId);
    headers.set("X-Access-Token", credential.accessToken);
  }

  return fetch(input, {
    ...init,
    headers
  });
}

export async function getApiErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const data = (await response.json()) as ErrorResponse;
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
}
