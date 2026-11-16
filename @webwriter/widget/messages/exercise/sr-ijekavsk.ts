import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Провјери",
  reset: "Врати",
  showSolution: "Прикажи рјешење",
  hideSolution: "Сакриј рјешење",
  required: "Одговорите на ово питање.",
  summary: (correct, total) => (correct === total ? "Све је тачно." : `Тачно: ${correct} од ${total}.`),
  feedbackOption: "Повратна информација",
  feedbackOnCheck: "Када читалац провјерава",
  feedbackOnSubmit: "Након слања",
  requiredOption: "Обавезно",
} satisfies Catalog<ExerciseMessages>
