import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "هەڵبژاردن لابرا." : count === 1 ? "1 بڕگە هەڵبژێردرا." : `بڕگە هەڵبژێردراوەکان: ${count}.`),
  moving: (x, y) => `x ${x}، y ${y}.`,
  moved: count => (count === 1 ? "جوولێنرا." : `بڕگە جوولێنراوەکان: ${count}.`),
  notMoved: "نەجوولێنرا.",
  port: (port, node) => `${port}ی ${node}`,
  linkPort: port => `بەستنەوە لە ${port}`,
  wiring: (from, count) => (count === 1 ? `تێل لە ${from}. 1 دەرگا وەریدەگرێت. کلیلەکانی تیر هەڵدەبژێرن، Enter دەبەستێتەوە، Escape هەڵدەوەشێنێتەوە.` : `تێل لە ${from}. ئەو دەرگایانەی وەریدەگرن: ${count}. کلیلەکانی تیر هەڵدەبژێرن، Enter دەبەستێتەوە، Escape هەڵدەوەشێنێتەوە.`),
  target: (to, index, count) => `${to}، ${index} لە ${count}.`,
  noTarget: "هیچ دەرگایەک ئەم تێلە وەرناگرێت.",
  connected: (from, to) => `${from} بە ${to} بەسترایەوە.`,
  notConnected: "نەبەسترایەوە.",
} satisfies Catalog<SceneMessages>
