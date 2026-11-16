var so_default = {
  selection: (count) => count === 0 ? "Doorashada waa la tirtiray." : count === 1 ? "1 shay ayaa la doortay." : `Shayada la doortay: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Waa la dhaqaajiyay." : `Shayada la dhaqaajiyay: ${count}.`,
  notMoved: "Lama dhaqaajin.",
  port: (port, node) => `${port} ee ${node}`,
  linkPort: (port) => `Ka xir ${port}`,
  wiring: (from, count) => count === 1 ? `Silig ka bilaabma ${from}. 1 deked ayaa aqbalaysa. Fallaadhuhu waa la doortaa, Enter wuu xiraa, Escape wuu joojiyaa.` : `Silig ka bilaabma ${from}. Dekedaha aqbalaya: ${count}. Fallaadhuhu waa la doortaa, Enter wuu xiraa, Escape wuu joojiyaa.`,
  target: (to, index, count) => `${to}, ${index} ee ${count}.`,
  noTarget: "Dekedna ma aqbalayso siligan.",
  connected: (from, to) => `${from} waxaa lagu xiray ${to}.`,
  notConnected: "Lama xirin."
};
export {
  so_default as default
};
