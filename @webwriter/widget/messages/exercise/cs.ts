import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Zkontrolovat",
  reset: "Obnovit",
  showSolution: "Zobrazit řešení",
  hideSolution: "Skrýt řešení",
  required: "Odpovězte prosím na tuto otázku.",
  summary: (correct, total) => (correct === total ? "Vše je správně." : `Správně: ${correct} z ${total}.`),
  feedbackOption: "Zpětná vazba",
  feedbackOnCheck: "Při kontrole čtenářem",
  feedbackOnSubmit: "Po odeslání",
  requiredOption: "Povinné",
} satisfies Catalog<ExerciseMessages>
