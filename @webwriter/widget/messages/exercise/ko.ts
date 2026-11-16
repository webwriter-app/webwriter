import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "확인",
  reset: "초기화",
  showSolution: "정답 보기",
  hideSolution: "정답 숨기기",
  required: "이 문제에 답해 주세요.",
  summary: (correct, total) => (correct === total ? "모두 맞았습니다." : `${total}개 중 ${correct}개 정답입니다.`),
  feedbackOption: "피드백",
  feedbackOnCheck: "독자가 확인할 때",
  feedbackOnSubmit: "제출 후",
  requiredOption: "필수",
} satisfies Catalog<ExerciseMessages>
