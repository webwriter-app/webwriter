import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "ಪ್ಲೇ ಮಾಡಿ",
  pause: "ವಿರಾಮ",
  step: "ಒಂದು ಹೆಜ್ಜೆ ಮುಂದೆ",
  back: "ಒಂದು ಹೆಜ್ಜೆ ಹಿಂದೆ",
  reset: "ಮರುಹೊಂದಿಸಿ",
  seek: "ಸ್ಥಾನ",
  rate: (_rate, shown) => `ವೇಗ: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
