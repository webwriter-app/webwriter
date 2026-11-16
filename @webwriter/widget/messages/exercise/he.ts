import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "בדיקה",
  reset: "איפוס",
  showSolution: "הצגת הפתרון",
  hideSolution: "הסתרת הפתרון",
  required: "יש לענות על שאלה זו.",
  summary: (correct, total) => (correct === total ? "כל התשובות נכונות." : `${correct} מתוך ${total} נכונות.`),
  feedbackOption: "משוב",
  feedbackOnCheck: "כשהקורא בודק",
  feedbackOnSubmit: "לאחר השליחה",
  requiredOption: "חובה",
} satisfies Catalog<ExerciseMessages>
