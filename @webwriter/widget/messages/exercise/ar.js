var ar_default = {
  check: "تحقق",
  reset: "إعادة تعيين",
  showSolution: "إظهار الحل",
  hideSolution: "إخفاء الحل",
  required: "يرجى الإجابة عن هذا السؤال.",
  summary: (correct, total) => correct === total ? "كل الإجابات صحيحة." : `${correct} من ${total} صحيحة.`,
  feedbackOption: "الملاحظات",
  feedbackOnCheck: "عند تحقق القارئ",
  feedbackOnSubmit: "بعد الإرسال",
  requiredOption: "مطلوب"
};
export {
  ar_default as default
};
