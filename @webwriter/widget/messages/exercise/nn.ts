import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Kontroller",
  reset: "Tilbakestill",
  showSolution: "Vis løysing",
  hideSolution: "Skjul løysing",
  required: "Svar på dette spørsmålet.",
  summary: (correct, total) => (correct === total ? "Alt er rett." : `${correct} av ${total} rette.`),
  feedbackOption: "Tilbakemelding",
  feedbackOnCheck: "Når lesaren kontrollerer",
  feedbackOnSubmit: "Etter innsending",
  requiredOption: "Obligatorisk",
} satisfies Catalog<ExerciseMessages>
