var bg_default = {
  check: "Проверка",
  reset: "Нулиране",
  showSolution: "Показване на решението",
  hideSolution: "Скриване на решението",
  required: "Моля, отговорете на този въпрос.",
  summary: (correct, total) => correct === total ? "Всичко е вярно." : `${correct} от ${total} верни.`,
  feedbackOption: "Обратна връзка",
  feedbackOnCheck: "При проверка от читателя",
  feedbackOnSubmit: "След изпращане",
  requiredOption: "Задължително"
};
export {
  bg_default as default
};
