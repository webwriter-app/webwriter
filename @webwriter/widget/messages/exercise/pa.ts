import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "ਜਾਂਚੋ",
  reset: "ਰੀਸੈੱਟ ਕਰੋ",
  showSolution: "ਹੱਲ ਵੇਖੋ",
  hideSolution: "ਹੱਲ ਲੁਕਾਓ",
  required: "ਕਿਰਪਾ ਕਰਕੇ ਇਸ ਸਵਾਲ ਦਾ ਜਵਾਬ ਦਿਓ।",
  summary: (correct, total) => (correct === total ? "ਸਭ ਸਹੀ ਹੈ।" : `${total} ਵਿੱਚੋਂ ${correct} ਸਹੀ।`),
  feedbackOption: "ਫੀਡਬੈਕ",
  feedbackOnCheck: "ਪਾਠਕ ਦੇ ਜਾਂਚਣ 'ਤੇ",
  feedbackOnSubmit: "ਜਮ੍ਹਾਂ ਕਰਨ ਤੋਂ ਬਾਅਦ",
  requiredOption: "ਲਾਜ਼ਮੀ",
} satisfies Catalog<ExerciseMessages>
