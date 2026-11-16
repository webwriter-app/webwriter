import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `หยิบ ${item} แล้ว ใช้ปุ่มลูกศรเพื่อเลือกตำแหน่ง กด Enter เพื่อวาง กด Esc เพื่อยกเลิก`,
  pickedLink: item => `กำลังเชื่อมโยง ${item} ใช้ปุ่มลูกศรเพื่อเลือกปลายทางที่จะเชื่อมโยง กด Enter เพื่อเชื่อมโยง กด Esc เพื่อยกเลิก`,
  selected: item => `เลือก ${item} แล้ว คลิกที่ตำแหน่งที่ต้องการวาง หรือคลิกอีกครั้งเพื่อยกเลิก`,
  nextTarget: "กด Tab เพื่อไปยังเป้าหมายถัดไป",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}ตำแหน่งที่ ${position.index} จาก ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}ห่างจากซ้าย ${x} ห่างจากบน ${y}`,
  dropped: (item, target) => (target ? `วาง ${item} ลงใน ${target} แล้ว` : `วาง ${item} แล้ว`),
  copied: (item, target) => (target ? `เพิ่ม ${item} ลงใน ${target} แล้ว` : `เพิ่ม ${item} แล้ว`),
  linked: (item, target) => `เชื่อมโยง ${item} กับ ${target} แล้ว`,
  cancelled: () => "ยกเลิกแล้ว",
  notAllowed: "ยกเลิกแล้ว ไม่อนุญาตให้ทำสิ่งนี้ที่นี่อีกต่อไป",
} satisfies Catalog<DragMessages>
