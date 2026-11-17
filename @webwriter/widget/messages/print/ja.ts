import type {Catalog} from "../../messages.js"
import type {PrintMessages} from "./index.js"

export default {
  note: "このインタラクティブなコンテンツは紙には表示されません。利用するには、文書をオンラインで開いてください。",
} satisfies Catalog<PrintMessages>
