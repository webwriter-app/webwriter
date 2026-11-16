var ti_default = {
  selection: (count) => count === 0 ? "ምርጫ ተሰሪዙ።" : count === 1 ? "1 ኣሃዱ ተመሪጹ።" : `ዝተመርጹ ኣሃዱታት፦ ${count}።`,
  moving: (x, y) => `x ${x}፣ y ${y}።`,
  moved: (count) => count === 1 ? "ተሰጋጊሩ።" : `ዝተሰጋገሩ ኣሃዱታት፦ ${count}።`,
  notMoved: "ኣይተሰጋገረን።",
  port: (port, node) => `${port} ናይ ${node}`,
  linkPort: (port) => `ካብ ${port} ኣተሓሕዝ`,
  wiring: (from, count) => count === 1 ? `ካብ ${from} ዝጅምር ገመድ። 1 ወደብ ይቕበሎ። ምልክታት ቀስቲ የምርጽ፣ Enter የተሓሕዝ፣ Escape የሰርዝ።` : `ካብ ${from} ዝጅምር ገመድ። ዝቕበልዎ ወደባት፦ ${count}። ምልክታት ቀስቲ የምርጽ፣ Enter የተሓሕዝ፣ Escape የሰርዝ።`,
  target: (to, index, count) => `${to}፣ ${index} ካብ ${count}።`,
  noTarget: "እዚ ገመድ ዝቕበል ወደብ የለን።",
  connected: (from, to) => `${from} ምስ ${to} ተተሓሒዙ።`,
  notConnected: "ኣይተተሓሓዘን።"
};
export {
  ti_default as default
};
