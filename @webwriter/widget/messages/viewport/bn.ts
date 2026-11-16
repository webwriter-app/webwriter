import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "ভিউ",
  zoomOut: "জুম কমান",
  zoomIn: "জুম বাড়ান",
  percent: percent => `${percent}%`,
  reset: percent => `জুম ${percent}%। 100%-এ রিসেট করুন`,
  fit: "পুরোটা দেখান",
} satisfies Catalog<ViewportMessages>
