import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Pārbaudīt",
  reset: "Atiestatīt",
  showSolution: "Rādīt risinājumu",
  hideSolution: "Slēpt risinājumu",
  required: "Lūdzu, atbildiet uz šo jautājumu.",
  summary: (correct, total) => (correct === total ? "Viss ir pareizi." : `Pareizi: ${correct} no ${total}.`),
  feedbackOption: "Atsauksme",
  feedbackOnCheck: "Kad lasītājs pārbauda",
  feedbackOnSubmit: "Pēc iesniegšanas",
  requiredOption: "Obligāts",
} satisfies Catalog<ExerciseMessages>
