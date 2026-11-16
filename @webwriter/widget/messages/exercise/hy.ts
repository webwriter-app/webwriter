import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Ստուգել",
  reset: "Վերականգնել",
  showSolution: "Ցույց տալ լուծումը",
  hideSolution: "Թաքցնել լուծումը",
  required: "Խնդրում ենք պատասխանել այս հարցին։",
  summary: (correct, total) => (correct === total ? "Ամեն ինչ ճիշտ է։" : `${total}-ից ${correct}-ը ճիշտ է։`),
  feedbackOption: "Հետադարձ կապ",
  feedbackOnCheck: "Երբ ընթերցողը ստուգում է",
  feedbackOnSubmit: "Ուղարկելուց հետո",
  requiredOption: "Պարտադիր",
} satisfies Catalog<ExerciseMessages>
