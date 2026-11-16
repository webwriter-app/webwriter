import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Узяты элемент «${item}». Стрэлкамі абярыце месца, Enter — пакласці, Escape — скасаваць.`,
  pickedLink: item => `Звязванне: «${item}». Стрэлкамі абярыце, з чым звязаць, Enter — звязаць, Escape — скасаваць.`,
  selected: item => `Абраны элемент «${item}». Пстрыкніце там, куды яго трэба змясціць, або пстрыкніце па ім яшчэ раз, каб скасаваць.`,
  nextTarget: "Tab пераходзіць да наступнай мэты.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}пазіцыя ${position.index} з ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} злева, ${y} зверху`,
  dropped: (item, target) => (target ? `«${item}» змешчаны ў «${target}».` : `«${item}» змешчаны.`),
  copied: (item, target) => (target ? `«${item}» дададзены ў «${target}».` : `«${item}» дададзены.`),
  linked: (item, target) => `«${item}» звязаны з «${target}».`,
  cancelled: () => "Скасавана.",
  notAllowed: "Скасавана. Тут гэта больш не дазволена.",
} satisfies Catalog<DragMessages>
