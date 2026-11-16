var ga_default = {
  picked: (item) => `Tógadh: ${item}. Úsáid na heochracha saigheada chun áit a roghnú, Enter chun scaoileadh, Escape chun cealú.`,
  pickedLink: (item) => `Ag nascadh: ${item}. Úsáid na heochracha saigheada chun an sprioc a roghnú, Enter chun nascadh, Escape chun cealú.`,
  selected: (item) => `Roghnaíodh: ${item}. Cliceáil san áit ar chóir dó dul, nó cliceáil air arís chun cealú.`,
  nextTarget: "Téann Tab chuig an gcéad sprioc eile.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}suíomh ${position.index} as ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} ón taobh clé, ${y} ón mbarr`,
  dropped: (item, target) => target ? `Scaoileadh: ${item}, sprioc: ${target}.` : `Scaoileadh: ${item}.`,
  copied: (item, target) => target ? `Cuireadh leis: ${item}, sprioc: ${target}.` : `Cuireadh leis: ${item}.`,
  linked: (item, target) => `Nasctha: ${item} agus ${target}.`,
  cancelled: () => "Cealaithe.",
  notAllowed: "Cealaithe. Níl sé seo ceadaithe anseo a thuilleadh."
};
export {
  ga_default as default
};
