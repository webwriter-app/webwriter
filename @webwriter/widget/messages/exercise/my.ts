import type {Catalog} from "../../messages.js"
import type {ExerciseMessages} from "./index.js"

export default {
  check: "စစ်ဆေးရန်",
  reset: "ပြန်လည်သတ်မှတ်ရန်",
  showSolution: "အဖြေပြရန်",
  hideSolution: "အဖြေဝှက်ရန်",
  required: "ဤမေးခွန်းကို ဖြေပါ။",
  summary: (correct, total) => (correct === total ? "အားလုံး မှန်ပါသည်။" : `${total} ခုအနက် ${correct} ခု မှန်ပါသည်။`),
  feedbackOption: "တုံ့ပြန်ချက်",
  feedbackOnCheck: "ဖတ်သူ စစ်ဆေးသောအခါ",
  feedbackOnSubmit: "တင်သွင်းပြီးနောက်",
  requiredOption: "မဖြစ်မနေ",
} satisfies Catalog<ExerciseMessages>
