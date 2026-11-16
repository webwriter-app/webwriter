import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Preveri",
  reset: "Ponastavi",
  showSolution: "Pokaži rešitev",
  hideSolution: "Skrij rešitev",
  required: "Odgovorite na to vprašanje.",
  summary: (correct, total) => (correct === total ? "Vse je pravilno." : `Pravilno: ${correct} od ${total}.`),
  feedbackOption: "Povratna informacija",
  feedbackOnCheck: "Ko bralec preveri",
  feedbackOnSubmit: "Po oddaji",
  requiredOption: "Obvezno",
} satisfies Catalog<ExerciseMessages>
