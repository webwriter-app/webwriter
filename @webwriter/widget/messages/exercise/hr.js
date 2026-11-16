var hr_default = {
  check: "Provjeri",
  reset: "Vrati",
  showSolution: "Prikaži rješenje",
  hideSolution: "Sakrij rješenje",
  required: "Odgovorite na ovo pitanje.",
  summary: (correct, total) => correct === total ? "Sve je točno." : `Točno: ${correct} od ${total}.`,
  feedbackOption: "Povratna informacija",
  feedbackOnCheck: "Kad čitatelj provjerava",
  feedbackOnSubmit: "Nakon slanja",
  requiredOption: "Obavezno"
};
export {
  hr_default as default
};
