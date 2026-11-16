import type {Catalog} from "../../messages.js"
import type {PlaybackMessages} from "./index.js"

export default {
  play: "चलाउनुहोस्",
  pause: "रोक्नुहोस्",
  step: "एक चरण अगाडि",
  back: "एक चरण पछाडि",
  reset: "रिसेट गर्नुहोस्",
  seek: "स्थान",
  rate: (_rate, shown) => `गति: ${shown}×`,
} satisfies Catalog<PlaybackMessages>
