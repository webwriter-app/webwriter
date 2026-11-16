import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Verificar",
  reset: "Redefinir",
  showSolution: "Mostrar solução",
  hideSolution: "Ocultar solução",
  required: "Responda a esta pergunta.",
  summary: (correct, total) => (correct === total ? "Tudo correto." : `${correct} de ${total} corretas.`),
  feedbackOption: "Feedback",
  feedbackOnCheck: "Ao verificar",
  feedbackOnSubmit: "Após enviar",
  requiredOption: "Obrigatório",
} satisfies Catalog<ExerciseMessages>
