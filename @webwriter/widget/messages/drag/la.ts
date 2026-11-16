import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} sublatum est. Claves sagittarum adhibe ad locum eligendum, Enter ad ponendum, Escape ad omittendum.`,
  pickedLink: item => `${item} nectitur. Claves sagittarum adhibe ad metam eligendam, Enter ad nectendum, Escape ad omittendum.`,
  selected: item => `${item} electum est. Preme ubi poni debet, vel iterum preme ad omittendum.`,
  nextTarget: "Tab ad proximam metam transit.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}locus ${position.index} ex ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} a sinistra, ${y} a summo`,
  dropped: (item, target) => (target ? `${item} positum est. Meta: ${target}.` : `${item} positum est.`),
  copied: (item, target) => (target ? `${item} additum est. Meta: ${target}.` : `${item} additum est.`),
  linked: (item, target) => `${item} nexum est. Meta: ${target}.`,
  cancelled: () => "Omissum est.",
  notAllowed: "Omissum est. Hoc hic iam non licet.",
} satisfies Catalog<DragMessages>
