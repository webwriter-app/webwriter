import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Vérifier",
  reset: "Réinitialiser",
  showSolution: "Afficher la solution",
  hideSolution: "Masquer la solution",
  required: "Veuillez répondre à cette question.",
  summary: (correct, total) => (correct === total ? "Tout est correct." : `${correct} sur ${total} corrects.`),
  feedbackOption: "Retour",
  feedbackOnCheck: "Lors de la vérification",
  feedbackOnSubmit: "Après l’envoi",
  requiredOption: "Obligatoire",
} satisfies Catalog<ExerciseMessages>
