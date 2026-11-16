var ha_default = {
  check: "Duba",
  reset: "Sake saita",
  showSolution: "Nuna mafita",
  hideSolution: "Ɓoye mafita",
  required: "Da fatan za a amsa wannan tambayar.",
  summary: (correct, total) => correct === total ? "Kowanne daidai ne." : `${correct} daga cikin ${total} daidai ne.`,
  feedbackOption: "Ra'ayi",
  feedbackOnCheck: "Lokacin da mai karatu ya duba",
  feedbackOnSubmit: "Bayan an miƙa",
  requiredOption: "Wajibi"
};
export {
  ha_default as default
};
