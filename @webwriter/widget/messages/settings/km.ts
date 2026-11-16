import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "មិនអនុញ្ញាតឱ្យប្រើតម្លៃនេះនៅទីនេះទេ។",
  invalidDuration: "សូមបញ្ចូលរយៈពេល ឧទាហរណ៍ 1:30 ឬ 90។",
} satisfies Catalog<SettingsMessages>
