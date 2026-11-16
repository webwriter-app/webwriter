import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Provjeri",
  reset: "Vrati",
  showSolution: "Prikaži rješenje",
  hideSolution: "Sakrij rješenje",
  required: "Odgovorite na ovo pitanje.",
  summary: (correct, total) => (correct === total ? "Sve je tačno." : `Tačno: ${correct} od ${total}.`),
  feedbackOption: "Povratna informacija",
  feedbackOnCheck: "Kada čitalac provjerava",
  feedbackOnSubmit: "Nakon slanja",
  requiredOption: "Obavezno",
} satisfies Catalog<ExerciseMessages>
