var pt_default = {
  check: "Verificar",
  reset: "Repor",
  showSolution: "Mostrar solução",
  hideSolution: "Ocultar solução",
  required: "Responda a esta pergunta.",
  summary: (correct, total) => correct === total ? "Tudo correto." : `${correct} de ${total} corretas.`,
  feedbackOption: "Comentários",
  feedbackOnCheck: "Ao verificar",
  feedbackOnSubmit: "Após submeter",
  requiredOption: "Obrigatório"
};
export {
  pt_default as default
};
