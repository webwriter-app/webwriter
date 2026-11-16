import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Prüfen",
  reset: "Zurücksetzen",
  showSolution: "Lösung anzeigen",
  hideSolution: "Lösung verbergen",
  required: "Bitte beantworte diese Aufgabe.",
  summary: (correct, total) => (correct === total ? "Alles richtig." : `${correct} von ${total} richtig.`),
  feedbackOption: "Rückmeldung",
  feedbackOnCheck: "Beim Prüfen",
  feedbackOnSubmit: "Nach dem Abgeben",
  requiredOption: "Pflichtaufgabe",
} satisfies Catalog<ExerciseMessages>
