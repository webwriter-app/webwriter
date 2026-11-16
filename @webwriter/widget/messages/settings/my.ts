import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "ဤတန်ဖိုးကို ဤနေရာတွင် ခွင့်မပြုပါ။",
  invalidDuration: "ကြာချိန်ကို ထည့်ပါ၊ ဥပမာ 1:30 သို့မဟုတ် 90။",
} satisfies Catalog<SettingsMessages>
