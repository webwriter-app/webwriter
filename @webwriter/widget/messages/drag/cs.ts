import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Zvednuto: ${item}. Šipkami vyberte místo, klávesou Enter položte, klávesou Escape zrušte.`,
  pickedLink: item => `Propojování: ${item}. Šipkami vyberte cíl propojení, klávesou Enter propojte, klávesou Escape zrušte.`,
  selected: item => `Vybráno: ${item}. Klikněte na místo, kam to patří, nebo kliknutím znovu zrušte.`,
  nextTarget: "Klávesa Tab přejde na další cíl.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}pozice ${position.index} z ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} zleva, ${y} shora`,
  dropped: (item, target) => (target ? `Položeno: ${item}, cíl: ${target}.` : `Položeno: ${item}.`),
  copied: (item, target) => (target ? `Přidáno: ${item}, cíl: ${target}.` : `Přidáno: ${item}.`),
  linked: (item, target) => `Propojeno: ${item} a ${target}.`,
  cancelled: () => "Zrušeno.",
  notAllowed: "Zrušeno. Zde to už není povoleno.",
} satisfies Catalog<DragMessages>
