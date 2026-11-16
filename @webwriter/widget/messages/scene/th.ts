import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "ล้างการเลือกแล้ว" : count === 1 ? "เลือก 1 รายการแล้ว" : `จำนวนรายการที่เลือก: ${count}`),
  moving: (x, y) => `x ${x} y ${y}`,
  moved: count => (count === 1 ? "ย้ายแล้ว" : `จำนวนรายการที่ย้าย: ${count}`),
  notMoved: "ไม่ได้ย้าย",
  port: (port, node) => `${port} ของ ${node}`,
  linkPort: port => `เริ่มเชื่อมต่อจาก ${port}`,
  wiring: (from, count) => (count === 1 ? `สายจาก ${from} พอร์ตที่รับได้: 1 ใช้ปุ่มลูกศรเพื่อเลือก กด Enter เพื่อเชื่อมต่อ กด Esc เพื่อยกเลิก` : `สายจาก ${from} จำนวนพอร์ตที่รับได้: ${count} ใช้ปุ่มลูกศรเพื่อเลือก กด Enter เพื่อเชื่อมต่อ กด Esc เพื่อยกเลิก`),
  target: (to, index, count) => `${to} ที่ ${index} จาก ${count}`,
  noTarget: "ไม่มีพอร์ตที่รับสายนี้",
  connected: (from, to) => `เชื่อมต่อ ${from} กับ ${to} แล้ว`,
  notConnected: "ไม่ได้เชื่อมต่อ",
} satisfies Catalog<SceneMessages>
