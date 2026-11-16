import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} ကို ကောက်ယူလိုက်ပါပြီ။ နေရာရွေးရန် မြားခလုတ်များကို သုံးပါ၊ ချရန် Enter နှိပ်ပါ၊ ပယ်ဖျက်ရန် Esc နှိပ်ပါ။`,
  pickedLink: item => `${item} ကို ချိတ်ဆက်နေပါသည်။ ချိတ်ဆက်မည့်ပစ်မှတ်ကို မြားခလုတ်များဖြင့် ရွေးပါ၊ ချိတ်ဆက်ရန် Enter နှိပ်ပါ၊ ပယ်ဖျက်ရန် Esc နှိပ်ပါ။`,
  selected: item => `${item} ကို ရွေးထားပါသည်။ ထားလိုသောနေရာကို နှိပ်ပါ၊ သို့မဟုတ် ပယ်ဖျက်ရန် ထပ်နှိပ်ပါ။`,
  nextTarget: "နောက်ပစ်မှတ်သို့ သွားရန် Tab နှိပ်ပါ။",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.count} ခုအနက် ရာထူး ${position.index}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}ဘယ်ဘက်မှ ${x}၊ အပေါ်မှ ${y}`,
  dropped: (item, target) => (target ? `${item} ကို ${target} ပေါ်တွင် ချလိုက်ပါပြီ။` : `${item} ကို ချလိုက်ပါပြီ။`),
  copied: (item, target) => (target ? `${item} ကို ${target} သို့ ထည့်လိုက်ပါပြီ။` : `${item} ကို ထည့်လိုက်ပါပြီ။`),
  linked: (item, target) => `${item} ကို ${target} နှင့် ချိတ်ဆက်လိုက်ပါပြီ။`,
  cancelled: () => "ပယ်ဖျက်လိုက်ပါပြီ။",
  notAllowed: "ပယ်ဖျက်လိုက်ပါပြီ။ ဤနေရာတွင် ၎င်းကို ဆက်၍ ခွင့်မပြုတော့ပါ။",
} satisfies Catalog<DragMessages>
