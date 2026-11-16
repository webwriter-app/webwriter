var pt_BR_default = {
  picked: (item) => `${item} selecionado. Use as setas para escolher um local, Enter para soltar, Esc para cancelar.`,
  pickedLink: (item) => `Vinculando ${item}. Use as setas para escolher a que vincular, Enter para vincular, Esc para cancelar.`,
  selected: (item) => `${item} selecionado. Clique no local de destino ou clique novamente no item para cancelar.`,
  nextTarget: "A tecla Tab vai para o próximo destino.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}posição ${position.index} de ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} a partir da esquerda, ${y} a partir do topo`,
  dropped: (item, target) => target ? `${item} solto em ${target}.` : `${item} solto.`,
  copied: (item, target) => target ? `${item} adicionado a ${target}.` : `${item} adicionado.`,
  linked: (item, target) => `${item} vinculado a ${target}.`,
  cancelled: () => "Cancelado.",
  notAllowed: "Cancelado. Isso não é mais permitido aqui."
};
export {
  pt_BR_default as default
};
