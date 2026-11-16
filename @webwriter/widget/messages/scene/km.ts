import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "បានលុបការជ្រើសរើស។" : count === 1 ? "បានជ្រើសរើស ១ ធាតុ។" : `ចំនួនធាតុដែលបានជ្រើសរើស៖ ${count}។`),
  moving: (x, y) => `x ${x} y ${y}។`,
  moved: count => (count === 1 ? "បានផ្លាស់ទី។" : `ចំនួនធាតុដែលបានផ្លាស់ទី៖ ${count}។`),
  notMoved: "មិនបានផ្លាស់ទីទេ។",
  port: (port, node) => `${port} នៃ ${node}`,
  linkPort: port => `ចាប់ផ្ដើមភ្ជាប់ពី ${port}`,
  wiring: (from, count) => (count === 1 ? `ខ្សែពី ${from}។ ច្រកដែលទទួលបាន៖ ១។ ប្រើគ្រាប់ចុចព្រួញដើម្បីជ្រើសរើស ចុច Enter ដើម្បីភ្ជាប់ ចុច Esc ដើម្បីបោះបង់។` : `ខ្សែពី ${from}។ ចំនួនច្រកដែលទទួលបាន៖ ${count}។ ប្រើគ្រាប់ចុចព្រួញដើម្បីជ្រើសរើស ចុច Enter ដើម្បីភ្ជាប់ ចុច Esc ដើម្បីបោះបង់។`),
  target: (to, index, count) => `${to} ទី ${index} ក្នុងចំណោម ${count}។`,
  noTarget: "គ្មានច្រកណាទទួលខ្សែនេះទេ។",
  connected: (from, to) => `បានភ្ជាប់ ${from} ទៅ ${to}។`,
  notConnected: "មិនបានភ្ជាប់ទេ។",
} satisfies Catalog<SceneMessages>
