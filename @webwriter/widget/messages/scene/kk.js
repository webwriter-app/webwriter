var kk_default = {
  selection: (count) => count === 0 ? "Таңдау жойылды." : count === 1 ? "1 элемент таңдалды." : `Таңдалған элементтер саны: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Жылжытылды." : `Жылжытылған элементтер саны: ${count}.`,
  notMoved: "Жылжытылмады.",
  port: (port, node) => `${node}: ${port}`,
  linkPort: (port) => `Байланысты мына жерден бастау: ${port}`,
  wiring: (from, count) => count === 1 ? `Байланыстың басы: ${from}. 1 порт қабылдайды. Таңдау үшін көрсеткі пернелері, байланыстыру үшін Enter, бас тарту үшін Escape.` : `Байланыстың басы: ${from}. Қабылдайтын порттар саны: ${count}. Таңдау үшін көрсеткі пернелері, байланыстыру үшін Enter, бас тарту үшін Escape.`,
  target: (to, index, count) => `${to}, ${index} / ${count}.`,
  noTarget: "Бірде-бір порт бұл байланысты қабылдамайды.",
  connected: (from, to) => `Байланыстырылды: ${from} және ${to}.`,
  notConnected: "Байланыстырылмады."
};
export {
  kk_default as default
};
