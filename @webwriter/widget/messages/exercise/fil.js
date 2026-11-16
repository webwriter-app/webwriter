var fil_default = {
  check: "Suriin",
  reset: "I-reset",
  showSolution: "Ipakita ang solusyon",
  hideSolution: "Itago ang solusyon",
  required: "Pakisagot ang tanong na ito.",
  summary: (correct, total) => correct === total ? "Tama lahat." : `${correct} sa ${total} ang tama.`,
  feedbackOption: "Feedback",
  feedbackOnCheck: "Kapag nagsuri ang mambabasa",
  feedbackOnSubmit: "Pagkatapos magsumite",
  requiredOption: "Kinakailangan"
};
export {
  fil_default as default
};
