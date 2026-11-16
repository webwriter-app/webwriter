var ja_default = {
  check: "チェック",
  reset: "リセット",
  showSolution: "解答を表示",
  hideSolution: "解答を非表示",
  required: "この問題に答えてください。",
  summary: (correct, total) => correct === total ? "すべて正解です。" : `${total} 問中 ${correct} 問正解です。`,
  feedbackOption: "フィードバック",
  feedbackOnCheck: "読者がチェックしたとき",
  feedbackOnSubmit: "送信後",
  requiredOption: "必須"
};
export {
  ja_default as default
};
