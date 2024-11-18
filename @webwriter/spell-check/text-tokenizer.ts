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
