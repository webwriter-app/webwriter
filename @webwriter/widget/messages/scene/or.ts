import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "ଚୟନ ହଟାଯାଇଛି।" : count === 1 ? "1 ଆଇଟମ୍ ବଛାଯାଇଛି।" : `ବଛାଯାଇଥିବା ଆଇଟମ୍: ${count}।`),
  moving: (x, y) => `x ${x}, y ${y}।`,
  moved: count => (count === 1 ? "ସରାଯାଇଛି।" : `ସରାଯାଇଥିବା ଆଇଟମ୍: ${count}।`),
  notMoved: "ସରାଯାଇ ନାହିଁ।",
  port: (port, node) => `${port} (${node})`,
  linkPort: port => `${port} ରୁ ସଂଯୋଗ କରନ୍ତୁ`,
  wiring: (from, count) => (count === 1 ? `${from} ରୁ ତାର ଯୋଡ଼ାଯାଉଛି। 1 ପୋର୍ଟ ଏହାକୁ ଗ୍ରହଣ କରେ। ବାଛିବାକୁ ତୀର କି, ସଂଯୋଗ କରିବାକୁ Enter ଏବଂ ବାତିଲ କରିବାକୁ Escape ଦବାନ୍ତୁ।` : `${from} ରୁ ତାର ଯୋଡ଼ାଯାଉଛି। ଏହାକୁ ଗ୍ରହଣ କରୁଥିବା ପୋର୍ଟ: ${count}। ବାଛିବାକୁ ତୀର କି, ସଂଯୋଗ କରିବାକୁ Enter ଏବଂ ବାତିଲ କରିବାକୁ Escape ଦବାନ୍ତୁ।`),
  target: (to, index, count) => `${to}, ${count} ମଧ୍ୟରୁ ${index}।`,
  noTarget: "କୌଣସି ପୋର୍ଟ ଏହି ତାରକୁ ଗ୍ରହଣ କରେ ନାହିଁ।",
  connected: (from, to) => `${from} ଏବଂ ${to} ସଂଯୁକ୍ତ ହୋଇଛି।`,
  notConnected: "ସଂଯୁକ୍ତ ହୋଇ ନାହିଁ।",
} satisfies Catalog<SceneMessages>
