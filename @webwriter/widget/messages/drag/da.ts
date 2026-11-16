import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} er samlet op. Brug piletasterne til at vælge en plads, Enter til at slippe, Escape til at annullere.`,
  pickedLink: item => `Forbinder ${item}. Brug piletasterne til at vælge, hvad det skal forbindes med, Enter for at forbinde, Escape for at annullere.`,
  selected: item => `${item} er valgt. Klik der, hvor det skal hen, eller klik på det igen for at annullere.`,
  nextTarget: "Tab går til næste mål.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}plads ${position.index} af ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} fra venstre, ${y} fra toppen`,
  dropped: (item, target) => (target ? `${item} er sluppet på ${target}.` : `${item} er sluppet.`),
  copied: (item, target) => (target ? `${item} er føjet til ${target}.` : `${item} er tilføjet.`),
  linked: (item, target) => `${item} er forbundet med ${target}.`,
  cancelled: () => "Annulleret.",
  notAllowed: "Annulleret. Det er ikke længere tilladt her.",
} satisfies Catalog<DragMessages>
