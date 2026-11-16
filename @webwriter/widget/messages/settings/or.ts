import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "ଏହି ମୂଲ୍ୟ ଏଠାରେ ଅନୁମୋଦିତ ନୁହେଁ।",
  invalidDuration: "ଏକ ଅବଧି ଲେଖନ୍ତୁ, ଉଦାହରଣ ସ୍ୱରୂପ 1:30 କିମ୍ବା 90।",
} satisfies Catalog<SettingsMessages>
