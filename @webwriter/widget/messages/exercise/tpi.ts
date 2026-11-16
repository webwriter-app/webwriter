import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Skelim",
  reset: "Statim gen",
  showSolution: "Soim bekim",
  hideSolution: "Hait bekim",
  required: "Plis bekim dispela askim.",
  summary: (correct, total) => (correct === total ? "Olgeta i stret." : `${correct} long ${total} i stret.`),
  feedbackOption: "Toktok bek",
  feedbackOnCheck: "Taim man i skelim",
  feedbackOnSubmit: "Bihain long em i salim",
  requiredOption: "Mas i gat",
} satisfies Catalog<ExerciseMessages>
