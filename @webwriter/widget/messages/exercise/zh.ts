import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "检查",
  reset: "重置",
  showSolution: "显示答案",
  hideSolution: "隐藏答案",
  required: "请回答此问题。",
  summary: (correct, total) => (correct === total ? "全部正确。" : `${total} 题中答对 ${correct} 题。`),
  feedbackOption: "反馈",
  feedbackOnCheck: "读者检查时",
  feedbackOnSubmit: "提交后",
  requiredOption: "必答",
} satisfies Catalog<ExerciseMessages>
