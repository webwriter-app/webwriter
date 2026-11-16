import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `An ɗauki ${item}. Yi amfani da maɓallan kibiya don zaɓar wuri, Enter don sauke shi, Escape don soke.`,
  pickedLink: item => `Ana haɗa ${item}. Yi amfani da maɓallan kibiya don zaɓar abin da za a haɗa shi da shi, Enter don haɗawa, Escape don soke.`,
  selected: item => `An zaɓi ${item}. Danna wurin da ya kamata ya tafi, ko ka sake danna shi don soke.`,
  nextTarget: "Tab yana komawa zuwa manufa ta gaba.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}matsayi na ${position.index} cikin ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} daga hagu, ${y} daga sama`,
  dropped: (item, target) => (target ? `An sauke ${item} a kan ${target}.` : `An sauke ${item}.`),
  copied: (item, target) => (target ? `An ƙara ${item} a ${target}.` : `An ƙara ${item}.`),
  linked: (item, target) => `An haɗa ${item} da ${target}.`,
  cancelled: () => "An soke.",
  notAllowed: "An soke. Ba a ƙara yarda da wannan a nan ba.",
} satisfies Catalog<DragMessages>
