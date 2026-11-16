import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Έλεγχος",
  reset: "Επαναφορά",
  showSolution: "Εμφάνιση λύσης",
  hideSolution: "Απόκρυψη λύσης",
  required: "Απαντήστε σε αυτή την ερώτηση.",
  summary: (correct, total) => (correct === total ? "Όλα είναι σωστά." : `${correct} από ${total} σωστά.`),
  feedbackOption: "Σχόλια",
  feedbackOnCheck: "Όταν ο αναγνώστης κάνει έλεγχο",
  feedbackOnSubmit: "Μετά την υποβολή",
  requiredOption: "Υποχρεωτικό",
} satisfies Catalog<ExerciseMessages>
