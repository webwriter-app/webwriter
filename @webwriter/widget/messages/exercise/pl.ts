import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Sprawdź",
  reset: "Resetuj",
  showSolution: "Pokaż rozwiązanie",
  hideSolution: "Ukryj rozwiązanie",
  required: "Odpowiedz na to pytanie.",
  summary: (correct, total) => (correct === total ? "Wszystko jest poprawne." : `Poprawnie: ${correct} z ${total}.`),
  feedbackOption: "Informacja zwrotna",
  feedbackOnCheck: "Przy sprawdzaniu przez czytelnika",
  feedbackOnSubmit: "Po wysłaniu",
  requiredOption: "Wymagane",
} satisfies Catalog<ExerciseMessages>
