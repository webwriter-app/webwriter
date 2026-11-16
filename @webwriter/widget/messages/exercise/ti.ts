import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "ፈትሽ",
  reset: "ዳግማይ ኣጽሪ",
  showSolution: "መፍትሒ ኣርኢ",
  hideSolution: "መፍትሒ ሕባእ",
  required: "በጃኹም ነዚ ሕቶ መልስዎ።",
  summary: (correct, total) => (correct === total ? "ኩሉ ቅኑዕ እዩ።" : `ካብ ${total} ${correct} ቅኑዕ እዩ።`),
  feedbackOption: "ርእይቶ",
  feedbackOnCheck: "ኣንባቢ ምስ ዝፈትሽ",
  feedbackOnSubmit: "ድሕሪ ምልኣኽ",
  requiredOption: "ግዱድ",
} satisfies Catalog<ExerciseMessages>
