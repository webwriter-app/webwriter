import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Paņemts: ${item}. Ar bultiņu taustiņiem izvēlieties vietu, ar Enter nolieciet, ar Escape atceliet.`,
  pickedLink: item => `Savienošana: ${item}. Ar bultiņu taustiņiem izvēlieties, ar ko savienot, ar Enter savienojiet, ar Escape atceliet.`,
  selected: item => `Atlasīts: ${item}. Noklikšķiniet uz vietas, kur tam jānonāk, vai noklikšķiniet vēlreiz, lai atceltu.`,
  nextTarget: "Taustiņš Tab pārslēdz uz nākamo mērķi.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.index}. vieta no ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} no kreisās puses, ${y} no augšas`,
  dropped: (item, target) => (target ? `Nolikts: ${item}, mērķis: ${target}.` : `Nolikts: ${item}.`),
  copied: (item, target) => (target ? `Pievienots: ${item}, mērķis: ${target}.` : `Pievienots: ${item}.`),
  linked: (item, target) => `Savienots: ${item} un ${target}.`,
  cancelled: () => "Atcelts.",
  notAllowed: "Atcelts. Šeit tas vairs nav atļauts.",
} satisfies Catalog<DragMessages>
