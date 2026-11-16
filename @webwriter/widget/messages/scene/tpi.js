var tpi_default = {
  selection: (count) => count === 0 ? "Ol makim i rausim." : count === 1 ? "1 samting i makim." : `Namba bilong ol samting i makim: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "I muv pinis." : `Namba bilong ol samting i muv: ${count}.`,
  notMoved: "I no muv.",
  port: (port, node) => `${port} bilong ${node}`,
  linkPort: (port) => `Pas stat long ${port}`,
  wiring: (from, count) => count === 1 ? `Waia stat long ${from}. 1 port i kisim. Arrow key i makim, Enter i pasim, Escape i rausim.` : `Waia stat long ${from}. Namba bilong ol port i kisim: ${count}. Arrow key i makim, Enter i pasim, Escape i rausim.`,
  target: (to, index, count) => `${to}, ${index} long ${count}.`,
  noTarget: "I no gat port i kisim dispela waia.",
  connected: (from, to) => `Yu pasim ${from} long ${to}.`,
  notConnected: "I no pas."
};
export {
  tpi_default as default
};
