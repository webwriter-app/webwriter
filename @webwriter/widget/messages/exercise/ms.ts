import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Semak",
  reset: "Set semula",
  showSolution: "Tunjukkan penyelesaian",
  hideSolution: "Sembunyikan penyelesaian",
  required: "Sila jawab soalan ini.",
  summary: (correct, total) => (correct === total ? "Semuanya betul." : `${correct} daripada ${total} betul.`),
  feedbackOption: "Maklum balas",
  feedbackOnCheck: "Apabila pembaca menyemak",
  feedbackOnSubmit: "Selepas dihantar",
  requiredOption: "Wajib",
} satisfies Catalog<ExerciseMessages>
