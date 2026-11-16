var ca_default = {
  selection: (count) => count === 0 ? "Selecció esborrada." : count === 1 ? "1 element seleccionat." : `Elements seleccionats: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Mogut." : `Elements moguts: ${count}.`,
  notMoved: "No s’ha mogut.",
  port: (port, node) => `${port} de ${node}`,
  linkPort: (port) => `Connecta des de ${port}`,
  wiring: (from, count) => count === 1 ? `Cable des de ${from}. 1 port l’accepta. Les fletxes trien, Retorn connecta, Esc cancel·la.` : `Cable des de ${from}. Ports que l’accepten: ${count}. Les fletxes trien, Retorn connecta, Esc cancel·la.`,
  target: (to, index, count) => `${to}, ${index} de ${count}.`,
  noTarget: "Cap port accepta aquest cable.",
  connected: (from, to) => `${from} connectat amb ${to}.`,
  notConnected: "No connectat."
};
export {
  ca_default as default
};
