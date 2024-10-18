import { APIPromise } from "openai/core";
import { ChatCompletion } from "openai/resources";
import { fetchOpenAIChatCompletion } from "./openai-fetcher";
import { fetchAnthropicChatCompletion } from "./anthropic-fetcher";
import { fetchGeminiChatCompletion } from "./google-fetcher";

{
  /*
 ### Prompt redesign ###

 I want the model to:
  * correct snippets of text for spelling and grammar mistakes
  * just return the corrected text
  * keep as much as possible original
  * if the original text is unintelligible, just return the original text
  * keep in mind that it's an excerpt from a text, so no need to correct akwardly cut words at the start or end of the snippet
  */
}

const instructionMessage = `
      You are a highly skilled proofreader and editor. Your task is to correct spelling and grammar mistakes in the following text snippet. Follow these guidelines:
      
      1. Correct any spelling errors or grammatical mistakes you find.
      2. Maintain as much of the original text as possible. Only make changes where necessary for correctness.
      3. If the text is completely unintelligible, return it unchanged.
      4. Remember that this is an excerpt from a larger text. Do not attempt to correct or complete words that may be cut off at the beginning or end of the snippet.
      5. Do not add any explanations or comments. Simply return the corrected text.
      6. If no corrections are needed, return the original text unchanged.
      
      Here's the text to check and correct:
`;

export function fetchGrammarCorrection(
  text: string,
  apiKey: string,
  company: string,
  model: string
): any | void {
  switch (company) {
    case "OpenAI":
      return fetchOpenAIChatCompletion(
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
