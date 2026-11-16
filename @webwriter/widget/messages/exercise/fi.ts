import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Tarkista",
  reset: "Nollaa",
  showSolution: "Näytä ratkaisu",
  hideSolution: "Piilota ratkaisu",
  required: "Vastaa tähän kysymykseen.",
  summary: (correct, total) => (correct === total ? "Kaikki on oikein." : `Oikein: ${correct}, yhteensä ${total}.`),
  feedbackOption: "Palaute",
  feedbackOnCheck: "Kun lukija tarkistaa",
  feedbackOnSubmit: "Lähettämisen jälkeen",
  requiredOption: "Pakollinen",
} satisfies Catalog<ExerciseMessages>
