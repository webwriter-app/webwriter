import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Iċċekkja",
  reset: "Irrisettja",
  showSolution: "Uri s-soluzzjoni",
  hideSolution: "Aħbi s-soluzzjoni",
  required: "Jekk jogħġbok wieġeb din il-mistoqsija.",
  summary: (correct, total) => (correct === total ? "Kollox tajjeb." : `${correct} minn ${total} tajbin.`),
  feedbackOption: "Feedback",
  feedbackOnCheck: "Meta l-qarrej jiċċekkja",
  feedbackOnSubmit: "Wara li tibgħat",
  requiredOption: "Meħtieġ",
} satisfies Catalog<ExerciseMessages>
