import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "ចាក់",
  pause: "ផ្អាក",
  step: "ទៅមុខមួយជំហាន",
  back: "ថយក្រោយមួយជំហាន",
  reset: "កំណត់ឡើងវិញ",
  seek: "ទីតាំង",
  rate: (_rate, shown) => `ល្បឿន៖ ${shown}×`,
} satisfies Catalog<PlaybackMessages>
