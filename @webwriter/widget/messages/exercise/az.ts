import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Yoxla",
  reset: "Sıfırla",
  showSolution: "Həlli göstər",
  hideSolution: "Həlli gizlət",
  required: "Zəhmət olmasa, bu sualı cavablandırın.",
  summary: (correct, total) => (correct === total ? "Hamısı düzgündür." : `${total} sualdan ${correct} düzgündür.`),
  feedbackOption: "Rəy",
  feedbackOnCheck: "Oxucu yoxlayanda",
  feedbackOnSubmit: "Göndərdikdən sonra",
  requiredOption: "Məcburi",
} satisfies Catalog<ExerciseMessages>
