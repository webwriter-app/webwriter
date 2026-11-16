var el_default = {
  check: "Έλεγχος",
  reset: "Επαναφορά",
  showSolution: "Εμφάνιση λύσης",
  hideSolution: "Απόκρυψη λύσης",
  required: "Απαντήστε σε αυτή την ερώτηση.",
  summary: (correct, total) => correct === total ? "Όλα είναι σωστά." : `${correct} από ${total} σωστά.`,
  feedbackOption: "Σχόλια",
  feedbackOnCheck: "Όταν ο αναγνώστης κάνει έλεγχο",
  feedbackOnSubmit: "Μετά την υποβολή",
  requiredOption: "Υποχρεωτικό"
};
export {
  el_default as default
};
