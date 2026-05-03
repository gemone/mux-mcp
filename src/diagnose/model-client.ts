import type { ModelConfig } from "../config.js";
import { BackendError } from "../errors/index.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatCompletion(
  config: ModelConfig,
  messages: ChatMessage[],
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const body = JSON.stringify({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    messages,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
      signal: AbortSignal.timeout(60000),
    });
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string };
    if (error.name === "TimeoutError") {
      throw new BackendError("Model API request timed out after 60s");
    }
    throw new BackendError(`Model API request failed: ${error.message}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new BackendError(`Model API returned ${response.status}`, {
      status: response.status,
      body: text,
    });
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new BackendError("Model API returned empty response");
  }

  return content;
}
