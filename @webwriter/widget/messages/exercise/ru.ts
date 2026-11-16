import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Проверить",
  reset: "Сбросить",
  showSolution: "Показать решение",
  hideSolution: "Скрыть решение",
  required: "Пожалуйста, ответьте на этот вопрос.",
  summary: (correct, total) => (correct === total ? "Всё верно." : `Верно: ${correct} из ${total}.`),
  feedbackOption: "Обратная связь",
  feedbackOnCheck: "При проверке читателем",
  feedbackOnSubmit: "После отправки",
  requiredOption: "Обязательно",
} satisfies Catalog<ExerciseMessages>
