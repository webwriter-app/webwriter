import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Verifică",
  reset: "Resetează",
  showSolution: "Arată soluția",
  hideSolution: "Ascunde soluția",
  required: "Vă rugăm să răspundeți la această întrebare.",
  summary: (correct, total) => (correct === total ? "Totul este corect." : `Corecte: ${correct} din ${total}.`),
  feedbackOption: "Feedback",
  feedbackOnCheck: "Când cititorul verifică",
  feedbackOnSubmit: "După trimitere",
  requiredOption: "Obligatoriu",
} satisfies Catalog<ExerciseMessages>
