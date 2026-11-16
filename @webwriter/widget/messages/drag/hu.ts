import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Felvéve: ${item}. A nyílbillentyűkkel válasszon helyet, az Enter billentyűvel tegye le, az Esc billentyűvel vonja vissza.`,
  pickedLink: item => `Összekapcsolás: ${item}. A nyílbillentyűkkel válassza ki, mivel kapcsolja össze, az Enter billentyűvel kapcsolja össze, az Esc billentyűvel vonja vissza.`,
  selected: item => `Kijelölve: ${item}. Kattintson arra a helyre, ahová kerüljön, vagy kattintson újra a visszavonáshoz.`,
  nextTarget: "A Tab billentyű a következő célra lép.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.index}. hely, összesen ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} balról, ${y} fentről`,
  dropped: (item, target) => (target ? `Letéve: ${item}, cél: ${target}.` : `Letéve: ${item}.`),
  copied: (item, target) => (target ? `Hozzáadva: ${item}, cél: ${target}.` : `Hozzáadva: ${item}.`),
  linked: (item, target) => `Összekapcsolva: ${item} és ${target}.`,
  cancelled: () => "Megszakítva.",
  notAllowed: "Megszakítva. Ez itt már nem engedélyezett.",
} satisfies Catalog<DragMessages>
