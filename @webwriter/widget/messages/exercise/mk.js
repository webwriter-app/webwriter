var mk_default = {
  check: "Провери",
  reset: "Врати",
  showSolution: "Прикажи го решението",
  hideSolution: "Скриј го решението",
  required: "Одговорете на ова прашање.",
  summary: (correct, total) => correct === total ? "Сѐ е точно." : `Точни: ${correct} од ${total}.`,
  feedbackOption: "Повратна информација",
  feedbackOnCheck: "Кога читателот проверува",
  feedbackOnSubmit: "По испраќањето",
  requiredOption: "Задолжително"
};
export {
  mk_default as default
};
