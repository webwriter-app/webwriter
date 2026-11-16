import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Barla",
  reset: "Başlangyja gaýtar",
  showSolution: "Çözgüdi görkez",
  hideSolution: "Çözgüdi gizle",
  required: "Bu soraga jogap beriň.",
  summary: (correct, total) => (correct === total ? "Hemmesi dogry." : `${total} soragyň ${correct} dogry.`),
  feedbackOption: "Seslenme",
  feedbackOnCheck: "Okyjy barlanda",
  feedbackOnSubmit: "Iberenden soň",
  requiredOption: "Hökmany",
} satisfies Catalog<ExerciseMessages>
