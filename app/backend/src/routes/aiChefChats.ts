import { Router } from "express";
import type { AiChefChatMessage, AiChefChatRole } from "@shared/models";
import {
  addAiChefChatMessages,
  createAiChefChat,
  findAiChefChat,
  listAiChefChats,
  makeId
} from "../store.js";

type AiChefChatMessageInput = {
  role?: unknown;
  content?: unknown;
};

type AiChefChatMessagesBody = {
  message?: unknown;
  messages?: unknown;
  role?: unknown;
  content?: unknown;
};

const HOUSEHOLD_ID_HEADER = "x-household-id";

export const aiChefChatsRouter = Router();

const getHeaderValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
};

const getAuthenticatedHouseholdId = (headers: Record<string, string | string[] | undefined>): string => {
  return getHeaderValue(headers[HOUSEHOLD_ID_HEADER]);
};

const isAiChefChatRole = (value: unknown): value is AiChefChatRole => {
  return value === "user" || value === "assistant";
};

const parseMessageInput = (input: unknown): AiChefChatMessageInput | null => {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  return input as AiChefChatMessageInput;
};

const createMessageFromInput = (input: unknown): AiChefChatMessage | null => {
  const messageInput = parseMessageInput(input);
  if (!messageInput || !isAiChefChatRole(messageInput.role) || typeof messageInput.content !== "string") {
    return null;
  }

  const content = messageInput.content.trim();
  if (!content) {
    return null;
  }

  return {
    id: makeId("ai-chef-message"),
    role: messageInput.role,
    content,
    createdAt: new Date().toISOString()
  };
};

const parseMessagesBody = (body: AiChefChatMessagesBody): AiChefChatMessage[] | null => {
  if (Array.isArray(body.messages)) {
    const messages = body.messages.map((message) => createMessageFromInput(message));
    return messages.every((message) => message !== null) ? messages : null;
  }

  if (body.message !== undefined) {
    const message = createMessageFromInput(body.message);
    return message ? [message] : null;
  }

  if (body.role !== undefined || body.content !== undefined) {
    const message = createMessageFromInput(body);
    return message ? [message] : null;
  }

  return [];
};

aiChefChatsRouter.get("/", async (req, res) => {
  const householdId = getAuthenticatedHouseholdId(req.headers);
  const chats = await listAiChefChats(householdId);
  res.json({ chats });
});

aiChefChatsRouter.get("/:chatId", async (req, res) => {
  const householdId = getAuthenticatedHouseholdId(req.headers);
  const chat = await findAiChefChat(householdId, req.params.chatId);
  if (!chat) {
    res.status(404).json({ error: "AI Chef chat not found." });
    return;
  }

  res.json(chat);
});

aiChefChatsRouter.post("/", async (req, res) => {
  const messages = parseMessagesBody(req.body as AiChefChatMessagesBody);
  if (!messages) {
    res.status(400).json({ error: "Messages must contain role and non-empty content." });
    return;
  }

  const householdId = getAuthenticatedHouseholdId(req.headers);
  const chat = await createAiChefChat(householdId, messages);
  res.status(201).json(chat);
});

aiChefChatsRouter.post("/:chatId/messages", async (req, res) => {
  const messages = parseMessagesBody(req.body as AiChefChatMessagesBody);
  if (!messages || !messages.length) {
    res.status(400).json({ error: "At least one message with role and non-empty content is required." });
    return;
  }

  const householdId = getAuthenticatedHouseholdId(req.headers);
  const chat = await addAiChefChatMessages(householdId, req.params.chatId, messages);
  res.status(201).json(chat);
});
