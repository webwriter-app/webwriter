import { APIPromise } from "openai/core";
import { ChatCompletion } from "openai/resources";
import { fetchOpenAIChatCompletion } from "./openai-fetcher";

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
