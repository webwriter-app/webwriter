import type {Catalog} from "../../messages.js"
import type {PrintMessages} from "./index.js"

export default {
  note: "Ce contenu interactif n’est pas affiché sur papier. Ouvrez le document en ligne pour l’utiliser.",
} satisfies Catalog<PrintMessages>
