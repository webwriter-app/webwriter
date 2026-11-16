import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Marrë: ${item}. Përdorni shigjetat për të zgjedhur vendin, Enter për ta lëshuar, Escape për ta anuluar.`,
  pickedLink: item => `Po lidhet: ${item}. Përdorni shigjetat për të zgjedhur me çfarë të lidhet, Enter për të lidhur, Escape për të anuluar.`,
  selected: item => `Zgjedhur: ${item}. Klikoni ku duhet të shkojë ose klikoni sërish për ta anuluar.`,
  nextTarget: "Tab kalon te caku tjetër.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}pozicioni ${position.index} nga ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} nga e majta, ${y} nga lart`,
  dropped: (item, target) => (target ? `Lëshuar: ${item}, cak: ${target}.` : `Lëshuar: ${item}.`),
  copied: (item, target) => (target ? `Shtuar: ${item}, cak: ${target}.` : `Shtuar: ${item}.`),
  linked: (item, target) => `Lidhur: ${item} me ${target}.`,
  cancelled: () => "Anuluar.",
  notAllowed: "Anuluar. Kjo nuk lejohet më këtu.",
} satisfies Catalog<DragMessages>
