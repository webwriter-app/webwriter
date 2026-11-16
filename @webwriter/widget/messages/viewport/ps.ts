import type {Catalog} from "../../messages.js"
import type {ViewportMessages} from "./index.js"

export default {
  viewport: "لید",
  zoomOut: "کوچنی کول",
  zoomIn: "لوی کول",
  percent: percent => `${percent}%`,
  reset: percent => `زوم ${percent}%. بیا 100% ته ټاکل`,
  fit: "په لید کې برابرول",
} satisfies Catalog<ViewportMessages>
