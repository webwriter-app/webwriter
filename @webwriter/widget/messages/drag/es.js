var es_default = {
  picked: (item) => `${item} recogido. Usa las flechas para elegir un lugar, Intro para soltar, Esc para cancelar.`,
  pickedLink: (item) => `Vinculando ${item}. Usa las flechas para elegir con qué vincularlo, Intro para vincular, Esc para cancelar.`,
  selected: (item) => `${item} seleccionado. Haz clic donde debe ir, o haz clic de nuevo en él para cancelar.`,
  nextTarget: "Tab pasa al siguiente destino.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}posición ${position.index} de ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} desde la izquierda, ${y} desde arriba`,
  dropped: (item, target) => target ? `${item} soltado en ${target}.` : `${item} soltado.`,
  copied: (item, target) => target ? `${item} añadido a ${target}.` : `${item} añadido.`,
  linked: (item, target) => `${item} vinculado con ${target}.`,
  cancelled: () => "Cancelado.",
  notAllowed: "Cancelado. Ya no se permite aquí."
};
export {
  es_default as default
};
