var gl_default = {
  check: "Comprobar",
  reset: "Restablecer",
  showSolution: "Amosar a solución",
  hideSolution: "Agochar a solución",
  required: "Responde a esta pregunta.",
  summary: (correct, total) => correct === total ? "Todo é correcto." : `${correct} de ${total} correctas.`,
  feedbackOption: "Retroalimentación",
  feedbackOnCheck: "Ao comprobar",
  feedbackOnSubmit: "Despois de enviar",
  requiredOption: "Obrigatorio"
};
export {
  gl_default as default
};
