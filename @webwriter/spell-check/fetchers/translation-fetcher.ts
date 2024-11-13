import { APIPromise } from "openai/core";
import { ChatCompletion } from "openai/resources";
import { fetchOpenAIChatCompletion } from "./openai-fetcher";
import { fetchAnthropicChatCompletion } from "./anthropic-fetcher";
import { fetchGeminiChatCompletion } from "./google-fetcher";

/**
 * Helper function to generate instruction messages for text correction.
 */
const fetchInstructionMessage = (language: string): string => {
  return `
      Translate this text to the following language: ${language}. Return only the translated text. Ignore the HTML tags.
    `;
};

/**
 * Fetch text correction or translation from different AI providers.
 */
export function fetchTranslation(
  text: string,
  apiKey: string,
  company: string,
  model: string,
  language: string
): any | void {
  const instructionMessage = fetchInstructionMessage(language);

  switch (company) {
    case "OpenAI":
      return fetchOpenAIChatCompletion(
        instructionMessage,
        [{ role: "user", content: text }],
        apiKey,
        model
      );

    case "Google":
      return fetchGeminiChatCompletion(instructionMessage, text, apiKey, model);

    case "Anthropic":
      return fetchAnthropicChatCompletion(
        instructionMessage,
        [{ role: "user", content: text }],
        apiKey,
        model
      );

    default:
      throw new Error("Company not supported");
  }
}
