import { OpenAI } from "openai";
import { APIPromise } from "openai/core";
import { ChatCompletionMessageParam, ChatCompletion } from "openai/resources";

// const apiKey = process.env.OPENAI_API_KEY;
const apiKey = "sk-proj-l0h8DtCp5fCopl3EU0yZT3BlbkFJpk5WRkI7cON1yRsR52Rj";
const model = "gpt-4o-mini";
const instructionMessage: ChatCompletionMessageParam = {
  role: "system",
  content:
    "Correct the grammar in the following text, just return the corrected text:",
};

if (!apiKey) {
  throw new Error("OPENAI_API_KEY environment variable is not defined.");
}

const openai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true,
});

function fetchChatCompletion(
  messages: ChatCompletionMessageParam[]
): APIPromise<ChatCompletion> {
  console.log("fetchChatCompletion", [instructionMessage, ...messages]);
  return openai.chat.completions.create({
    model: model,
    temperature: 0,
    messages: [instructionMessage, ...messages],
  });
}

function fetchGrammarCorrection(text: string): APIPromise<ChatCompletion> {
  return fetchChatCompletion([{ role: "user", content: text }]);
}

export { fetchGrammarCorrection };
