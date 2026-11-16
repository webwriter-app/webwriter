var uk_default = {
  picked: (item) => `Взято елемент «${item}». Стрілками виберіть місце, Enter — покласти, Escape — скасувати.`,
  pickedLink: (item) => `Зв’язування: «${item}». Стрілками виберіть, з чим зв’язати, Enter — зв’язати, Escape — скасувати.`,
  selected: (item) => `Вибрано елемент «${item}». Клацніть там, куди його треба помістити, або клацніть по ньому ще раз, щоб скасувати.`,
  nextTarget: "Tab переходить до наступної цілі.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}позиція ${position.index} з ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} зліва, ${y} зверху`,
  dropped: (item, target) => target ? `«${item}» поміщено в «${target}».` : `«${item}» поміщено.`,
  copied: (item, target) => target ? `«${item}» додано до «${target}».` : `«${item}» додано.`,
  linked: (item, target) => `«${item}» зв’язано з «${target}».`,
  cancelled: () => "Скасовано.",
  notAllowed: "Скасовано. Тут це більше не дозволено."
};
export {
  uk_default as default
};
