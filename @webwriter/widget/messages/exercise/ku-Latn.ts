import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Kontrol bike",
  reset: "Vegerîne",
  showSolution: "Çareseriyê nîşan bide",
  hideSolution: "Çareseriyê veşêre",
  required: "Ji kerema xwe bersiva vê pirsê bidin.",
  summary: (correct, total) => (correct === total ? "Hemû rast in." : `${correct} ji ${total} rast in.`),
  feedbackOption: "Bersiv",
  feedbackOnCheck: "Dema xwendevan kontrol dike",
  feedbackOnSubmit: "Piştî şandinê",
  requiredOption: "Pêwîst",
} satisfies Catalog<ExerciseMessages>
