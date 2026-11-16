import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Hubi",
  reset: "Dib u dhig",
  showSolution: "Muuji xalka",
  hideSolution: "Qari xalka",
  required: "Fadlan ka jawaab su'aashan.",
  summary: (correct, total) => (correct === total ? "Dhammaan waa sax." : `${correct} ee ${total} waa sax.`),
  feedbackOption: "Jawaab celin",
  feedbackOnCheck: "Marka akhristuhu hubiyo",
  feedbackOnSubmit: "Ka dib marka la gudbiyo",
  requiredOption: "Lagama maarmaan",
} satisfies Catalog<ExerciseMessages>
