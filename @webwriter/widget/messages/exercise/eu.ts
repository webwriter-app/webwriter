import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Egiaztatu",
  reset: "Berrezarri",
  showSolution: "Erakutsi soluzioa",
  hideSolution: "Ezkutatu soluzioa",
  required: "Mesedez, erantzun galdera honi.",
  summary: (correct, total) => (correct === total ? "Dena zuzen dago." : `${total}tik ${correct} zuzen.`),
  feedbackOption: "Iritzia",
  feedbackOnCheck: "Egiaztatzean",
  feedbackOnSubmit: "Bidali ondoren",
  requiredOption: "Derrigorrezkoa",
} satisfies Catalog<ExerciseMessages>
