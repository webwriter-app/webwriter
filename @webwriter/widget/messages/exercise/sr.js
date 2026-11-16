var sr_default = {
  check: "Провери",
  reset: "Врати",
  showSolution: "Прикажи решење",
  hideSolution: "Сакриј решење",
  required: "Одговорите на ово питање.",
  summary: (correct, total) => correct === total ? "Све је тачно." : `Тачно: ${correct} од ${total}.`,
  feedbackOption: "Повратна информација",
  feedbackOnCheck: "Када читалац проверава",
  feedbackOnSubmit: "Након слања",
  requiredOption: "Обавезно"
};
export {
  sr_default as default
};
