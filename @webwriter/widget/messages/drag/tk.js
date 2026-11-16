var tk_default = {
  picked: (item) => `${item} alyndy. Ýer saýlamak üçin ok düwmelerini, goýmak üçin Enter düwmesini, ýatyrmak üçin Escape düwmesini ulanyň.`,
  pickedLink: (item) => `${item} baglanýar. Baglanjak nyşany saýlamak üçin ok düwmelerini, baglamak üçin Enter düwmesini, ýatyrmak üçin Escape düwmesini ulanyň.`,
  selected: (item) => `${item} saýlandy. Goýmaly ýerine basyň ýa-da ýatyrmak üçin oňa ýene bir gezek basyň.`,
  nextTarget: "Tab düwmesi indiki nyşana geçýär.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}orun ${position.index} / ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}çepden ${x}, ýokardan ${y}`,
  dropped: (item, target) => target ? `${item} goýuldy. Nyşan: ${target}.` : `${item} goýuldy.`,
  copied: (item, target) => target ? `${item} goşuldy. Nyşan: ${target}.` : `${item} goşuldy.`,
  linked: (item, target) => `${item} baglandy. Nyşan: ${target}.`,
  cancelled: () => "Ýatyryldy.",
  notAllowed: "Ýatyryldy. Munuň üçin bu ýerde indi rugsat ýok."
};
export {
  tk_default as default
};
