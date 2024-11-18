import { GoogleGenerativeAI } from "@google/generative-ai";

function validateGeminiApiKey(apiKey: string): boolean {
  return apiKey.length > 0;
}
const genAI = new GoogleGenerativeAI("placeholder");

async function fetchGeminiChatCompletion(
  systemPrompt: string,
  text: string,
  apiKey: string,
  model: string
) {
  if (!validateGeminiApiKey(apiKey)) {
    throw new Error("API key is not valid.");
  }

  genAI.apiKey = apiKey;
  // const genAImodel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const genAImodel = genAI.getGenerativeModel({
    model: model,
    systemInstruction: systemPrompt,
  });

  const result = await genAImodel.generateContent(text);
  const response = await result.response;
  return response.text();
}

export { validateGeminiApiKey, fetchGeminiChatCompletion };
