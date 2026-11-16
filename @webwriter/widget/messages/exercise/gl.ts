import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Comprobar",
  reset: "Restablecer",
  showSolution: "Amosar a solución",
  hideSolution: "Agochar a solución",
  required: "Responde a esta pregunta.",
  summary: (correct, total) => (correct === total ? "Todo é correcto." : `${correct} de ${total} correctas.`),
  feedbackOption: "Retroalimentación",
  feedbackOnCheck: "Ao comprobar",
  feedbackOnSubmit: "Despois de enviar",
  requiredOption: "Obrigatorio",
} satisfies Catalog<ExerciseMessages>
