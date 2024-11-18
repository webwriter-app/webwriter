import Anthropic from "@anthropic-ai/sdk";

function valiadateClaudeApiKey(apiKey: string): boolean {
  return apiKey.length > 0;
}

const anthropic = new Anthropic({
  apiKey: "placeholder",
  dangerouslyAllowBrowser: true,
});

const fetchAnthropicChatCompletion = async (
  systemPrompt: string,
  messages: any[],
  apiKey: string,
  model: string
) => {
  if (!valiadateClaudeApiKey(apiKey)) {
    throw new Error("API key is not valid.");
  }

  anthropic.apiKey = apiKey;

  const msg = await anthropic.messages.create({
    model: model,
    max_tokens: 1000,
    temperature: 0,
    system: systemPrompt,
    messages: messages,
  });

  return msg;
};
export { valiadateClaudeApiKey, fetchAnthropicChatCompletion };
