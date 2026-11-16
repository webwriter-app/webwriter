var km_default = {
  check: "ពិនិត្យ",
  reset: "កំណត់ឡើងវិញ",
  showSolution: "បង្ហាញចម្លើយ",
  hideSolution: "លាក់ចម្លើយ",
  required: "សូមឆ្លើយសំណួរនេះ។",
  summary: (correct, total) => correct === total ? "ត្រឹមត្រូវទាំងអស់។" : `ត្រឹមត្រូវ ${correct} ក្នុងចំណោម ${total}។`,
  feedbackOption: "មតិកែលម្អ",
  feedbackOnCheck: "នៅពេលអ្នកអានពិនិត្យ",
  feedbackOnSubmit: "បន្ទាប់ពីដាក់ស្នើ",
  requiredOption: "ចាំបាច់"
};
export {
  km_default as default
};
