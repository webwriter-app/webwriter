var ta_default = {
  check: "சரிபார்க்கவும்",
  reset: "மீட்டமைக்கவும்",
  showSolution: "தீர்வைக் காட்டவும்",
  hideSolution: "தீர்வை மறைக்கவும்",
  required: "இந்தக் கேள்விக்குப் பதிலளிக்கவும்.",
  summary: (correct, total) => correct === total ? "அனைத்தும் சரி." : `${total} இல் ${correct} சரி.`,
  feedbackOption: "கருத்து",
  feedbackOnCheck: "வாசகர் சரிபார்க்கும்போது",
  feedbackOnSubmit: "சமர்ப்பித்த பிறகு",
  requiredOption: "கட்டாயம்"
};
export {
  ta_default as default
};
