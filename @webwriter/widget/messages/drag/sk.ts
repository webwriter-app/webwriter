import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Zdvihnuté: ${item}. Šípkami vyberte miesto, klávesom Enter položte, klávesom Escape zrušte.`,
  pickedLink: item => `Prepájanie: ${item}. Šípkami vyberte cieľ prepojenia, klávesom Enter prepojte, klávesom Escape zrušte.`,
  selected: item => `Vybraté: ${item}. Kliknite na miesto, kam to patrí, alebo kliknutím znova zrušte.`,
  nextTarget: "Klávesom Tab prejdete na ďalší cieľ.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}pozícia ${position.index} z ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} zľava, ${y} zhora`,
  dropped: (item, target) => (target ? `Položené: ${item}, cieľ: ${target}.` : `Položené: ${item}.`),
  copied: (item, target) => (target ? `Pridané: ${item}, cieľ: ${target}.` : `Pridané: ${item}.`),
  linked: (item, target) => `Prepojené: ${item} a ${target}.`,
  cancelled: () => "Zrušené.",
  notAllowed: "Zrušené. Tu to už nie je povolené.",
} satisfies Catalog<DragMessages>
