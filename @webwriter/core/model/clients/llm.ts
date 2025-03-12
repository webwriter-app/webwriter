import { LLMAccount, LLMApiClient } from "#model"
import Anthropic from "@anthropic-ai/sdk";

export class LLMClient implements LLMApiClient {
    constructor(
        readonly account: LLMAccount
    ) {}

    get id() {
      return this.account.id
    }

    getModel() {
        return this.account.model;
    }

    getCompany() {
        return this.account.company;
    }

    getApiKey() {
        return this.account.apiKey;
    }
}

function validateClaudeApiKey(apiKey: string): boolean {
  return apiKey.length > 0;
}

const anthropic = new Anthropic({
  apiKey: "placeholder",
  dangerouslyAllowBrowser: true,
});

const fetchAnthropicChatCompletion = async (
  systemPrompt: string,
  messages: any[],
  apiKey: string,
  model: string
) => {
  if (!validateClaudeApiKey(apiKey)) {
    throw new Error("API key is not valid.");
  }

  anthropic.apiKey = apiKey;

  const msg = await anthropic.messages.create({
    model: model,
    max_tokens: 1000,
    temperature: 0,
    system: systemPrompt,
    messages: messages,
  });

  return msg;
};
export { validateClaudeApiKey, fetchAnthropicChatCompletion };

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

function validateLlamaApiKey(apiKey: string): boolean {
    return apiKey.length === 32;
}

import { OpenAI } from "openai";
import { APIPromise } from "openai/core";
import { ChatCompletionMessageParam, ChatCompletion } from "openai/resources/chat/completions";

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

/**
 * Fetch text correction or translation from different AI providers.
 */
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

import {
  EditorState,
  Plugin,
  TextSelection,
  Transaction,
} from "prosemirror-state";

type Token = {
  type: "word" | "punctuation" | "space";
  value: string;
  position: number;
};

export function tokenizeText(text: string): Token[] {
  const tokens: Token[] = [];
  const regex = /(\w+(?:['’-]\w+)*|[^\w\s]|\s+)/g; // regex to match words, punctuation, and spaces
  let match;

  while ((match = regex.exec(text)) !== null) {
    const value = match[0];
    const position = match.index;
    let type: "word" | "punctuation" | "space";

    if (/^\w+(?:[']\w+)?$/.test(value)) {
      type = "word";
    } else if (/^\s+$/.test(value)) {
      type = "space";
    } else {
      type = "punctuation";
    }

    tokens.push({ type, value, position });
  }

  return tokens;
}

type DiffToken = {
  type: "insert" | "delete" | "unchanged";
  token: Token;
};

/*
 * Given two arrays of tokens, return a list of diff tokens that represent the
 * differences between the two arrays.
 */

export function diffTokens(
  originalTokens: Token[],
  correctedTokens: Token[]
): DiffToken[] {
  const m = originalTokens.length;
  const n = correctedTokens.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Fill the dp table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (originalTokens[i - 1].value === correctedTokens[j - 1].value) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the diff
  const diff: DiffToken[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      originalTokens[i - 1].value === correctedTokens[j - 1].value
    ) {
      diff.unshift({ type: "unchanged", token: originalTokens[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: "insert", token: correctedTokens[j - 1] });
      j--;
    } else {
      diff.unshift({ type: "delete", token: originalTokens[i - 1] });
      i--;
    }
  }
  console.log("uncompressed diff:", diff);
  const compressedDiff = compressDiffTokens(diff);

  return compressedDiff;
}

function compressDiffTokens(diff: DiffToken[]): DiffToken[] {
  const compressedDiff: DiffToken[] = [];
  let lastToken: DiffToken | null = null;

  for (const token of diff) {
    if (lastToken && lastToken.type === token.type) {
      lastToken.token.value += token.token.value;
    } else {
      compressedDiff.push(token);
      lastToken = token;
    }
  }

  // account for correct insertion positions
  compressedDiff.forEach((diff, i) => {
    if (diff.type === "unchanged") {
      const nextDiff = compressedDiff[i + 1];
      if (nextDiff?.type === "insert") {
        nextDiff.token.position = diff.token.position + diff.token.value.length;
      }
    }
  });

  return compressedDiff;
}

type Suggestion = {
  type: "replace" | "insert" | "delete";
  original: Token;
  corrected: Token;
};

/*
 * Given a list of diff tokens, return a list of suggestions that can be applied
 * to the original text to correct it.
 */

export function matchDiffs(diff: DiffToken[]): Suggestion[] {
  const suggestions: Suggestion[] = [];
  let i = 0;
  while (i < diff.length) {
    const token = diff[i];
    if (token.type === "delete") {
      if (i + 1 < diff.length && diff[i + 1].type === "insert") {
        suggestions.push({
          type: "replace",
          original: token.token,
          corrected: diff[i + 1].token,
        });
        i += 2;
      } else {
        suggestions.push({
          type: "delete",
          original: token.token,
          corrected: token.token,
        });
        i++;
      }
    } else if (token.type === "insert") {
      suggestions.push({
        type: "insert",
        original: token.token,
        corrected: token.token,
      });
      i++;
    } else {
      i++;
    }
  }
  return suggestions;
}

/*
 * creates a Transaction that removes all grammar Marks from the document
 */
export function removeGrammarSuggestions(
  editorState: EditorState
): Transaction {
  const { tr, doc, schema } = editorState;
  const grammarMark = schema.marks.grammar;

  // We'll use this to track positions as we potentially delete content
  let offset = 0;

  doc.descendants((node, pos) => {
    if (node.isInline) {
      const mark = node.marks.find((m) => m.type === grammarMark);
      if (mark) {
        const from = pos + offset;
        const to = from + node.nodeSize;

        if (mark.attrs.isInsert) {
          // For insertions, delete the content
          tr.delete(from, to);
          // Update offset to account for deleted content
          offset -= to - from;
        } else {
          // For corrections, just remove the mark
          tr.removeMark(from, to, grammarMark);
        }
      }
    }
    return true;
  });

  return tr;
}

/*
 * creates a Transaction that applies the given grammar suggestions to the document
 */
export function applyGrammarSuggestions(
  editorState: EditorState,
  suggestions: Suggestion[]
): Transaction {
  let tr = editorState.tr;

  // Sort suggestions in reverse order to avoid position shifts
  const sortedSuggestions = [...suggestions].sort(
    (a, b) => b.original.position - a.original.position
  );

  for (const suggestion of sortedSuggestions) {
    const from = suggestion.original.position + 1;
    const to = from + suggestion.original.value.length;

    switch (suggestion.type) {
      case "replace":
        tr = tr.addMark(
          from,
          to,
          editorState.schema.marks.grammar.create({
            corrected: suggestion.corrected.value,
          })
        );
        break;
      case "insert":
        tr = tr.insertText(suggestion.corrected.value, from);
        tr = tr.addMark(
          from,
          from + suggestion.corrected.value.length,
          editorState.schema.marks.grammar.create({
            corrected: suggestion.corrected.value,
            isInsert: true,
          })
        );
        break;
      case "delete":
        tr = tr.addMark(
          from,
          to,
          editorState.schema.marks.grammar.create({ corrected: "" })
        );
        break;
    }
  }

  return tr;
}