import { OpenAI } from "openai";
import { APIPromise } from "openai/core";
import { ChatCompletionMessageParam, ChatCompletion } from "openai/resources";

// Initialize the OpenAI API client with a placeholder API key.
const openai = new OpenAI({
  apiKey: "placeholder", // Use a placeholder for the API key until it's securely fetched.
  dangerouslyAllowBrowser: true,
});

/**
 * Helper function to create a system message for the ChatCompletion API.

 */
function createSystemMessage(systemPrompt: string): ChatCompletionMessageParam {
  return {
    role: "system",
    content: [
      {
        type: "text",
        text: systemPrompt,
      },
    ],
  };
}

/**
 * Fetch a chat completion response from OpenAI.
 */
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

  const messageFinal: ChatCompletionMessageParam[] = [
    createSystemMessage(systemPrompt),
    ...messages,
  ];

  console.log("fetchChatCompletion", messageFinal);

  return openai.chat.completions.create({
    model,
    temperature: 0, // Ensure deterministic output with no randomness.
    messages: messageFinal,
    max_tokens: 1024,
    top_p: 1, // Use the top 100% of probability mass for decoding.
    frequency_penalty: 0, // No penalty for using repetitive words.
    presence_penalty: 0, // No penalty for mentioning words frequently.
    response_format: { type: "text" }, // Expect a textual response format.
  });
}

export { fetchOpenAIChatCompletion };
