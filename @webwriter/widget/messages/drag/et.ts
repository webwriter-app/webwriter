import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Võetud: ${item}. Vali koht nooleklahvidega, pane maha klahviga Enter, tühista klahviga Escape.`,
  pickedLink: item => `Ühendamine: ${item}. Vali nooleklahvidega, millega ühendada, ühenda klahviga Enter, tühista klahviga Escape.`,
  selected: item => `Valitud: ${item}. Klõpsa kohta, kuhu see peab minema, või klõpsa uuesti, et tühistada.`,
  nextTarget: "Klahv Tab liigub järgmise sihtkoha juurde.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}koht ${position.index}, kokku ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} vasakult, ${y} ülevalt`,
  dropped: (item, target) => (target ? `Maha pandud: ${item}, sihtkoht: ${target}.` : `Maha pandud: ${item}.`),
  copied: (item, target) => (target ? `Lisatud: ${item}, sihtkoht: ${target}.` : `Lisatud: ${item}.`),
  linked: (item, target) => `Ühendatud: ${item} ja ${target}.`,
  cancelled: () => "Tühistatud.",
  notAllowed: "Tühistatud. Siin pole see enam lubatud.",
} satisfies Catalog<DragMessages>
