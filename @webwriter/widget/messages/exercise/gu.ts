import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "તપાસો",
  reset: "રીસેટ કરો",
  showSolution: "ઉકેલ બતાવો",
  hideSolution: "ઉકેલ છુપાવો",
  required: "કૃપા કરીને આ પ્રશ્નનો જવાબ આપો.",
  summary: (correct, total) => (correct === total ? "બધું સાચું છે." : `${total} માંથી ${correct} સાચા.`),
  feedbackOption: "પ્રતિસાદ",
  feedbackOnCheck: "વાચક તપાસે ત્યારે",
  feedbackOnSubmit: "સબમિટ કર્યા પછી",
  requiredOption: "ફરજિયાત",
} satisfies Catalog<ExerciseMessages>
