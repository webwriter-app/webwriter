import { OpenAI } from "openai";
import { APIPromise } from "openai/core";
import { ChatCompletionMessageParam, ChatCompletion } from "openai/resources";

// @meeting
// const apiKey = process.env.OPENAI_API_KEY;

// const apiKey = "sk-proj-l0h8DtCp5fCopl3EU0yZT3BlbkFJpk5WRkI7cON1yRsR52Rj";
// const apiKey =
// const model = "gpt-4o-mini";
const instructionMessage: ChatCompletionMessageParam = {
  role: "system",
  content: [
    {
      type: "text",
      text: "You are a language model assistant helping a user with grammar correction. The user provides text, and you return just the corrected version of the text. If the text is unintelligible or already correct, you should return the original text.",
    },
  ],
};

const openai = new OpenAI({
  // apiKey: apiKey,
  apiKey: "placeholder",
  dangerouslyAllowBrowser: true,
});

function fetchOpenAIChatCompletion(
  messages: ChatCompletionMessageParam[],
  apiKey: string,
  model: string
): APIPromise<ChatCompletion> {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not defined.");
  }

  openai.apiKey = apiKey;

  console.log("fetchChatCompletion", [instructionMessage, ...messages]);
  return openai.chat.completions.create({
    model: model,
    temperature: 0,
    messages: [instructionMessage, ...messages],
    max_tokens: 256,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    response_format: {
      type: "text",
    },
  });
}

async function validateOpenAIApiKey(apiKey: string): Promise<boolean> {
  return true;
}
export { fetchOpenAIChatCompletion, validateOpenAIApiKey };
