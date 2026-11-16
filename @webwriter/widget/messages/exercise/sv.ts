import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Kontrollera",
  reset: "Återställ",
  showSolution: "Visa lösning",
  hideSolution: "Dölj lösning",
  required: "Besvara den här frågan.",
  summary: (correct, total) => (correct === total ? "Allt är rätt." : `${correct} av ${total} rätt.`),
  feedbackOption: "Återkoppling",
  feedbackOnCheck: "När läsaren kontrollerar",
  feedbackOnSubmit: "Efter inlämning",
  requiredOption: "Obligatorisk",
} satisfies Catalog<ExerciseMessages>
