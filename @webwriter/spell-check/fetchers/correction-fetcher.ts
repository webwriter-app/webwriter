import { APIPromise } from "openai/core";
import { ChatCompletion } from "openai/resources";
import { fetchOpenAIChatCompletion } from "./openai-fetcher";

export function fetchGrammarCorrection(
  text: string,
  apiKey: string,
  company: string,
  model: string
): APIPromise<ChatCompletion> | void {
  switch (company) {
    case "OpenAI":
      return fetchOpenAIChatCompletion(
        [{ role: "user", content: text }],
        apiKey,
        model
      );
    case "google":
      console.log("Gemini");
      break;

    case "anthropic":
      console.log("Anthropic");
      break;
    default:
      throw new Error("Company not supported");
  }
}
