import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Праверыць",
  reset: "Скінуць",
  showSolution: "Паказаць рашэнне",
  hideSolution: "Схаваць рашэнне",
  required: "Калі ласка, адкажыце на гэтае пытанне.",
  summary: (correct, total) => (correct === total ? "Усё правільна." : `Правільна: ${correct} з ${total}.`),
  feedbackOption: "Зваротная сувязь",
  feedbackOnCheck: "Пры праверцы чытачом",
  feedbackOnSubmit: "Пасля адпраўкі",
  requiredOption: "Абавязкова",
} satisfies Catalog<ExerciseMessages>
