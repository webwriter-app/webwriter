import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Санҷидан",
  reset: "Аз нав барқарор кардан",
  showSolution: "Ҳалро нишон додан",
  hideSolution: "Ҳалро пинҳон кардан",
  required: "Лутфан ба ин савол ҷавоб диҳед.",
  summary: (correct, total) => (correct === total ? "Ҳама дуруст аст." : `${correct} аз ${total} дуруст аст.`),
  feedbackOption: "Бозгӯй",
  feedbackOnCheck: "Ҳангоми санҷиши хонанда",
  feedbackOnSubmit: "Пас аз фиристодан",
  requiredOption: "Ҳатмӣ",
} satisfies Catalog<ExerciseMessages>
