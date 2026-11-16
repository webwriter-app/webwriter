import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "کونترۆل بکە",
  reset: "ڤەگێڕە",
  showSolution: "چارەسەریێ نیشان بدە",
  hideSolution: "چارەسەریێ ڤەشێرە",
  required: "ژ کەرەما خۆ بەرسڤا ڤێ پرسێ بدەن.",
  summary: (correct, total) => (correct === total ? "هەمی ڕاست نە." : `${correct} ژ ${total} ڕاست نە.`),
  feedbackOption: "بەرسڤ",
  feedbackOnCheck: "دەما خوێندەڤان کونترۆل دکە",
  feedbackOnSubmit: "پشتی هنارتنێ",
  requiredOption: "پێدڤی",
} satisfies Catalog<ExerciseMessages>
