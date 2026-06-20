import type { AiChefChat, AiChefChatMessage } from "@shared/models";
import { apiFetch, assertApiOk } from "./http";

type AiChefChatsResponse = {
  chats: AiChefChat[];
};

type CreateAiChefChatMessageInput = Pick<AiChefChatMessage, "role" | "content">;

export async function fetchAiChefChats(): Promise<AiChefChat[]> {
  const response = await apiFetch("/api/ai/chats");
  assertApiOk(response, "Failed to load AI Chef chats");

  const data = (await response.json()) as AiChefChatsResponse;
  return data.chats;
}

export async function createAiChefChat(messages: CreateAiChefChatMessageInput[]): Promise<AiChefChat> {
  const response = await apiFetch("/api/ai/chats", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ messages })
  });
  assertApiOk(response, "Failed to save AI Chef chat");

  return (await response.json()) as AiChefChat;
}

export async function appendAiChefChatMessages(
  chatId: string,
  messages: CreateAiChefChatMessageInput[]
): Promise<AiChefChat> {
  const response = await apiFetch(`/api/ai/chats/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ messages })
  });
  assertApiOk(response, "Failed to save AI Chef chat messages");

  return (await response.json()) as AiChefChat;
}
