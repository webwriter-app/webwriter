import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Провери",
  reset: "Врати",
  showSolution: "Прикажи го решението",
  hideSolution: "Скриј го решението",
  required: "Одговорете на ова прашање.",
  summary: (correct, total) => (correct === total ? "Сѐ е точно." : `Точни: ${correct} од ${total}.`),
  feedbackOption: "Повратна информација",
  feedbackOnCheck: "Кога читателот проверува",
  feedbackOnSubmit: "По испраќањето",
  requiredOption: "Задолжително",
} satisfies Catalog<ExerciseMessages>
