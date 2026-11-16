import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Тексеру",
  reset: "Бастапқы күйге қайтару",
  showSolution: "Шешімді көрсету",
  hideSolution: "Шешімді жасыру",
  required: "Осы сұраққа жауап беріңіз.",
  summary: (correct, total) => (correct === total ? "Барлығы дұрыс." : `${total} ішінен ${correct} дұрыс.`),
  feedbackOption: "Кері байланыс",
  feedbackOnCheck: "Оқушы тексерген кезде",
  feedbackOnSubmit: "Жібергеннен кейін",
  requiredOption: "Міндетті",
} satisfies Catalog<ExerciseMessages>
