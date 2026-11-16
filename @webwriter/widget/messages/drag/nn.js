var nn_default = {
  picked: (item) => `Plukka opp ${item}. Bruk piltastane for å velja ein plass, Enter for å sleppa, Escape for å avbryta.`,
  pickedLink: (item) => `Koplar ${item}. Bruk piltastane for å velja kva det skal koplast til, Enter for å kopla, Escape for å avbryta.`,
  selected: (item) => `Valde ${item}. Klikk der det skal plasserast, eller klikk på det igjen for å avbryta.`,
  nextTarget: "Tab går til neste mål.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}plass ${position.index} av ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} frå venstre, ${y} frå toppen`,
  dropped: (item, target) => target ? `Slapp ${item} på ${target}.` : `Slapp ${item}.`,
  copied: (item, target) => target ? `La ${item} til i ${target}.` : `La til ${item}.`,
  linked: (item, target) => `Kopla ${item} til ${target}.`,
  cancelled: () => "Avbrote.",
  notAllowed: "Avbrote. Dette er ikkje lenger tillate her."
};
export {
  nn_default as default
};
