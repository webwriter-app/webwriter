import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Tekshirish",
  reset: "Asl holatiga qaytarish",
  showSolution: "Yechimni ko‘rsatish",
  hideSolution: "Yechimni yashirish",
  required: "Iltimos, bu savolga javob bering.",
  summary: (correct, total) => (correct === total ? "Hammasi to‘g‘ri." : `${total} tadan ${correct} tasi to‘g‘ri.`),
  feedbackOption: "Fikr-mulohaza",
  feedbackOnCheck: "O‘quvchi tekshirganda",
  feedbackOnSubmit: "Yuborilgandan keyin",
  requiredOption: "Majburiy",
} satisfies Catalog<ExerciseMessages>
