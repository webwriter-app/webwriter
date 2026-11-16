import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "הבחירה בוטלה." : count === 1 ? "פריט אחד נבחר." : `פריטים שנבחרו: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "הועבר." : `פריטים שהועברו: ${count}.`),
  notMoved: "לא הועבר.",
  port: (port, node) => `${port} של ${node}`,
  linkPort: port => `חיבור מתוך ${port}`,
  wiring: (from, count) => (count === 1 ? `חוט מתוך ${from}. יציאה אחת מקבלת אותו. מקשי החיצים בוחרים, Enter מחבר, Escape מבטל.` : `חוט מתוך ${from}. יציאות שמקבלות אותו: ${count}. מקשי החיצים בוחרים, Enter מחבר, Escape מבטל.`),
  target: (to, index, count) => `${to}, ${index} מתוך ${count}.`,
  noTarget: "אין יציאה שמקבלת חוט זה.",
  connected: (from, to) => `${from} חובר אל ${to}.`,
  notConnected: "לא חובר.",
} satisfies Catalog<SceneMessages>
