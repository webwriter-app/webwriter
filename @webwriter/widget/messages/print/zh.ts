import type {Catalog} from "../../messages.js"
import type {PrintMessages} from "./index.js"

export default {
  note: "此交互式内容不会显示在纸张上。请在线打开文档以使用它。",
} satisfies Catalog<PrintMessages>
