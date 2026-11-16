var nl_default = {
  check: "Controleren",
  reset: "Opnieuw instellen",
  showSolution: "Oplossing tonen",
  hideSolution: "Oplossing verbergen",
  required: "Beantwoord deze vraag.",
  summary: (correct, total) => correct === total ? "Alles is juist." : `${correct} van ${total} juist.`,
  feedbackOption: "Feedback",
  feedbackOnCheck: "Wanneer de lezer controleert",
  feedbackOnSubmit: "Na het indienen",
  requiredOption: "Verplicht"
};
export {
  nl_default as default
};
