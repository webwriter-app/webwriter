import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Priksa",
  reset: "Setel ulang",
  showSolution: "Tuduhake solusi",
  hideSolution: "Singidake solusi",
  required: "Mangga wangsulana pitakonan iki.",
  summary: (correct, total) => (correct === total ? "Kabeh bener." : `${correct} saka ${total} bener.`),
  feedbackOption: "Umpan balik",
  feedbackOnCheck: "Nalika pamaca mriksa",
  feedbackOnSubmit: "Sawise dikirim",
  requiredOption: "Wajib",
} satisfies Catalog<ExerciseMessages>
