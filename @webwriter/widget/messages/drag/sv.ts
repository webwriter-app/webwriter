import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Plockade upp ${item}. Använd piltangenterna för att välja en plats, Retur för att släppa, Escape för att avbryta.`,
  pickedLink: item => `Länkar ${item}. Använd piltangenterna för att välja vad det ska länkas till, Retur för att länka, Escape för att avbryta.`,
  selected: item => `Valde ${item}. Klicka där det ska placeras, eller klicka på det igen för att avbryta.`,
  nextTarget: "Tabb går till nästa mål.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}plats ${position.index} av ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} från vänster, ${y} uppifrån`,
  dropped: (item, target) => (target ? `Släppte ${item} på ${target}.` : `Släppte ${item}.`),
  copied: (item, target) => (target ? `Lade till ${item} i ${target}.` : `Lade till ${item}.`),
  linked: (item, target) => `Länkade ${item} till ${target}.`,
  cancelled: () => "Avbrutet.",
  notAllowed: "Avbrutet. Det här är inte längre tillåtet här.",
} satisfies Catalog<DragMessages>
