var bn_default = {
  check: "যাচাই করুন",
  reset: "রিসেট করুন",
  showSolution: "সমাধান দেখান",
  hideSolution: "সমাধান লুকান",
  required: "অনুগ্রহ করে এই প্রশ্নের উত্তর দিন।",
  summary: (correct, total) => correct === total ? "সবকিছু সঠিক।" : `${total}টির মধ্যে ${correct}টি সঠিক।`,
  feedbackOption: "প্রতিক্রিয়া",
  feedbackOnCheck: "পাঠক যাচাই করলে",
  feedbackOnSubmit: "জমা দেওয়ার পরে",
  requiredOption: "আবশ্যিক"
};
export {
  bn_default as default
};
