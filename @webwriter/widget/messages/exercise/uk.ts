import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Перевірити",
  reset: "Скинути",
  showSolution: "Показати розв’язок",
  hideSolution: "Сховати розв’язок",
  required: "Будь ласка, дайте відповідь на це запитання.",
  summary: (correct, total) => (correct === total ? "Усе правильно." : `Правильно: ${correct} із ${total}.`),
  feedbackOption: "Зворотний зв’язок",
  feedbackOnCheck: "Під час перевірки читачем",
  feedbackOnSubmit: "Після надсилання",
  requiredOption: "Обов’язково",
} satisfies Catalog<ExerciseMessages>
