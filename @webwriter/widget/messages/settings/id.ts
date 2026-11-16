import type {Catalog} from "../../messages.js"
import type {SettingsMessages} from "./index.js"

export default {
  invalid: "Nilai ini tidak diizinkan di sini.",
  invalidDuration: "Masukkan durasi, misalnya 1:30 atau 90.",
} satisfies Catalog<SettingsMessages>
