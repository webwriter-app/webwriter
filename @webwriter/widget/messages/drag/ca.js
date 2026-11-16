var ca_default = {
  picked: (item) => `${item} recollit. Feu servir les fletxes per triar un lloc, Retorn per deixar anar, Esc per cancel·lar.`,
  pickedLink: (item) => `Enllaçant ${item}. Feu servir les fletxes per triar amb què enllaçar-lo, Retorn per enllaçar, Esc per cancel·lar.`,
  selected: (item) => `${item} seleccionat. Feu clic on ha d’anar, o feu clic de nou sobre l’element per cancel·lar.`,
  nextTarget: "La tecla Tab passa a la destinació següent.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}posició ${position.index} de ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} des de l’esquerra, ${y} des de dalt`,
  dropped: (item, target) => target ? `${item} deixat anar a ${target}.` : `${item} deixat anar.`,
  copied: (item, target) => target ? `${item} afegit a ${target}.` : `${item} afegit.`,
  linked: (item, target) => `${item} enllaçat amb ${target}.`,
  cancelled: () => "Cancel·lat.",
  notAllowed: "Cancel·lat. Ja no es permet aquí."
};
export {
  ca_default as default
};
