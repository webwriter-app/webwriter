import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "ހޮވުން ފޮހެލެވުނު." : count === 1 ? "އެއް އައިޓަމް ހޮވިއްޖެ." : `ހޮވި އައިޓަމްތައް: ${count}.`),
  moving: (x, y) => `x ${x}، y ${y}.`,
  moved: count => (count === 1 ? "ގެންދެވުނު." : `ގެންދެވުނު އައިޓަމްތައް: ${count}.`),
  notMoved: "ނުގެންދެވުނު.",
  port: (port, node) => `${node} ގެ ${port}`,
  linkPort: port => `${port} އިން ގުޅުއްވާ`,
  wiring: (from, count) => (count === 1 ? `${from} އިން ވަޔަރު. އެއް ޕޯޓެއް އެ ބަލައިގަންނަނީ. އެރޯ ކީތަކުން ހޮވާ، Enter އިން ގުޅުވާ، Escape އިން ކެންސަލް ކުރެއެވެ.` : `${from} އިން ވަޔަރު. އެ ބަލައިގަންނަ ޕޯޓްތައް: ${count}. އެރޯ ކީތަކުން ހޮވާ، Enter އިން ގުޅުވާ، Escape އިން ކެންސަލް ކުރެއެވެ.`),
  target: (to, index, count) => `${to}، ${count} ގެ ތެރެއިން ${index}.`,
  noTarget: "އެއްވެސް ޕޯޓެއް މި ވަޔަރު ބަލައެއް ނުގަނެ.",
  connected: (from, to) => `${from} އަދި ${to} ގުޅުވިއްޖެ.`,
  notConnected: "ނުގުޅުވި.",
} satisfies Catalog<SceneMessages>
