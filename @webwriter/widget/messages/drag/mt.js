var mt_default = {
  picked: (item) => `Meħud: ${item}. Uża ż-żraratin tal-vleġeġ biex tagħżel post, Enter biex tħalli, Escape biex tikkanċella.`,
  pickedLink: (item) => `Qed twaħħal: ${item}. Uża ż-żraratin tal-vleġeġ biex tagħżel x'se twaħħlu miegħu, Enter biex twaħħal, Escape biex tikkanċella.`,
  selected: (item) => `Magħżul: ${item}. Ikklikkja fejn għandu jmur, jew ikklikkja fuqu mill-ġdid biex tikkanċella.`,
  nextTarget: "Tab imur fil-mira li jmiss.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}pożizzjoni ${position.index} minn ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} mix-xellug, ${y} minn fuq`,
  dropped: (item, target) => target ? `Poġġejt ${item} fuq ${target}.` : `Poġġejt ${item}.`,
  copied: (item, target) => target ? `Żidt ${item} ma' ${target}.` : `Żidt ${item}.`,
  linked: (item, target) => `Qabbadt ${item} ma' ${target}.`,
  cancelled: () => "Ikkanċellat.",
  notAllowed: "Ikkanċellat. Dan m'għadux permess hawn."
};
export {
  mt_default as default
};
