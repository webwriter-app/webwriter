import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Ridicat: ${item}. Folosiți tastele săgeți pentru a alege un loc, Enter pentru a plasa, Escape pentru a anula.`,
  pickedLink: item => `Conectare: ${item}. Folosiți tastele săgeți pentru a alege destinația, Enter pentru a conecta, Escape pentru a anula.`,
  selected: item => `Selectat: ${item}. Faceți clic unde trebuie plasat sau faceți clic din nou pentru a anula.`,
  nextTarget: "Tab trece la următoarea țintă.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}poziția ${position.index} din ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} de la stânga, ${y} de sus`,
  dropped: (item, target) => (target ? `Plasat: ${item}, țintă: ${target}.` : `Plasat: ${item}.`),
  copied: (item, target) => (target ? `Adăugat: ${item}, țintă: ${target}.` : `Adăugat: ${item}.`),
  linked: (item, target) => `Conectat: ${item} cu ${target}.`,
  cancelled: () => "Anulat.",
  notAllowed: "Anulat. Acest lucru nu mai este permis aici.",
} satisfies Catalog<DragMessages>
