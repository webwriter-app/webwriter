var az_default = {
  check: "Yoxla",
  reset: "Sıfırla",
  showSolution: "Həlli göstər",
  hideSolution: "Həlli gizlət",
  required: "Zəhmət olmasa, bu sualı cavablandırın.",
  summary: (correct, total) => correct === total ? "Hamısı düzgündür." : `${total} sualdan ${correct} düzgündür.`,
  feedbackOption: "Rəy",
  feedbackOnCheck: "Oxucu yoxlayanda",
  feedbackOnSubmit: "Göndərdikdən sonra",
  requiredOption: "Məcburi"
};
export {
  az_default as default
};
