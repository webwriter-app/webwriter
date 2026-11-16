var tr_default = {
  check: "Denetle",
  reset: "Sıfırla",
  showSolution: "Çözümü göster",
  hideSolution: "Çözümü gizle",
  required: "Lütfen bu soruyu yanıtlayın.",
  summary: (correct, total) => correct === total ? "Hepsi doğru." : `${total} sorudan ${correct} doğru.`,
  feedbackOption: "Geri bildirim",
  feedbackOnCheck: "Okuyucu denetlediğinde",
  feedbackOnSubmit: "Gönderdikten sonra",
  requiredOption: "Zorunlu"
};
export {
  tr_default as default
};
