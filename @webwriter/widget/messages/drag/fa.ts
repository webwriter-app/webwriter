import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} برداشته شد. با کلیدهای جهت‌دار جایی را انتخاب کنید، با Enter رها کنید یا با Escape لغو کنید.`,
  pickedLink: item => `در حال پیوند دادن ${item}. با کلیدهای جهت‌دار مقصد پیوند را انتخاب کنید، با Enter پیوند دهید یا با Escape لغو کنید.`,
  selected: item => `${item} انتخاب شد. روی جای موردنظر کلیک کنید یا برای لغو دوباره روی آن کلیک کنید.`,
  nextTarget: "کلید Tab به هدف بعدی می‌رود.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}جایگاه ${position.index} از ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} از چپ، ${y} از بالا`,
  dropped: (item, target) => (target ? `${item} در ${target} رها شد.` : `${item} رها شد.`),
  copied: (item, target) => (target ? `${item} به ${target} افزوده شد.` : `${item} افزوده شد.`),
  linked: (item, target) => `${item} به ${target} پیوند داده شد.`,
  cancelled: () => "لغو شد.",
  notAllowed: "لغو شد. این کار دیگر در اینجا مجاز نیست.",
} satisfies Catalog<DragMessages>
