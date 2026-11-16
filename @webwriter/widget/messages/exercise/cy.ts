import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "Gwirio",
  reset: "Ailosod",
  showSolution: "Dangos yr ateb",
  hideSolution: "Cuddio'r ateb",
  required: "Atebwch y cwestiwn hwn, os gwelwch yn dda.",
  summary: (correct, total) => (correct === total ? "Mae popeth yn gywir." : `${correct} o ${total} yn gywir.`),
  feedbackOption: "Adborth",
  feedbackOnCheck: "Pan fydd y darllenydd yn gwirio",
  feedbackOnSubmit: "Ar ôl cyflwyno",
  requiredOption: "Gofynnol",
} satisfies Catalog<ExerciseMessages>
