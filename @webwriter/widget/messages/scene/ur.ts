import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "انتخاب ختم کر دیا گیا۔" : count === 1 ? "1 آئٹم منتخب۔" : `منتخب آئٹمز: ${count}۔`),
  moving: (x, y) => `x ${x}، y ${y}۔`,
  moved: count => (count === 1 ? "منتقل کر دیا گیا۔" : `منتقل کیے گئے آئٹمز: ${count}۔`),
  notMoved: "منتقل نہیں کیا گیا۔",
  port: (port, node) => `${node} کا ${port}`,
  linkPort: port => `${port} سے جوڑیں`,
  wiring: (from, count) => (count === 1 ? `${from} سے تار۔ 1 پورٹ اسے قبول کرتا ہے۔ منتخب کرنے کے لیے تیر والے بٹن، جوڑنے کے لیے Enter، منسوخ کرنے کے لیے Escape۔` : `${from} سے تار۔ اسے قبول کرنے والے پورٹس: ${count}۔ منتخب کرنے کے لیے تیر والے بٹن، جوڑنے کے لیے Enter، منسوخ کرنے کے لیے Escape۔`),
  target: (to, index, count) => `${to}، ${index} از ${count}۔`,
  noTarget: "کوئی پورٹ اس تار کو قبول نہیں کرتا۔",
  connected: (from, to) => `${from} کو ${to} سے جوڑ دیا گیا۔`,
  notConnected: "جوڑا نہیں گیا۔",
} satisfies Catalog<SceneMessages>
