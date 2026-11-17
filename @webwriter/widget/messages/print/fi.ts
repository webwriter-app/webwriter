import type {Catalog} from "../../messages.js"
import type {PrintMessages} from "./index.js"

export default {
  note: "Tätä interaktiivista sisältöä ei näytetä paperilla. Avaa asiakirja verkossa, jotta voit käyttää sitä.",
} satisfies Catalog<PrintMessages>
