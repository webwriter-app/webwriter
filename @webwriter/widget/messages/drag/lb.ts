import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} opgeholl. Benotz d’Feiltasten, fir eng Plaz ze wielen, Enter fir ofzeleeën, Esc fir ofzebriechen.`,
  pickedLink: item => `${item} gëtt verbonnen. Benotz d’Feiltasten, fir ze wielen, mat wat et verbonne gëtt, Enter fir ze verbannen, Esc fir ofzebriechen.`,
  selected: item => `${item} ausgewielt. Klick dohin, wou et higoe soll, oder klick nach eng Kéier drop, fir ofzebriechen.`,
  nextTarget: "Tab wiesselt zum nächste Ziel.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}Plaz ${position.index} vun ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} vu lénks, ${y} vun uewen`,
  dropped: (item, target) => (target ? `${item} op ${target} ofgeluecht.` : `${item} ofgeluecht.`),
  copied: (item, target) => (target ? `${item} bei ${target} derbäigesat.` : `${item} derbäigesat.`),
  linked: (item, target) => `${item} mat ${target} verbonnen.`,
  cancelled: () => "Ofgebrach.",
  notAllowed: "Ofgebrach. Dat ass hei net méi erlaabt.",
} satisfies Catalog<DragMessages>
