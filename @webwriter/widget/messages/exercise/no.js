var no_default = {
  check: "Kontroller",
  reset: "Tilbakestill",
  showSolution: "Vis løsning",
  hideSolution: "Skjul løsning",
  required: "Svar på dette spørsmålet.",
  summary: (correct, total) => correct === total ? "Alt er riktig." : `${correct} av ${total} riktige.`,
  feedbackOption: "Tilbakemelding",
  feedbackOnCheck: "Når leseren kontrollerer",
  feedbackOnSubmit: "Etter innsending",
  requiredOption: "Obligatorisk"
};
export {
  no_default as default
};
