import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Pilihan dihapus." : count === 1 ? "1 item dipilih." : `${count} item dipilih.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Dipindahkan." : `${count} item dipindahkan.`),
  notMoved: "Tidak dipindahkan.",
  port: (port, node) => `${port} pada ${node}`,
  linkPort: port => `Hubungkan dari ${port}`,
  wiring: (from, count) => (count === 1 ? `Kabel dari ${from}. 1 port dapat menerimanya. Tombol panah memilih, Enter menghubungkan, Escape membatalkan.` : `Kabel dari ${from}. ${count} port dapat menerimanya. Tombol panah memilih, Enter menghubungkan, Escape membatalkan.`),
  target: (to, index, count) => `${to}, ${index} dari ${count}.`,
  noTarget: "Tidak ada port yang menerima kabel ini.",
  connected: (from, to) => `${from} dihubungkan ke ${to}.`,
  notConnected: "Tidak terhubung.",
} satisfies Catalog<SceneMessages>
