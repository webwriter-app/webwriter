import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} ނެގުނު. ތަނެއް ހޮވުމަށް އެރޯ ކީތައް ބޭނުންކުރައްވާ، ދޫކުރުމަށް Enter، ކެންސަލް ކުރުމަށް Escape.`,
  pickedLink: item => `${item} ލިންކު ކުރަނީ. ލިންކު ކުރަންޖެހޭ ތަނެއް ހޮވުމަށް އެރޯ ކީތައް ބޭނުންކުރައްވާ، ލިންކު ކުރުމަށް Enter، ކެންސަލް ކުރުމަށް Escape.`,
  selected: item => `${item} ހޮވިއްޖެ. ބަހައްޓަންޖެހޭ ތަނުގައި ކްލިކް ކުރައްވާ، ނުވަތަ ކެންސަލް ކުރުމަށް އަނެއްކާ ކްލިކް ކުރައްވާ.`,
  nextTarget: "Tab އިން ދެން އޮތް ހަދަފަށް ގެންދެއެވެ.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.count} ގެ ތެރެއިން ${position.index} ވަނަ ތަން` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}ވާތުން ${x}، މަތިން ${y}`,
  dropped: (item, target) => (target ? `${target} ގައި ${item} ދޫކުރެވުނު.` : `${item} ދޫކުރެވުނު.`),
  copied: (item, target) => (target ? `${target} އަށް ${item} އިތުރުކުރެވުނު.` : `${item} އިތުރުކުރެވުނު.`),
  linked: (item, target) => `${item} އަދި ${target} ލިންކު ކުރެވުނު.`,
  cancelled: () => "ކެންސަލް ކުރެވުނު.",
  notAllowed: "ކެންސަލް ކުރެވުނު. މިތަނުގައި މިކަން އިތުރަށް ހުއްދަ ނުވެއެވެ.",
} satisfies Catalog<DragMessages>
