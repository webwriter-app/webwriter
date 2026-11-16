var ga_default = {
  check: "Seiceáil",
  reset: "Athshocraigh",
  showSolution: "Taispeáin an freagra",
  hideSolution: "Folaigh an freagra",
  required: "Freagair an cheist seo, le do thoil.",
  summary: (correct, total) => correct === total ? "Gach rud ceart." : `${correct} as ${total} ceart.`,
  feedbackOption: "Aiseolas",
  feedbackOnCheck: "Nuair a sheiceálann an léitheoir",
  feedbackOnSubmit: "Tar éis a chur isteach",
  requiredOption: "Riachtanach"
};
export {
  ga_default as default
};
