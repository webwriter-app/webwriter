var kk_default = {
  picked: (item) => `${item} алынды. Орынды таңдау үшін көрсеткі пернелерін, қою үшін Enter пернесін, бас тарту үшін Escape пернесін пайдаланыңыз.`,
  pickedLink: (item) => `${item} байланыстырылуда. Байланыстыратын нысанды таңдау үшін көрсеткі пернелерін, байланыстыру үшін Enter пернесін, бас тарту үшін Escape пернесін пайдаланыңыз.`,
  selected: (item) => `${item} таңдалды. Қойылатын жерді басыңыз немесе бас тарту үшін оны қайта басыңыз.`,
  nextTarget: "Tab пернесі келесі нысанға ауыстырады.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}орын ${position.index} / ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}солдан ${x}, жоғарыдан ${y}`,
  dropped: (item, target) => target ? `${item} қойылды. Нысан: ${target}.` : `${item} қойылды.`,
  copied: (item, target) => target ? `${item} қосылды. Нысан: ${target}.` : `${item} қосылды.`,
  linked: (item, target) => `${item} байланыстырылды. Нысан: ${target}.`,
  cancelled: () => "Бас тартылды.",
  notAllowed: "Бас тартылды. Бұған енді мұнда рұқсат жоқ."
};
export {
  kk_default as default
};
