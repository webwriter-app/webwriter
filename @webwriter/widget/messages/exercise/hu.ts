import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Ellenőrzés",
  reset: "Visszaállítás",
  showSolution: "Megoldás megjelenítése",
  hideSolution: "Megoldás elrejtése",
  required: "Kérjük, válaszoljon erre a kérdésre.",
  summary: (correct, total) => (correct === total ? "Minden helyes." : `Helyes: ${correct}, összesen ${total}.`),
  feedbackOption: "Visszajelzés",
  feedbackOnCheck: "Az olvasó ellenőrzésekor",
  feedbackOnSubmit: "Beküldés után",
  requiredOption: "Kötelező",
} satisfies Catalog<ExerciseMessages>
