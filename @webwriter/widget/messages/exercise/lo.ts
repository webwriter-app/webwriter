import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "ກວດສອບ",
  reset: "ຣີເຊັດ",
  showSolution: "ສະແດງຄຳເຉີຍ",
  hideSolution: "ເຊື່ອງຄຳເຉີຍ",
  required: "ກະລຸນາຕອບຄຳຖາມນີ້.",
  summary: (correct, total) => (correct === total ? "ຖືກຕ້ອງທັງໝົດ." : `ຖືກ ${correct} ຈາກ ${total}.`),
  feedbackOption: "ຄຳຕິຊົມ",
  feedbackOnCheck: "ເມື່ອຜູ້ອ່ານກວດສອບ",
  feedbackOnSubmit: "ຫຼັງຈາກສົ່ງ",
  requiredOption: "ຈຳເປັນ",
} satisfies Catalog<ExerciseMessages>
