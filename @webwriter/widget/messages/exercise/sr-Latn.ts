import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Proveri",
  reset: "Vrati",
  showSolution: "Prikaži rešenje",
  hideSolution: "Sakrij rešenje",
  required: "Odgovorite na ovo pitanje.",
  summary: (correct, total) => (correct === total ? "Sve je tačno." : `Tačno: ${correct} od ${total}.`),
  feedbackOption: "Povratna informacija",
  feedbackOnCheck: "Kada čitalac proverava",
  feedbackOnSubmit: "Nakon slanja",
  requiredOption: "Obavezno",
} satisfies Catalog<ExerciseMessages>
