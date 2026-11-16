import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Kagua",
  reset: "Weka upya",
  showSolution: "Onyesha suluhisho",
  hideSolution: "Ficha suluhisho",
  required: "Tafadhali jibu swali hili.",
  summary: (correct, total) => (correct === total ? "Yote ni sahihi." : `${correct} kati ya ${total} ni sahihi.`),
  feedbackOption: "Maoni",
  feedbackOnCheck: "Msomaji anapokagua",
  feedbackOnSubmit: "Baada ya kuwasilisha",
  requiredOption: "Lazima",
} satisfies Catalog<ExerciseMessages>
