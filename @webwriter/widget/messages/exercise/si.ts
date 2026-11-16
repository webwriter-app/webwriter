import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "පරීක්ෂා කරන්න",
  reset: "යළි සකසන්න",
  showSolution: "විසඳුම පෙන්වන්න",
  hideSolution: "විසඳුම සඟවන්න",
  required: "කරුණාකර මෙම ප්‍රශ්නයට පිළිතුරු දෙන්න.",
  summary: (correct, total) => (correct === total ? "සියල්ල නිවැරදියි." : `${total} න් ${correct} ක් නිවැරදියි.`),
  feedbackOption: "ප්‍රතිපෝෂණ",
  feedbackOnCheck: "පාඨකයා පරීක්ෂා කරන විට",
  feedbackOnSubmit: "ඉදිරිපත් කිරීමෙන් පසු",
  requiredOption: "අනිවාර්ය",
} satisfies Catalog<ExerciseMessages>
