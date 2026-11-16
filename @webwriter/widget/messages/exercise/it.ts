import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Verifica",
  reset: "Reimposta",
  showSolution: "Mostra la soluzione",
  hideSolution: "Nascondi la soluzione",
  required: "Rispondi a questa domanda.",
  summary: (correct, total) => (correct === total ? "Tutto corretto." : `${correct} corrette su ${total}.`),
  feedbackOption: "Riscontro",
  feedbackOnCheck: "Alla verifica",
  feedbackOnSubmit: "Dopo l’invio",
  requiredOption: "Obbligatorio",
} satisfies Catalog<ExerciseMessages>
