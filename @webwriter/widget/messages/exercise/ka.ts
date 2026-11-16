import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "შემოწმება",
  reset: "საწყისზე დაბრუნება",
  showSolution: "ამოხსნის ჩვენება",
  hideSolution: "ამოხსნის დამალვა",
  required: "გთხოვთ, უპასუხეთ ამ კითხვას.",
  summary: (correct, total) => (correct === total ? "ყველაფერი სწორია." : `${total}-დან ${correct} სწორია.`),
  feedbackOption: "უკუკავშირი",
  feedbackOnCheck: "როცა მკითხველი ამოწმებს",
  feedbackOnSubmit: "გაგზავნის შემდეგ",
  requiredOption: "სავალდებულო",
} satisfies Catalog<ExerciseMessages>
