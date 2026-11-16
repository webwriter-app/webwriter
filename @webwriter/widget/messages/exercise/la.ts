import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Probare",
  reset: "Restituere",
  showSolution: "Solutionem ostendere",
  hideSolution: "Solutionem celare",
  required: "Responde, quaeso, huic quaestioni.",
  summary: (correct, total) => (correct === total ? "Omnia recta sunt." : `${correct} ex ${total} recta.`),
  feedbackOption: "Responsum",
  feedbackOnCheck: "Cum lector probat",
  feedbackOnSubmit: "Post missionem",
  requiredOption: "Necessarium",
} satisfies Catalog<ExerciseMessages>
