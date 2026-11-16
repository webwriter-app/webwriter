import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "检查",
  reset: "重设",
  showSolution: "显示答案",
  hideSolution: "隐藏答案",
  required: "请回答呢条问题。",
  summary: (correct, total) => (correct === total ? "全部啱晒。" : `${total} 题入面啱咗 ${correct} 题。`),
  feedbackOption: "回馈",
  feedbackOnCheck: "读者检查嗰阵",
  feedbackOnSubmit: "提交之后",
  requiredOption: "必答",
} satisfies Catalog<ExerciseMessages>
