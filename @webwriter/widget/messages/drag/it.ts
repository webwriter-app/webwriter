import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} preso. Usa le frecce per scegliere una posizione, Invio per rilasciare, Esc per annullare.`,
  pickedLink: item => `Collegamento di ${item}. Usa le frecce per scegliere a cosa collegarlo, Invio per collegare, Esc per annullare.`,
  selected: item => `${item} selezionato. Fai clic dove deve andare, oppure fai di nuovo clic sull’elemento per annullare.`,
  nextTarget: "Tab passa alla destinazione successiva.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}posizione ${position.index} di ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} da sinistra, ${y} dall’alto`,
  dropped: (item, target) => (target ? `${item} rilasciato su ${target}.` : `${item} rilasciato.`),
  copied: (item, target) => (target ? `${item} aggiunto a ${target}.` : `${item} aggiunto.`),
  linked: (item, target) => `${item} collegato a ${target}.`,
  cancelled: () => "Annullato.",
  notAllowed: "Annullato. Qui non è più consentito.",
} satisfies Catalog<DragMessages>
