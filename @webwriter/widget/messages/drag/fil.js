var fil_default = {
  picked: (item) => `Napulot ang ${item}. Gamitin ang mga arrow key para pumili ng lugar, Enter para ihulog, Escape para kanselahin.`,
  pickedLink: (item) => `Iniuugnay ang ${item}. Gamitin ang mga arrow key para pumili ng iuugnay rito, Enter para iugnay, Escape para kanselahin.`,
  selected: (item) => `Napili ang ${item}. I-click kung saan ito dapat ilagay, o i-click itong muli para kanselahin.`,
  nextTarget: "Inililipat ng Tab sa susunod na target.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}posisyon ${position.index} sa ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} mula sa kaliwa, ${y} mula sa itaas`,
  dropped: (item, target) => target ? `Inihulog ang ${item} sa ${target}.` : `Inihulog ang ${item}.`,
  copied: (item, target) => target ? `Idinagdag ang ${item} sa ${target}.` : `Idinagdag ang ${item}.`,
  linked: (item, target) => `Iniugnay ang ${item} sa ${target}.`,
  cancelled: () => "Kinansela.",
  notAllowed: "Kinansela. Hindi na ito pinapayagan dito."
};
export {
  fil_default as default
};
