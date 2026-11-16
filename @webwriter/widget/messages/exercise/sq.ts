import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Kontrollo",
  reset: "Rivendos",
  showSolution: "Shfaq zgjidhjen",
  hideSolution: "Fshih zgjidhjen",
  required: "Ju lutemi përgjigjuni kësaj pyetjeje.",
  summary: (correct, total) => (correct === total ? "Gjithçka është e saktë." : `Të sakta: ${correct} nga ${total}.`),
  feedbackOption: "Reagim",
  feedbackOnCheck: "Kur lexuesi kontrollon",
  feedbackOnSubmit: "Pas dërgimit",
  requiredOption: "E detyrueshme",
} satisfies Catalog<ExerciseMessages>
