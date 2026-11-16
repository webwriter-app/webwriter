var sr_ijekavsk_default = {
  picked: (item) => `Подигнуто: ${item}. Стрелицама изаберите мјесто, тастером Enter отпустите, тастером Escape откажите.`,
  pickedLink: (item) => `Повезивање: ${item}. Стрелицама изаберите са чим да се повеже, тастером Enter повежите, тастером Escape откажите.`,
  selected: (item) => `Изабрано: ${item}. Кликните гдје треба да оде или кликните поново на њега да бисте одустали.`,
  nextTarget: "Tab води на сљедећи циљ.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}позиција ${position.index} од ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} слијева, ${y} одозго`,
  dropped: (item, target) => target ? `${item} је спуштено на ${target}.` : `${item} је спуштено.`,
  copied: (item, target) => target ? `${item} је додато у ${target}.` : `${item} је додато.`,
  linked: (item, target) => `${item} је повезано са ${target}.`,
  cancelled: () => "Отказано.",
  notAllowed: "Отказано. Ово овдје више није дозвољено."
};
export {
  sr_ijekavsk_default as default
};
