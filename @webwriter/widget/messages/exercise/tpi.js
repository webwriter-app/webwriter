var tpi_default = {
  check: "Skelim",
  reset: "Statim gen",
  showSolution: "Soim bekim",
  hideSolution: "Hait bekim",
  required: "Plis bekim dispela askim.",
  summary: (correct, total) => correct === total ? "Olgeta i stret." : `${correct} long ${total} i stret.`,
  feedbackOption: "Toktok bek",
  feedbackOnCheck: "Taim man i skelim",
  feedbackOnSubmit: "Bihain long em i salim",
  requiredOption: "Mas i gat"
};
export {
  tpi_default as default
};
