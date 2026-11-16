import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} پورته شو. د ځای د ټاکلو لپاره د غشو کیلیدونه وکاروئ، د پرېښودلو لپاره Enter او د لغوه کولو لپاره Escape ووهئ.`,
  pickedLink: item => `${item} نښلول کېږي. د هغه څه د ټاکلو لپاره چې باید ورسره ونښلول شي د غشو کیلیدونه وکاروئ، د نښلولو لپاره Enter او د لغوه کولو لپاره Escape ووهئ.`,
  selected: item => `${item} وټاکل شو. هلته کلیک وکړئ چېرته چې باید ځای پر ځای شي، یا د لغوه کولو لپاره بیا پرې کلیک وکړئ.`,
  nextTarget: "Tab راتلونکي هدف ته ځي.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.count} څخه ${position.index} موقعیت` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}له کیڼ لوري ${x}، له پورتنۍ برخې ${y}`,
  dropped: (item, target) => (target ? `${item} په ${target} کې پرېښودل شو.` : `${item} پرېښودل شو.`),
  copied: (item, target) => (target ? `${item} ${target} ته اضافه شو.` : `${item} اضافه شو.`),
  linked: (item, target) => `${item} له ${target} سره ونښلول شو.`,
  cancelled: () => "لغوه شو.",
  notAllowed: "لغوه شو. دا دلته نور اجازه نلري.",
} satisfies Catalog<DragMessages>
