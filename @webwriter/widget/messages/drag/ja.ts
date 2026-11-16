import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item}を持ち上げました。矢印キーで場所を選び、Enter キーで置き、Esc キーでキャンセルします。`,
  pickedLink: item => `${item}を接続しています。矢印キーで接続先を選び、Enter キーで接続、Esc キーでキャンセルします。`,
  selected: item => `${item}を選択しました。置きたい場所をクリックするか、もう一度クリックしてキャンセルします。`,
  nextTarget: "Tab キーで次のターゲットに移動します。",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.count} 件中 ${position.index} 番目の位置` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}左から ${x}、上から ${y}`,
  dropped: (item, target) => (target ? `${item}を${target}に置きました。` : `${item}を置きました。`),
  copied: (item, target) => (target ? `${item}を${target}に追加しました。` : `${item}を追加しました。`),
  linked: (item, target) => `${item}を${target}に接続しました。`,
  cancelled: () => "キャンセルしました。",
  notAllowed: "キャンセルしました。ここでは、この操作はできなくなりました。",
} satisfies Catalog<DragMessages>
