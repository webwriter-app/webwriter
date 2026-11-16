import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Skontrolovať",
  reset: "Obnoviť",
  showSolution: "Zobraziť riešenie",
  hideSolution: "Skryť riešenie",
  required: "Odpovedzte, prosím, na túto otázku.",
  summary: (correct, total) => (correct === total ? "Všetko je správne." : `Správne: ${correct} z ${total}.`),
  feedbackOption: "Spätná väzba",
  feedbackOnCheck: "Pri kontrole čitateľom",
  feedbackOnSubmit: "Po odoslaní",
  requiredOption: "Povinné",
} satisfies Catalog<ExerciseMessages>
