import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} is opgetel. Gebruik die pyltjiesleutels om 'n plek te kies, Enter om te los, Escape om te kanselleer.`,
  pickedLink: item => `${item} word gekoppel. Gebruik die pyltjiesleutels om te kies waaraan dit gekoppel moet word, Enter om te koppel, Escape om te kanselleer.`,
  selected: item => `${item} is gekies. Klik waar dit heen moet, of klik weer daarop om te kanselleer.`,
  nextTarget: "Tab skuif na die volgende teiken.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}posisie ${position.index} van ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} van links, ${y} van bo`,
  dropped: (item, target) => (target ? `${item} is op ${target} gelos.` : `${item} is gelos.`),
  copied: (item, target) => (target ? `${item} is by ${target} gevoeg.` : `${item} is bygevoeg.`),
  linked: (item, target) => `${item} is aan ${target} gekoppel.`,
  cancelled: () => "Gekanselleer.",
  notAllowed: "Gekanselleer. Dit word nie meer hier toegelaat nie.",
} satisfies Catalog<DragMessages>
