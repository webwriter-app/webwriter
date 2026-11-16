import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Đã bỏ chọn." : count === 1 ? "Đã chọn 1 mục." : `Đã chọn ${count} mục.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Đã di chuyển." : `Đã di chuyển ${count} mục.`),
  notMoved: "Không di chuyển.",
  port: (port, node) => `${port} của ${node}`,
  linkPort: port => `Nối từ ${port}`,
  wiring: (from, count) => (count === 1 ? `Dây nối từ ${from}. 1 cổng có thể nhận dây này. Phím mũi tên để chọn, Enter để nối, Escape để hủy.` : `Dây nối từ ${from}. ${count} cổng có thể nhận dây này. Phím mũi tên để chọn, Enter để nối, Escape để hủy.`),
  target: (to, index, count) => `${to}, ${index} trên ${count}.`,
  noTarget: "Không có cổng nào nhận dây này.",
  connected: (from, to) => `Đã nối ${from} với ${to}.`,
  notConnected: "Chưa nối.",
} satisfies Catalog<SceneMessages>
