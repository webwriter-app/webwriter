import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Kontrolli",
  reset: "Lähtesta",
  showSolution: "Näita lahendust",
  hideSolution: "Peida lahendus",
  required: "Vasta sellele küsimusele.",
  summary: (correct, total) => (correct === total ? "Kõik on õige." : `Õigeid: ${correct}, kokku ${total}.`),
  feedbackOption: "Tagasiside",
  feedbackOnCheck: "Lugeja kontrollimisel",
  feedbackOnSubmit: "Pärast esitamist",
  requiredOption: "Kohustuslik",
} satisfies Catalog<ExerciseMessages>
