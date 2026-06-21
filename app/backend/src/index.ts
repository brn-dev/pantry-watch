import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import morgan from "morgan";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireHouseholdAccess } from "./auth.js";
import { initializeRealtime } from "./realtime.js";
import { initializeStore, StoreNotFoundError } from "./store.js";
import { aiRouter } from "./routes/ai.js";
import { aiChefChatsRouter } from "./routes/aiChefChats.js";
import { aiModelsRouter } from "./routes/aiModels.js";
import { authRouter } from "./routes/auth.js";
import { householdsRouter } from "./routes/households.js";
import { locationsRouter } from "./routes/locations.js";
import { pantryItemsRouter } from "./routes/pantryItems.js";
import { shoppingListRouter } from "./routes/shoppingList.js";

const parseBackendEnvFile = (envFilePath: string): Record<string, string> => {
  if (!existsSync(envFilePath)) {
    return {};
  }

  const envFileContent = readFileSync(envFilePath, "utf8");
  const lines = envFileContent.split(/\r?\n/u);
  const values: Record<string, string> = {};

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const delimiterIndex = trimmedLine.indexOf("=");
    if (delimiterIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, delimiterIndex).trim();
    const rawValue = trimmedLine.slice(delimiterIndex + 1).trim();
    if (!key) {
      continue;
    }

    const isQuoted = rawValue.length >= 2 && rawValue.startsWith("\"") && rawValue.endsWith("\"");
    values[key] = isQuoted ? rawValue.slice(1, -1) : rawValue;
  }

  return values;
};

const loadBackendEnvFiles = (): void => {
  const currentFilePath = fileURLToPath(import.meta.url);
  const backendRootPath = resolve(dirname(currentFilePath), "..");
  const fileValues = {
    ...parseBackendEnvFile(resolve(backendRootPath, ".env")),
    ...parseBackendEnvFile(resolve(backendRootPath, ".env.local"))
  };

  for (const [key, value] of Object.entries(fileValues)) {
    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = value;
  }
};

loadBackendEnvFiles();

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "Backend is running. Open http://localhost:5173 for the frontend in dev mode."
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api", requireHouseholdAccess);

app.get("/api/hello", (_req, res) => {
  res.json({ message: "Backend is reachable." });
});

app.use("/api/ai/models", aiModelsRouter);
app.use("/api/ai/chats", aiChefChatsRouter);
app.use("/api/ai", aiRouter);
app.use("/api/households", householdsRouter);
app.use("/api/households/:householdId/locations", locationsRouter);
app.use("/api/households/:householdId", pantryItemsRouter);
app.use("/api/households/:householdId/shopping-list", shoppingListRouter);

const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof StoreNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error." });
};

app.use(errorHandler);

const startServer = async (): Promise<void> => {
  await initializeStore();

  const server = createServer(app);
  initializeRealtime(server);

  server.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
};

startServer().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
