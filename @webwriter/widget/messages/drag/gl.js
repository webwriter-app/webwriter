var gl_default = {
  picked: (item) => `${item} recollido. Usa as frechas para escoller un lugar, Intro para soltar, Esc para cancelar.`,
  pickedLink: (item) => `Ligando ${item}. Usa as frechas para escoller con que ligalo, Intro para ligar, Esc para cancelar.`,
  selected: (item) => `${item} seleccionado. Fai clic onde debe ir ou fai clic de novo nel para cancelar.`,
  nextTarget: "A tecla Tab pasa ao seguinte destino.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}posición ${position.index} de ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} desde a esquerda, ${y} desde arriba`,
  dropped: (item, target) => target ? `${item} solto en ${target}.` : `${item} solto.`,
  copied: (item, target) => target ? `${item} engadido a ${target}.` : `${item} engadido.`,
  linked: (item, target) => `${item} ligado con ${target}.`,
  cancelled: () => "Cancelado.",
  notAllowed: "Cancelado. Isto xa non está permitido aquí."
};
export {
  gl_default as default
};
