var tg_default = {
  picked: (item) => `${item} гирифта шуд. Барои интихоби ҷой тугмаҳои тирчаро, барои гузоштан тугмаи Enter-ро, барои бекор кардан тугмаи Escape-ро истифода баред.`,
  pickedLink: (item) => `${item} пайваст карда мешавад. Барои интихоби ҳадаф тугмаҳои тирчаро, барои пайваст кардан тугмаи Enter-ро, барои бекор кардан тугмаи Escape-ро истифода баред.`,
  selected: (item) => `${item} интихоб шуд. Ҷойи гузоштанро клик кунед ё барои бекор кардан онро дубора клик кунед.`,
  nextTarget: "Тугмаи Tab ба ҳадафи навбатӣ мегузарад.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}ҷой ${position.index} аз ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}аз чап ${x}, аз боло ${y}`,
  dropped: (item, target) => target ? `${item} гузошта шуд. Ҳадаф: ${target}.` : `${item} гузошта шуд.`,
  copied: (item, target) => target ? `${item} илова шуд. Ҳадаф: ${target}.` : `${item} илова шуд.`,
  linked: (item, target) => `${item} пайваст карда шуд. Ҳадаф: ${target}.`,
  cancelled: () => "Бекор карда шуд.",
  notAllowed: "Бекор карда шуд. Ин амал дигар дар ин ҷо иҷозат дода намешавад."
};
export {
  tg_default as default
};
