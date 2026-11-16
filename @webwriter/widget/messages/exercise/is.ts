import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Athuga",
  reset: "Endurstilla",
  showSolution: "Sýna lausn",
  hideSolution: "Fela lausn",
  required: "Vinsamlegast svaraðu þessari spurningu.",
  summary: (correct, total) => (correct === total ? "Allt er rétt." : `${correct} af ${total} rétt.`),
  feedbackOption: "Endurgjöf",
  feedbackOnCheck: "Þegar lesandinn athugar",
  feedbackOnSubmit: "Eftir innsendingu",
  requiredOption: "Skylda",
} satisfies Catalog<ExerciseMessages>
