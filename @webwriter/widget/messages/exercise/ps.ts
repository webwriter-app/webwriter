import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "وګورئ",
  reset: "بیا تنظیمول",
  showSolution: "حل ښکاره کړئ",
  hideSolution: "حل پټ کړئ",
  required: "مهرباني وکړئ دې پوښتنې ته ځواب ورکړئ.",
  summary: (correct, total) => (correct === total ? "ټول ځوابونه سم دي." : `${total} څخه ${correct} سم دي.`),
  feedbackOption: "غبرګون",
  feedbackOnCheck: "کله چې لوستونکی وګوري",
  feedbackOnSubmit: "له سپارلو وروسته",
  requiredOption: "اړین",
} satisfies Catalog<ExerciseMessages>
