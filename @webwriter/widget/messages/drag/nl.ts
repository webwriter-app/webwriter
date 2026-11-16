import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} opgepakt. Gebruik de pijltoetsen om een plek te kiezen, Enter om neer te zetten, Escape om te annuleren.`,
  pickedLink: item => `${item} koppelen. Gebruik de pijltoetsen om te kiezen waaraan het gekoppeld wordt, Enter om te koppelen, Escape om te annuleren.`,
  selected: item => `${item} geselecteerd. Klik waar het naartoe moet, of klik er nogmaals op om te annuleren.`,
  nextTarget: "Tab gaat naar het volgende doel.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}positie ${position.index} van ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} vanaf links, ${y} vanaf boven`,
  dropped: (item, target) => (target ? `${item} neergezet op ${target}.` : `${item} neergezet.`),
  copied: (item, target) => (target ? `${item} toegevoegd aan ${target}.` : `${item} toegevoegd.`),
  linked: (item, target) => `${item} gekoppeld aan ${target}.`,
  cancelled: () => "Geannuleerd.",
  notAllowed: "Geannuleerd. Dit is hier niet meer toegestaan.",
} satisfies Catalog<DragMessages>
