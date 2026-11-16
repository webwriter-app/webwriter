import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Plukket opp ${item}. Bruk piltastene for å velge et sted, Enter for å slippe, Escape for å avbryte.`,
  pickedLink: item => `Kobler ${item}. Bruk piltastene for å velge hva det skal kobles til, Enter for å koble, Escape for å avbryte.`,
  selected: item => `Valgte ${item}. Klikk der det skal plasseres, eller klikk på det igjen for å avbryte.`,
  nextTarget: "Tab går til neste mål.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}plass ${position.index} av ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} fra venstre, ${y} fra toppen`,
  dropped: (item, target) => (target ? `Slapp ${item} på ${target}.` : `Slapp ${item}.`),
  copied: (item, target) => (target ? `La ${item} til i ${target}.` : `La til ${item}.`),
  linked: (item, target) => `Koblet ${item} til ${target}.`,
  cancelled: () => "Avbrutt.",
  notAllowed: "Avbrutt. Dette er ikke lenger tillatt her.",
} satisfies Catalog<DragMessages>
