var hr_default = {
  selection: (count) => count === 0 ? "Odabir je poništen." : count === 1 ? "Odabran je 1 element." : `Odabrani elementi: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Premješteno." : `Premješteni elementi: ${count}.`,
  notMoved: "Nije premješteno.",
  port: (port, node) => `${port} na ${node}`,
  linkPort: (port) => `Poveži od ${port}`,
  wiring: (from, count) => count === 1 ? `Veza od ${from}. Prihvaća je 1 priključak. Strelicama birate, tipkom Enter povezujete, tipkom Escape odustajete.` : `Veza od ${from}. Priključci koji je prihvaćaju: ${count}. Strelicama birate, tipkom Enter povezujete, tipkom Escape odustajete.`,
  target: (to, index, count) => `${to}, ${index} od ${count}.`,
  noTarget: "Nijedan priključak ne prihvaća ovu vezu.",
  connected: (from, to) => `${from} je povezano s ${to}.`,
  notConnected: "Nije povezano."
};
export {
  hr_default as default
};
