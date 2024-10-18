import { OpenAI } from "openai";
import { APIPromise } from "openai/core";
import { ChatCompletionMessageParam, ChatCompletion } from "openai/resources";

// @meeting
// const apiKey = process.env.OPENAI_API_KEY;

//  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
// const model = "gpt-4o-mini";
const instructionMessage: ChatCompletionMessageParam = {
  role: "system",
  content: [
    {
      type: "text",
      // text: "You are a language model assistant helping a user with grammar correction. The user provides text, and you return just the corrected version of the text. If the text is unintelligible or already correct, you should return the original text.",
      text: `
      You are a highly skilled proofreader and editor. Your task is to correct spelling and grammar mistakes in the following text snippet. Follow these guidelines:
      
      1. Correct any spelling errors or grammatical mistakes you find.
      2. Maintain as much of the original text as possible. Only make changes where necessary for correctness.
      3. If the text is completely unintelligible, return it unchanged.
      4. Remember that this is an excerpt from a larger text. Do not attempt to correct or complete words that may be cut off at the beginning or end of the snippet.
      5. Do not add any explanations or comments. Simply return the corrected text.
      6. If no corrections are needed, return the original text unchanged.
      
      Here's the text to check and correct:
`,
    },
  ],
};

const openai = new OpenAI({
  apiKey: "placeholder",
  dangerouslyAllowBrowser: true,
});

function fetchOpenAIChatCompletion(
  systemPrompt: string,
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
    messages: [
      {
        role: "system",
        content: [
          {
            type: "text",
            text: systemPrompt,
          },
        ],
      },
      ...messages,
    ],
    max_tokens: 1024,
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
