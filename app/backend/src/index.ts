import cors from "cors";
import express from "express";
import morgan from "morgan";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aiRouter } from "./routes/ai.js";
import { householdsRouter } from "./routes/households.js";
import { locationsRouter } from "./routes/locations.js";
import { pantryItemsRouter } from "./routes/pantryItems.js";
import { shoppingListRouter } from "./routes/shoppingList.js";

const loadBackendEnvFile = (): void => {
  const currentFilePath = fileURLToPath(import.meta.url);
  const backendRootPath = resolve(dirname(currentFilePath), "..");
  const envFilePath = resolve(backendRootPath, ".env.local");
  if (!existsSync(envFilePath)) {
    return;
  }

  const envFileContent = readFileSync(envFilePath, "utf8");
  const lines = envFileContent.split(/\r?\n/u);

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
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const isQuoted = rawValue.length >= 2 && rawValue.startsWith("\"") && rawValue.endsWith("\"");
    process.env[key] = isQuoted ? rawValue.slice(1, -1) : rawValue;
  }
};

loadBackendEnvFile();

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

app.get("/api/hello", (_req, res) => {
  res.json({ message: "Backend is reachable." });
});

app.use("/api/ai", aiRouter);
app.use("/api/households", householdsRouter);
app.use("/api/households/:householdId/locations", locationsRouter);
app.use("/api/households/:householdId", pantryItemsRouter);
app.use("/api/households/:householdId/shopping-list", shoppingListRouter);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
