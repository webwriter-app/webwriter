import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} imechukuliwa. Tumia vitufe vya mshale kuchagua mahali, Enter kudondosha, Escape kughairi.`,
  pickedLink: item => `Inaunganisha ${item}. Tumia vitufe vya mshale kuchagua cha kuunganisha nacho, Enter kuunganisha, Escape kughairi.`,
  selected: item => `${item} imechaguliwa. Bofya mahali inapopaswa kwenda, au ibofye tena kughairi.`,
  nextTarget: "Tab huhamia lengo linalofuata.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}nafasi ya ${position.index} kati ya ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} kutoka kushoto, ${y} kutoka juu`,
  dropped: (item, target) => (target ? `${item} imedondoshwa kwenye ${target}.` : `${item} imedondoshwa.`),
  copied: (item, target) => (target ? `${item} imeongezwa kwenye ${target}.` : `${item} imeongezwa.`),
  linked: (item, target) => `${item} imeunganishwa na ${target}.`,
  cancelled: () => "Imeghairiwa.",
  notAllowed: "Imeghairiwa. Hii hairuhusiwi tena hapa.",
} satisfies Catalog<DragMessages>
