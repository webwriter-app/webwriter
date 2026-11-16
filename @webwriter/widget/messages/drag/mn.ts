import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item}-г авлаа. Байрлал сонгохдоо сумтай товчийг, тавихдаа Enter, болиулахдаа Escape дарна уу.`,
  pickedLink: item => `${item}-г холбож байна. Холбох зорилтыг сумтай товчоор сонгож, холбохдоо Enter, болиулахдаа Escape дарна уу.`,
  selected: item => `${item}-г сонгосон. Тавих газраа дарна уу, эсвэл болиулахын тулд дахин дарна уу.`,
  nextTarget: "Tab товч дараагийн зорилт руу шилжүүлнэ.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.count}-ийн ${position.index}-р байрлал` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}зүүнээс ${x}, дээрээс ${y}`,
  dropped: (item, target) => (target ? `${item}-г ${target} дээр тавилаа.` : `${item}-г тавилаа.`),
  copied: (item, target) => (target ? `${item}-г ${target}-д нэмлээ.` : `${item}-г нэмлээ.`),
  linked: (item, target) => `${item}-г ${target}-тэй холбов.`,
  cancelled: () => "Болиулсан.",
  notAllowed: "Болиулсан. Энд үүнийг хийхийг больж зөвшөөрөхгүй.",
} satisfies Catalog<DragMessages>
