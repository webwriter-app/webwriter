import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "جانچیں",
  reset: "ری سیٹ کریں",
  showSolution: "حل دکھائیں",
  hideSolution: "حل چھپائیں",
  required: "براہِ کرم اس سوال کا جواب دیں۔",
  summary: (correct, total) => (correct === total ? "سب جوابات درست ہیں۔" : `${total} میں سے ${correct} درست۔`),
  feedbackOption: "فیڈ بیک",
  feedbackOnCheck: "جب قاری جانچے",
  feedbackOnSubmit: "جمع کرانے کے بعد",
  requiredOption: "لازمی",
} satisfies Catalog<ExerciseMessages>
