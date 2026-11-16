import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "ޗެކް",
  reset: "ރީސެޓް",
  showSolution: "ޖަވާބު ދައްކާ",
  hideSolution: "ޖަވާބު ފޮރުވާ",
  required: "މި ސުވާލަށް ޖަވާބު ދެއްވާ.",
  summary: (correct, total) => (correct === total ? "ހުރިހާ ޖަވާބެއް ރަނގަޅު." : `${total} ގެ ތެރެއިން ${correct} ރަނގަޅު.`),
  feedbackOption: "ފީޑްބެކް",
  feedbackOnCheck: "ކިޔުންތެރިޔާ ޗެކް ކުރާއިރު",
  feedbackOnSubmit: "ހުށަހެޅުމަށްފަހު",
  requiredOption: "ލާޒިމް",
} satisfies Catalog<ExerciseMessages>
