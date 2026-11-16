import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Comprobar",
  reset: "Restablecer",
  showSolution: "Mostrar solución",
  hideSolution: "Ocultar solución",
  required: "Responde a esta pregunta.",
  summary: (correct, total) => (correct === total ? "Todo es correcto." : `${correct} de ${total} correctas.`),
  feedbackOption: "Retroalimentación",
  feedbackOnCheck: "Al comprobar",
  feedbackOnSubmit: "Después de enviar",
  requiredOption: "Obligatorio",
} satisfies Catalog<ExerciseMessages>
