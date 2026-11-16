import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Seçim kaldırıldı." : count === 1 ? "1 öğe seçildi." : `Seçilen öğe sayısı: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Taşındı." : `Taşınan öğe sayısı: ${count}.`),
  notMoved: "Taşınmadı.",
  port: (port, node) => `${node}: ${port}`,
  linkPort: port => `Bağlantıyı şuradan başlat: ${port}`,
  wiring: (from, count) => (count === 1 ? `Bağlantı başlangıcı: ${from}. 1 bağlantı noktası kabul ediyor. Seçmek için ok tuşları, bağlamak için Enter, iptal etmek için Escape.` : `Bağlantı başlangıcı: ${from}. Kabul eden bağlantı noktası sayısı: ${count}. Seçmek için ok tuşları, bağlamak için Enter, iptal etmek için Escape.`),
  target: (to, index, count) => `${to}, ${index} / ${count}.`,
  noTarget: "Hiçbir bağlantı noktası bu bağlantıyı kabul etmiyor.",
  connected: (from, to) => `Bağlandı: ${from} ve ${to}.`,
  notConnected: "Bağlanmadı.",
} satisfies Catalog<SceneMessages>
