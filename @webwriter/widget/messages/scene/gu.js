var gu_default = {
  selection: (count) => count === 0 ? "પસંદગી દૂર કરી." : count === 1 ? "1 આઇટમ પસંદ કરી." : `પસંદ કરેલી આઇટમ: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "ખસેડ્યું." : `ખસેડેલી આઇટમ: ${count}.`,
  notMoved: "ખસેડ્યું નથી.",
  port: (port, node) => `${port} (${node})`,
  linkPort: (port) => `${port} થી જોડો`,
  wiring: (from, count) => count === 1 ? `${from} થી વાયર જોડાઈ રહ્યો છે. 1 પોર્ટ તેને સ્વીકારે છે. પસંદ કરવા માટે એરો કી, જોડવા માટે Enter અને રદ કરવા માટે Escape દબાવો.` : `${from} થી વાયર જોડાઈ રહ્યો છે. તેને સ્વીકારતા પોર્ટ: ${count}. પસંદ કરવા માટે એરો કી, જોડવા માટે Enter અને રદ કરવા માટે Escape દબાવો.`,
  target: (to, index, count) => `${to}, ${count} માંથી ${index}.`,
  noTarget: "કોઈ પોર્ટ આ વાયરને સ્વીકારતું નથી.",
  connected: (from, to) => `${from} અને ${to} જોડાયા.`,
  notConnected: "જોડાયું નથી."
};
export {
  gu_default as default
};
