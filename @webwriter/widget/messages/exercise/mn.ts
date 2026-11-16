import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Шалгах",
  reset: "Дахин тохируулах",
  showSolution: "Шийдлийг харуулах",
  hideSolution: "Шийдлийг нуух",
  required: "Энэ асуултад хариулна уу.",
  summary: (correct, total) => (correct === total ? "Бүгд зөв." : `${total}-ийн ${correct} нь зөв.`),
  feedbackOption: "Санал хүсэлт",
  feedbackOnCheck: "Уншигч шалгах үед",
  feedbackOnSubmit: "Илгээсний дараа",
  requiredOption: "Заавал",
} satisfies Catalog<ExerciseMessages>
