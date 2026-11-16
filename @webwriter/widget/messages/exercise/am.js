var am_default = {
  check: "ፈትሽ",
  reset: "እንደገና አስጀምር",
  showSolution: "መፍትሄውን አሳይ",
  hideSolution: "መፍትሄውን ደብቅ",
  required: "እባክዎ ይህን ጥያቄ ይመልሱ።",
  summary: (correct, total) => correct === total ? "ሁሉም ትክክል ነው።" : `ከ${total} ${correct} ትክክል ናቸው።`,
  feedbackOption: "አስተያየት",
  feedbackOnCheck: "አንባቢው ሲፈትሽ",
  feedbackOnSubmit: "ከማስገባት በኋላ",
  requiredOption: "አስፈላጊ"
};
export {
  am_default as default
};
