var ca_default = {
  check: "Comprova",
  reset: "Restableix",
  showSolution: "Mostra la solució",
  hideSolution: "Amaga la solució",
  required: "Respongueu aquesta pregunta.",
  summary: (correct, total) => correct === total ? "Tot és correcte." : `${correct} de ${total} correctes.`,
  feedbackOption: "Retroacció",
  feedbackOnCheck: "En comprovar",
  feedbackOnSubmit: "Després d’enviar",
  requiredOption: "Obligatori"
};
export {
  ca_default as default
};
