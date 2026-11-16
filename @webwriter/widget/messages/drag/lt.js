var lt_default = {
  picked: (item) => `Paimta: ${item}. Rodyklėmis pasirinkite vietą, klavišu Enter padėkite, klavišu Escape atšaukite.`,
  pickedLink: (item) => `Jungiama: ${item}. Rodyklėmis pasirinkite, su kuo sujungti, klavišu Enter sujunkite, klavišu Escape atšaukite.`,
  selected: (item) => `Pasirinkta: ${item}. Spustelėkite, kur tai turi atsidurti, arba spustelėkite dar kartą, kad atšauktumėte.`,
  nextTarget: "Klavišas Tab perkelia į kitą paskirtį.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}vieta ${position.index} iš ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} nuo kairės, ${y} nuo viršaus`,
  dropped: (item, target) => target ? `Padėta: ${item}, paskirtis: ${target}.` : `Padėta: ${item}.`,
  copied: (item, target) => target ? `Pridėta: ${item}, paskirtis: ${target}.` : `Pridėta: ${item}.`,
  linked: (item, target) => `Sujungta: ${item} ir ${target}.`,
  cancelled: () => "Atšaukta.",
  notAllowed: "Atšaukta. Čia to daugiau daryti negalima."
};
export {
  lt_default as default
};
