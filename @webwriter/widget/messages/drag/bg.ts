import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Вдигнахте ${item}. С клавишите със стрелки изберете място, с Enter пуснете, с Escape откажете.`,
  pickedLink: item => `Свързване на ${item}. С клавишите със стрелки изберете с какво да се свърже, с Enter свържете, с Escape откажете.`,
  selected: item => `Избрахте ${item}. Щракнете там, където трябва да отиде, или щракнете отново върху него, за да откажете.`,
  nextTarget: "Tab премества към следващата цел.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}позиция ${position.index} от ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} отляво, ${y} отгоре`,
  dropped: (item, target) => (target ? `${item} е пуснат върху ${target}.` : `${item} е пуснат.`),
  copied: (item, target) => (target ? `${item} е добавен към ${target}.` : `${item} е добавен.`),
  linked: (item, target) => `${item} е свързан с ${target}.`,
  cancelled: () => "Отказано.",
  notAllowed: "Отказано. Това вече не е позволено тук.",
} satisfies Catalog<DragMessages>
