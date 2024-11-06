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

const instructionMessageEN = `
      Translate this text to the following language:
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
  return `
      Translate this text to the following language:${language}. Return only the translated text. Ignore the html tags. 
`;
};

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
