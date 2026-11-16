var ku_default = {
  picked: (item) => `${item} hate hilbijartin. Bi tîpên tîran cihekî hilbijêrin, bi Enter bavêjin, bi Escape betal bikin.`,
  pickedLink: (item) => `${item} tê girêdan. Bi tîpên tîran hilbijêrin ku bi çi re bê girêdan, bi Enter girêdin, bi Escape betal bikin.`,
  selected: (item) => `${item} hate hilbijartin. Li cihê ku divê biçe bitikînin, an ji bo betalkirinê dîsa lê bitikînin.`,
  nextTarget: "Tab diçe armanca din.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}cih ${position.index} ji ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} ji çepê, ${y} ji jorê`,
  dropped: (item, target) => target ? `${item} li ${target} hate danîn.` : `${item} hate danîn.`,
  copied: (item, target) => target ? `${item} li ${target} hate zêdekirin.` : `${item} hate zêdekirin.`,
  linked: (item, target) => `${item} bi ${target} re hate girêdan.`,
  cancelled: () => "Hate betalkirin.",
  notAllowed: "Hate betalkirin. Êdî li vir destûr tune ye."
};
export {
  ku_default as default
};
