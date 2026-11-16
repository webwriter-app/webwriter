var ky_default = {
  picked: (item) => `${item} алынды. Ордун тандоо үчүн жебе баскычтарын, коюу үчүн Enter баскычын, жокко чыгаруу үчүн Escape баскычын колдонуңуз.`,
  pickedLink: (item) => `${item} байланыштырылууда. Байланыштыруучу бутаны тандоо үчүн жебе баскычтарын, байланыштыруу үчүн Enter баскычын, жокко чыгаруу үчүн Escape баскычын колдонуңуз.`,
  selected: (item) => `${item} тандалды. Коюла турган жерди басыңыз же жокко чыгаруу үчүн аны кайра басыңыз.`,
  nextTarget: "Tab баскычы кийинки бутага өтөт.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}орун ${position.index} / ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}солдон ${x}, жогорудан ${y}`,
  dropped: (item, target) => target ? `${item} коюлду. Бута: ${target}.` : `${item} коюлду.`,
  copied: (item, target) => target ? `${item} кошулду. Бута: ${target}.` : `${item} кошулду.`,
  linked: (item, target) => `${item} байланыштырылды. Бута: ${target}.`,
  cancelled: () => "Жокко чыгарылды.",
  notAllowed: "Жокко чыгарылды. Буга эми бул жерде уруксат жок."
};
export {
  ky_default as default
};
