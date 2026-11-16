import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "پشکنین",
  reset: "دووبارە ڕێکخستنەوە",
  showSolution: "پیشاندانی وەڵام",
  hideSolution: "شاردنەوەی وەڵام",
  required: "تکایە وەڵامی ئەم پرسیارە بدەنەوە.",
  summary: (correct, total) => (correct === total ? "هەموو وەڵامەکان ڕاستن." : `${correct} لە ${total} ڕاستە.`),
  feedbackOption: "ڕاوەستە",
  feedbackOnCheck: "کاتێک خوێنەر دەپشکنێت",
  feedbackOnSubmit: "دوای ناردن",
  requiredOption: "پێویست",
} satisfies Catalog<ExerciseMessages>
