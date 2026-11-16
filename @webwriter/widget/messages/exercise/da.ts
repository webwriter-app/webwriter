import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Tjek",
  reset: "Nulstil",
  showSolution: "Vis løsning",
  hideSolution: "Skjul løsning",
  required: "Besvar venligst dette spørgsmål.",
  summary: (correct, total) => (correct === total ? "Alt er rigtigt." : `${correct} af ${total} rigtige.`),
  feedbackOption: "Feedback",
  feedbackOnCheck: "Når læseren tjekker",
  feedbackOnSubmit: "Efter indsendelse",
  requiredOption: "Obligatorisk",
} satisfies Catalog<ExerciseMessages>
