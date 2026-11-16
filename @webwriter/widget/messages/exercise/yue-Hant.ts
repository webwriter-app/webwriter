import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "檢查",
  reset: "重設",
  showSolution: "顯示答案",
  hideSolution: "隱藏答案",
  required: "請回答呢條問題。",
  summary: (correct, total) => (correct === total ? "全部啱晒。" : `${total} 題入面啱咗 ${correct} 題。`),
  feedbackOption: "回饋",
  feedbackOnCheck: "讀者檢查嗰陣",
  feedbackOnSubmit: "提交之後",
  requiredOption: "必答",
} satisfies Catalog<ExerciseMessages>
