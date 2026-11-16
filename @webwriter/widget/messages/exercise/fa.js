var fa_default = {
  check: "بررسی",
  reset: "بازنشانی",
  showSolution: "نمایش پاسخ",
  hideSolution: "پنهان کردن پاسخ",
  required: "لطفاً به این پرسش پاسخ دهید.",
  summary: (correct, total) => correct === total ? "همه پاسخ‌ها درست است." : `${correct} از ${total} درست است.`,
  feedbackOption: "بازخورد",
  feedbackOnCheck: "هنگام بررسی خواننده",
  feedbackOnSubmit: "پس از ارسال",
  requiredOption: "الزامی"
};
export {
  fa_default as default
};
