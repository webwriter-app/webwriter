import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Взят элемент «${item}». Стрелками выберите место, Enter — положить, Escape — отменить.`,
  pickedLink: item => `Связывание: «${item}». Стрелками выберите, с чем связать, Enter — связать, Escape — отменить.`,
  selected: item => `Выбран элемент «${item}». Щёлкните там, куда его нужно поместить, или щёлкните по нему ещё раз, чтобы отменить.`,
  nextTarget: "Tab переходит к следующей цели.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}позиция ${position.index} из ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} слева, ${y} сверху`,
  dropped: (item, target) => (target ? `«${item}» помещён в «${target}».` : `«${item}» помещён.`),
  copied: (item, target) => (target ? `«${item}» добавлен в «${target}».` : `«${item}» добавлен.`),
  linked: (item, target) => `«${item}» связан с «${target}».`,
  cancelled: () => "Отменено.",
  notAllowed: "Отменено. Здесь это больше не разрешено.",
} satisfies Catalog<DragMessages>
