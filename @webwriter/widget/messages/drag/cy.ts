import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Codwyd: ${item}. Defnyddiwch yr allweddi saeth i ddewis lle, Enter i ollwng, Escape i ganslo.`,
  pickedLink: item => `Cysylltu: ${item}. Defnyddiwch yr allweddi saeth i ddewis beth i'w gysylltu ag ef, Enter i gysylltu, Escape i ganslo.`,
  selected: item => `Dewiswyd: ${item}. Cliciwch lle dylai fynd, neu cliciwch arno eto i ganslo.`,
  nextTarget: "Mae Tab yn symud i'r targed nesaf.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}safle ${position.index} o ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} o'r chwith, ${y} o'r brig`,
  dropped: (item, target) => (target ? `Gollyngwyd: ${item}, cyrchfan: ${target}.` : `Gollyngwyd: ${item}.`),
  copied: (item, target) => (target ? `Ychwanegwyd: ${item}, cyrchfan: ${target}.` : `Ychwanegwyd: ${item}.`),
  linked: (item, target) => `Cysylltwyd: ${item}, cyrchfan: ${target}.`,
  cancelled: () => "Wedi'i ganslo.",
  notAllowed: "Wedi'i ganslo. Nid yw hyn yn cael ei ganiatáu yma mwyach.",
} satisfies Catalog<DragMessages>
