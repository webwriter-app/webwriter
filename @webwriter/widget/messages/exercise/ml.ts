import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "പരിശോധിക്കുക",
  reset: "പുനഃസജ്ജമാക്കുക",
  showSolution: "പരിഹാരം കാണിക്കുക",
  hideSolution: "പരിഹാരം മറയ്ക്കുക",
  required: "ദയവായി ഈ ചോദ്യത്തിന് ഉത്തരം നൽകുക.",
  summary: (correct, total) => (correct === total ? "എല്ലാം ശരിയാണ്." : `${total} എണ്ണത്തിൽ ${correct} ശരി.`),
  feedbackOption: "പ്രതികരണം",
  feedbackOnCheck: "വായനക്കാർ പരിശോധിക്കുമ്പോൾ",
  feedbackOnSubmit: "സമർപ്പിച്ചതിനു ശേഷം",
  requiredOption: "നിർബന്ധം",
} satisfies Catalog<ExerciseMessages>
