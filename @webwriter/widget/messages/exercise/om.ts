import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Mulʼisi",
  reset: "Deebisii qopheessi",
  showSolution: "Furmaata agarsiisi",
  hideSolution: "Furmaata dhoksi",
  required: "Maaloo gaaffii kanaaf deebisi.",
  summary: (correct, total) => (correct === total ? "Hundi sirrii dha." : `${total} keessaa ${correct} sirrii dha.`),
  feedbackOption: "Yaada deebii",
  feedbackOnCheck: "Dubbisaan yeroo mulʼisu",
  feedbackOnSubmit: "Erga ergamee booda",
  requiredOption: "Dirqama",
} satisfies Catalog<ExerciseMessages>
