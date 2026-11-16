var is_default = {
  picked: (item) => `Tók upp ${item}. Notaðu örvatakkana til að velja stað, Enter til að sleppa og Escape til að hætta við.`,
  pickedLink: (item) => `Tengi ${item}. Notaðu örvatakkana til að velja hvað á að tengja við, Enter til að tengja og Escape til að hætta við.`,
  selected: (item) => `Valdi ${item}. Smelltu þar sem það á að vera eða smelltu aftur á það til að hætta við.`,
  nextTarget: "Tab fer á næsta mark.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}staða ${position.index} af ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} frá vinstri, ${y} að ofan`,
  dropped: (item, target) => target ? `Sleppti ${item} á ${target}.` : `Sleppti ${item}.`,
  copied: (item, target) => target ? `Bætti ${item} við ${target}.` : `Bætti ${item} við.`,
  linked: (item, target) => `Tengdi ${item} við ${target}.`,
  cancelled: () => "Hætt við.",
  notAllowed: "Hætt við. Þetta er ekki lengur leyfilegt hér."
};
export {
  is_default as default
};
