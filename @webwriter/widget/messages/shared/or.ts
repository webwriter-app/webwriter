import type {Catalog} from "../../messages.js"
import type {SharedMessages} from "./index.js"

export default {
  cancelled: "ବାତିଲ କରାଯାଇଛି।",
  notAllowed: "ବାତିଲ କରାଯାଇଛି। ଏଠାରେ ଏହା ଆଉ ଅନୁମୋଦିତ ନୁହେଁ।",
} satisfies Catalog<SharedMessages>
