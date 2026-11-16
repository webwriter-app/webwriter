var ne_default = {
  check: "जाँच गर्नुहोस्",
  reset: "रिसेट गर्नुहोस्",
  showSolution: "समाधान देखाउनुहोस्",
  hideSolution: "समाधान लुकाउनुहोस्",
  required: "कृपया यो प्रश्नको उत्तर दिनुहोस्।",
  summary: (correct, total) => correct === total ? "सबै सही छ।" : `${total} मध्ये ${correct} सही।`,
  feedbackOption: "प्रतिक्रिया",
  feedbackOnCheck: "पाठकले जाँच गर्दा",
  feedbackOnSubmit: "बुझाएपछि",
  requiredOption: "अनिवार्य"
};
export {
  ne_default as default
};
