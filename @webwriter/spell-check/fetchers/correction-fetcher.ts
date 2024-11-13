import { APIPromise } from "openai/core";
import { ChatCompletion } from "openai/resources";
import { fetchOpenAIChatCompletion } from "./openai-fetcher";
import { fetchAnthropicChatCompletion } from "./anthropic-fetcher";
import { fetchGeminiChatCompletion } from "./google-fetcher";

{
  /*
 ### Prompt design ###

 I want the model to:
  * correct snippets of text for spelling and grammar mistakes
  * just return the corrected text
  * keep as much as possible original
  * if the original text is unintelligible, just return the original text
  * keep in mind that it's an excerpt from a text, so no need to correct akwardly cut words at the start or end of the snippet
  */
}

const instructionMessageEN = `
      You are a highly skilled proofreader and editor. Your task is to correct spelling and grammar mistakes in the following text snippet. Follow these guidelines:
      
      1. Correct any spelling errors or grammatical mistakes you find.
      2. Maintain as much of the original text as possible. Only make changes where necessary for correctness.
      3. If the text is completely unintelligible, return it unchanged.
      4. Remember that this is an excerpt from a larger text. Do not attempt to correct or complete words that may be cut off at the beginning or end of the snippet.
      5. Do not add any explanations or comments. Simply return the corrected text.
      6. If no corrections are needed, return the original text unchanged.
      
      Here's the text to check and correct:
`;

const instructionMessageDE = `
 Sie sind ein hochqualifizierter Korrekturleser und Redakteur. Ihre Aufgabe ist es, Rechtschreib- und Grammatikfehler in dem folgenden Textausschnitt zu korrigieren. Befolgen Sie diese Richtlinien:
      
      1. Korrigieren Sie alle Rechtschreib- und Grammatikfehler, die Sie finden.
      2. Behalten Sie den Originaltext so weit wie möglich bei. Nehmen Sie nur dort Änderungen vor, wo es für die Korrektheit notwendig ist.
      3. Wenn der Text völlig unverständlich ist, senden Sie ihn unverändert zurück.
      4. Denken Sie daran, dass es sich um einen Auszug aus einem größeren Text handelt. Versuchen Sie nicht, Wörter zu korrigieren oder zu vervollständigen, die am Anfang oder Ende des Auszugs abgeschnitten sind.
      5. Fügen Sie keine Erklärungen oder Kommentare hinzu. Geben Sie einfach den korrigierten Text zurück.
      6. Wenn keine Korrekturen erforderlich sind, senden Sie den Originaltext unverändert zurück.
      
      Hier ist der zu prüfende und zu korrigierende Text:
`;

const fetchInstructionMessage = (language: string): string => {
  console.log("language", language);
  switch (language) {
    case "en":
      return instructionMessageEN;
    case "de":
      return instructionMessageDE;
    default:
      return instructionMessageEN;
  }
};

/**
 * Fetch text correction from different AI providers.
 */
export function fetchGrammarCorrection(
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
