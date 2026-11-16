var ti_default = {
  check: "ፈትሽ",
  reset: "ዳግማይ ኣጽሪ",
  showSolution: "መፍትሒ ኣርኢ",
  hideSolution: "መፍትሒ ሕባእ",
  required: "በጃኹም ነዚ ሕቶ መልስዎ።",
  summary: (correct, total) => correct === total ? "ኩሉ ቅኑዕ እዩ።" : `ካብ ${total} ${correct} ቅኑዕ እዩ።`,
  feedbackOption: "ርእይቶ",
  feedbackOnCheck: "ኣንባቢ ምስ ዝፈትሽ",
  feedbackOnSubmit: "ድሕሪ ምልኣኽ",
  requiredOption: "ግዱድ"
};
export {
  ti_default as default
};
