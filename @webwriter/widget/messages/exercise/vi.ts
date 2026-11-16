import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Kiểm tra",
  reset: "Đặt lại",
  showSolution: "Hiện lời giải",
  hideSolution: "Ẩn lời giải",
  required: "Vui lòng trả lời câu hỏi này.",
  summary: (correct, total) => (correct === total ? "Tất cả đều đúng." : `Đúng ${correct} trên ${total}.`),
  feedbackOption: "Phản hồi",
  feedbackOnCheck: "Khi người đọc kiểm tra",
  feedbackOnSubmit: "Sau khi nộp bài",
  requiredOption: "Bắt buộc",
} satisfies Catalog<ExerciseMessages>
