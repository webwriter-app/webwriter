import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "تحقق",
  reset: "إعادة تعيين",
  showSolution: "إظهار الحل",
  hideSolution: "إخفاء الحل",
  required: "يرجى الإجابة عن هذا السؤال.",
  summary: (correct, total) => (correct === total ? "كل الإجابات صحيحة." : `${correct} من ${total} صحيحة.`),
  feedbackOption: "الملاحظات",
  feedbackOnCheck: "عند تحقق القارئ",
  feedbackOnSubmit: "بعد الإرسال",
  requiredOption: "مطلوب",
} satisfies Catalog<ExerciseMessages>
