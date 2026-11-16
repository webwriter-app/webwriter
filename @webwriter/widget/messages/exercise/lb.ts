import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Préifen",
  reset: "Zrécksetzen",
  showSolution: "Léisung weisen",
  hideSolution: "Léisung verstoppen",
  required: "Beäntwert w.e.g. dës Fro.",
  summary: (correct, total) => (correct === total ? "Alles richteg." : `${correct} vun ${total} richteg.`),
  feedbackOption: "Réckmeldung",
  feedbackOnCheck: "Beim Préifen",
  feedbackOnSubmit: "Nom Ofschécken",
  requiredOption: "Obligatoresch",
} satisfies Catalog<ExerciseMessages>
