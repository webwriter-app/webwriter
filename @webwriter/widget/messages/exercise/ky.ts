import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Текшерүү",
  reset: "Баштапкы абалга келтирүү",
  showSolution: "Чечимди көрсөтүү",
  hideSolution: "Чечимди жашыруу",
  required: "Бул суроого жооп бериңиз.",
  summary: (correct, total) => (correct === total ? "Баары туура." : `${total} ичинен ${correct} туура.`),
  feedbackOption: "Кайтарым байланыш",
  feedbackOnCheck: "Окуучу текшергенде",
  feedbackOnSubmit: "Жөнөткөндөн кийин",
  requiredOption: "Милдеттүү",
} satisfies Catalog<ExerciseMessages>
