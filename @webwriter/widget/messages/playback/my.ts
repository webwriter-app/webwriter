import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "ဖွင့်ရန်",
  pause: "ခေတ္တရပ်ရန်",
  step: "တစ်ဆင့် ရှေ့သို့",
  back: "တစ်ဆင့် နောက်သို့",
  reset: "ပြန်လည်သတ်မှတ်ရန်",
  seek: "နေရာ",
  rate: (_rate, shown) => `အမြန်နှုန်း- ${shown}×`,
} satisfies Catalog<PlaybackMessages>
