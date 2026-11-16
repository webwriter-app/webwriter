import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Patikrinti",
  reset: "Nustatyti iš naujo",
  showSolution: "Rodyti sprendimą",
  hideSolution: "Slėpti sprendimą",
  required: "Atsakykite į šį klausimą.",
  summary: (correct, total) => (correct === total ? "Viskas teisinga." : `Teisingai: ${correct} iš ${total}.`),
  feedbackOption: "Atsiliepimas",
  feedbackOnCheck: "Skaitytojui patikrinus",
  feedbackOnSubmit: "Pateikus",
  requiredOption: "Privaloma",
} satisfies Catalog<ExerciseMessages>
