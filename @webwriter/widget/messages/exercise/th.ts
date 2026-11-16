import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "ตรวจสอบ",
  reset: "รีเซ็ต",
  showSolution: "แสดงเฉลย",
  hideSolution: "ซ่อนเฉลย",
  required: "กรุณาตอบคำถามนี้",
  summary: (correct, total) => (correct === total ? "ถูกต้องทั้งหมด" : `ถูก ${correct} จาก ${total} ข้อ`),
  feedbackOption: "ข้อเสนอแนะ",
  feedbackOnCheck: "เมื่อผู้อ่านตรวจสอบ",
  feedbackOnSubmit: "หลังส่งคำตอบ",
  requiredOption: "จำเป็นต้องตอบ",
} satisfies Catalog<ExerciseMessages>
