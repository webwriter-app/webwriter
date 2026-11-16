import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} उचलले. जागा निवडण्यासाठी बाण कळा, ठेवण्यासाठी Enter आणि रद्द करण्यासाठी Escape दाबा.`,
  pickedLink: item => `${item} जोडले जात आहे. कशाशी जोडायचे ते निवडण्यासाठी बाण कळा, जोडण्यासाठी Enter आणि रद्द करण्यासाठी Escape दाबा.`,
  selected: item => `${item} निवडले. जिथे ठेवायचे तिथे क्लिक करा, किंवा रद्द करण्यासाठी त्यावर पुन्हा क्लिक करा.`,
  nextTarget: "Tab दाबल्याने पुढच्या लक्ष्याकडे जाता येते.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.count} पैकी स्थान ${position.index}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}डावीकडून ${x}, वरून ${y}`,
  dropped: (item, target) => (target ? `${item} ठेवले: ${target}.` : `${item} ठेवले.`),
  copied: (item, target) => (target ? `${item} जोडले: ${target}.` : `${item} जोडले.`),
  linked: (item, target) => `${item} आणि ${target} जोडले गेले.`,
  cancelled: () => "रद्द केले.",
  notAllowed: "रद्द केले. येथे आता हे करण्यास परवानगी नाही.",
} satisfies Catalog<DragMessages>
