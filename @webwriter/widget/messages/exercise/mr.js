var mr_default = {
  check: "तपासा",
  reset: "रीसेट करा",
  showSolution: "उत्तर दाखवा",
  hideSolution: "उत्तर लपवा",
  required: "कृपया या प्रश्नाचे उत्तर द्या.",
  summary: (correct, total) => correct === total ? "सर्व काही बरोबर आहे." : `${total} पैकी ${correct} बरोबर.`,
  feedbackOption: "अभिप्राय",
  feedbackOnCheck: "वाचकाने तपासल्यावर",
  feedbackOnSubmit: "सादर केल्यानंतर",
  requiredOption: "अनिवार्य"
};
export {
  mr_default as default
};
