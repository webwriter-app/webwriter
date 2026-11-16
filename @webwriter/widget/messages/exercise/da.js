var da_default = {
  check: "Tjek",
  reset: "Nulstil",
  showSolution: "Vis løsning",
  hideSolution: "Skjul løsning",
  required: "Besvar venligst dette spørgsmål.",
  summary: (correct, total) => correct === total ? "Alt er rigtigt." : `${correct} af ${total} rigtige.`,
  feedbackOption: "Feedback",
  feedbackOnCheck: "Når læseren tjekker",
  feedbackOnSubmit: "Efter indsendelse",
  requiredOption: "Obligatorisk"
};
export {
  da_default as default
};
