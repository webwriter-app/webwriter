import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "ޕްލޭ",
  pause: "ހުއްޓުވާ",
  step: "އެއް ފިޔަވަޅު ކުރިއަށް",
  back: "އެއް ފިޔަވަޅު ފަހަތަށް",
  reset: "ރީސެޓް",
  seek: "ތަން",
  rate: (_rate, shown) => `ސްޕީޑް: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
