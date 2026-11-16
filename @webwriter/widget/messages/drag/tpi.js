var tpi_default = {
  picked: (item) => `Yu kisim ${item}. Yusim ol arrow key long makim wanpela ples, Enter long dropim, Escape long rausim.`,
  pickedLink: (item) => `Yu pasim ${item}. Yusim ol arrow key long makim wanem samting bai yu pasim long en, Enter long pasim, Escape long rausim.`,
  selected: (item) => `Yu makim ${item}. Klikim ples we yu laik putim, o klikim gen long rausim.`,
  nextTarget: "Tab i go long narapela target.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}namba ${position.index} long ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} long han kais, ${y} long antap`,
  dropped: (item, target) => target ? `Yu dropim ${item} long ${target}.` : `Yu dropim ${item}.`,
  copied: (item, target) => target ? `Yu putim ${item} long ${target}.` : `Yu putim ${item}.`,
  linked: (item, target) => `Yu pasim ${item} long ${target}.`,
  cancelled: () => "Yu rausim.",
  notAllowed: "Yu rausim. Em i no inap mekim long hia nau."
};
export {
  tpi_default as default
};
