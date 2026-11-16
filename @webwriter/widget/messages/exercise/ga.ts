import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Seiceáil",
  reset: "Athshocraigh",
  showSolution: "Taispeáin an freagra",
  hideSolution: "Folaigh an freagra",
  required: "Freagair an cheist seo, le do thoil.",
  summary: (correct, total) => (correct === total ? "Gach rud ceart." : `${correct} as ${total} ceart.`),
  feedbackOption: "Aiseolas",
  feedbackOnCheck: "Nuair a sheiceálann an léitheoir",
  feedbackOnSubmit: "Tar éis a chur isteach",
  requiredOption: "Riachtanach",
} satisfies Catalog<ExerciseMessages>
