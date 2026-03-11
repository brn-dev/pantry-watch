import type { ErrorResponse } from "../types/app";

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
