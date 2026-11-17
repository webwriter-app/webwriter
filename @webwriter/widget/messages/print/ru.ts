import type {Catalog} from "../../messages.js"
import type {PrintMessages} from "./index.js"

export default {
  note: "Это интерактивное содержимое не отображается на бумаге. Откройте документ онлайн, чтобы пользоваться им.",
} satisfies Catalog<PrintMessages>
