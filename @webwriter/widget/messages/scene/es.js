var es_default = {
  selection: (count) => count === 0 ? "Selección borrada." : count === 1 ? "1 elemento seleccionado." : `Elementos seleccionados: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Movido." : `Elementos movidos: ${count}.`,
  notMoved: "No se movió.",
  port: (port, node) => `${port} de ${node}`,
  linkPort: (port) => `Conectar desde ${port}`,
  wiring: (from, count) => count === 1 ? `Cable desde ${from}. 1 puerto lo acepta. Las flechas eligen, Intro conecta, Esc cancela.` : `Cable desde ${from}. Puertos que lo aceptan: ${count}. Las flechas eligen, Intro conecta, Esc cancela.`,
  target: (to, index, count) => `${to}, ${index} de ${count}.`,
  noTarget: "Ningún puerto acepta este cable.",
  connected: (from, to) => `${from} conectado con ${to}.`,
  notConnected: "No conectado."
};
export {
  es_default as default
};
