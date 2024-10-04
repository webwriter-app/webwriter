function valiadateClaudeApiKey(apiKey: string): boolean {
  return apiKey.length > 0;
}

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const apiKey =
  "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";

const fetchAnthropicChatCompletion = async (
  messages: any[],
  apiKey: string,
  model: string
) => {
  if (!valiadateClaudeApiKey(apiKey)) {
    throw new Error("API key is not valid.");
  }

  const anthropic = new Anthropic({ apiKey });
  const msg = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20240620",
    max_tokens: 1000,
    temperature: 0,
    system: "Respond only with short poems.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Why is the ocean salty?",
          },
        ],
      },
    ],
  });
};
export { valiadateClaudeApiKey };
