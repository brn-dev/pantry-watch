import { Router } from "express";
import { listAvailableLlmModels } from "../store.js";

export const aiModelsRouter = Router();

aiModelsRouter.get("/", async (_req, res) => {
  const llmModelsConfig = await listAvailableLlmModels();
  if (!llmModelsConfig.models.length) {
    res.status(500).json({ error: "No AI models are configured." });
    return;
  }

  res.json(llmModelsConfig);
});
