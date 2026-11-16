var mk_default = {
  picked: (item) => `Подигнато: ${item}. Со стрелките изберете место, со Enter спуштете, со Escape откажете.`,
  pickedLink: (item) => `Поврзување на ${item}. Со стрелките изберете со што да се поврзе, со Enter поврзете, со Escape откажете.`,
  selected: (item) => `Избрано: ${item}. Кликнете каде треба да се постави или кликнете повторно врз него за да откажете.`,
  nextTarget: "Tab префрла на следната цел.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}позиција ${position.index} од ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} од лево, ${y} од горе`,
  dropped: (item, target) => target ? `${item} е спуштено врз ${target}.` : `${item} е спуштено.`,
  copied: (item, target) => target ? `${item} е додадено во ${target}.` : `${item} е додадено.`,
  linked: (item, target) => `${item} е поврзано со ${target}.`,
  cancelled: () => "Откажано.",
  notAllowed: "Откажано. Ова повеќе не е дозволено тука."
};
export {
  mk_default as default
};
