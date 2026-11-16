import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} ol fudhatameera. Iddoo filachuuf furtuuwwan xiyyaa fayyadami, gadi dhiisuuf Enter, haquuf Escape tuqi.`,
  pickedLink: item => `${item} wal qabsiisaa jira. Waan wal qabsiisuuf filachuuf furtuuwwan xiyyaa fayyadami, wal qabsiisuuf Enter, haquuf Escape tuqi.`,
  selected: item => `${item} filatameera. Iddoo itti deemuu qabu cuqaasi, yookaan haquuf irra deebi'ii cuqaasi.`,
  nextTarget: "Tab kaayyoo itti aanutti ceesisa.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}iddoo ${position.index} kan ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}bitaa irraa ${x}, gubbaa irraa ${y}`,
  dropped: (item, target) => (target ? `${item} ${target} irratti gadi dhiifameera.` : `${item} gadi dhiifameera.`),
  copied: (item, target) => (target ? `${item} gara ${target} dabalameera.` : `${item} dabalameera.`),
  linked: (item, target) => `${item} ${target} waliin wal qabsiifameera.`,
  cancelled: () => "Haqameera.",
  notAllowed: "Haqameera. Kun asitti ammas hin hayyamamu.",
} satisfies Catalog<DragMessages>
