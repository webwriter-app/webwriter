var nn_default = {
  check: "Kontroller",
  reset: "Tilbakestill",
  showSolution: "Vis løysing",
  hideSolution: "Skjul løysing",
  required: "Svar på dette spørsmålet.",
  summary: (correct, total) => correct === total ? "Alt er rett." : `${correct} av ${total} rette.`,
  feedbackOption: "Tilbakemelding",
  feedbackOnCheck: "Når lesaren kontrollerer",
  feedbackOnSubmit: "Etter innsending",
  requiredOption: "Obligatorisk"
};
export {
  nn_default as default
};
