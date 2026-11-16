import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Controleren",
  reset: "Opnieuw instellen",
  showSolution: "Oplossing tonen",
  hideSolution: "Oplossing verbergen",
  required: "Beantwoord deze vraag.",
  summary: (correct, total) => (correct === total ? "Alles is juist." : `${correct} van ${total} juist.`),
  feedbackOption: "Feedback",
  feedbackOnCheck: "Wanneer de lezer controleert",
  feedbackOnSubmit: "Na het indienen",
  requiredOption: "Verplicht",
} satisfies Catalog<ExerciseMessages>
