import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Comprova",
  reset: "Restableix",
  showSolution: "Mostra la solució",
  hideSolution: "Amaga la solució",
  required: "Responeu esta pregunta.",
  summary: (correct, total) => (correct === total ? "Tot és correcte." : `${correct} de ${total} correctes.`),
  feedbackOption: "Retroacció",
  feedbackOnCheck: "En comprovar",
  feedbackOnSubmit: "Després d’enviar",
  requiredOption: "Obligatori",
} satisfies Catalog<ExerciseMessages>
