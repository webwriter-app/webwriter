var sl_default = {
  picked: (item) => `Pobrano: ${item}. S puščičnimi tipkami izberite mesto, s tipko Enter spustite, s tipko Escape prekličite.`,
  pickedLink: (item) => `Povezovanje: ${item}. S puščičnimi tipkami izberite cilj povezave, s tipko Enter povežite, s tipko Escape prekličite.`,
  selected: (item) => `Izbrano: ${item}. Kliknite mesto, kamor naj gre, ali kliknite znova za preklic.`,
  nextTarget: "S tipko Tab preidete na naslednji cilj.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}mesto ${position.index} od ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} z leve, ${y} z vrha`,
  dropped: (item, target) => target ? `Spuščeno: ${item}, cilj: ${target}.` : `Spuščeno: ${item}.`,
  copied: (item, target) => target ? `Dodano: ${item}, cilj: ${target}.` : `Dodano: ${item}.`,
  linked: (item, target) => `Povezano: ${item} in ${target}.`,
  cancelled: () => "Preklicano.",
  notAllowed: "Preklicano. Tu to ni več dovoljeno."
};
export {
  sl_default as default
};
