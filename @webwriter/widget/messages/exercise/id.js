var id_default = {
  check: "Periksa",
  reset: "Atur ulang",
  showSolution: "Tampilkan solusi",
  hideSolution: "Sembunyikan solusi",
  required: "Silakan jawab pertanyaan ini.",
  summary: (correct, total) => correct === total ? "Semuanya benar." : `${correct} dari ${total} benar.`,
  feedbackOption: "Umpan balik",
  feedbackOnCheck: "Saat pembaca memeriksa",
  feedbackOnSubmit: "Setelah dikirim",
  requiredOption: "Wajib"
};
export {
  id_default as default
};
