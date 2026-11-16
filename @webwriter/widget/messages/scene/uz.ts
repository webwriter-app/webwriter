import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Tanlov bekor qilindi." : count === 1 ? "1 ta element tanlandi." : `Tanlangan elementlar soni: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Ko‘chirildi." : `Ko‘chirilgan elementlar soni: ${count}.`),
  notMoved: "Ko‘chirilmadi.",
  port: (port, node) => `${node}: ${port}`,
  linkPort: port => `Ulanishni shu yerdan boshlash: ${port}`,
  wiring: (from, count) => (count === 1 ? `Ulanish boshi: ${from}. 1 ta port qabul qiladi. Tanlash uchun strelka tugmalari, ulash uchun Enter, bekor qilish uchun Escape.` : `Ulanish boshi: ${from}. Qabul qiladigan portlar soni: ${count}. Tanlash uchun strelka tugmalari, ulash uchun Enter, bekor qilish uchun Escape.`),
  target: (to, index, count) => `${to}, ${index} / ${count}.`,
  noTarget: "Hech bir port bu ulanishni qabul qilmaydi.",
  connected: (from, to) => `Ulandi: ${from} va ${to}.`,
  notConnected: "Ulanmadi.",
} satisfies Catalog<SceneMessages>
