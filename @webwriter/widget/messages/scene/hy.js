var hy_default = {
  selection: (count) => count === 0 ? "Ընտրությունը չեղարկվեց։" : count === 1 ? "Ընտրված է 1 տարր։" : `Ընտրված տարրերի քանակը՝ ${count}։`,
  moving: (x, y) => `x ${x}, y ${y}։`,
  moved: (count) => count === 1 ? "Տեղափոխվեց։" : `Տեղափոխված տարրերի քանակը՝ ${count}։`,
  notMoved: "Չտեղափոխվեց։",
  port: (port, node) => `${node}՝ ${port}`,
  linkPort: (port) => `Սկսել կապը այստեղից՝ ${port}`,
  wiring: (from, count) => count === 1 ? `Կապի սկիզբը՝ ${from}։ Այն ընդունում է 1 պորտ։ Ընտրելու համար՝ սլաքների ստեղները, կապելու համար՝ Enter, չեղարկելու համար՝ Escape։` : `Կապի սկիզբը՝ ${from}։ Այն ընդունող պորտերի քանակը՝ ${count}։ Ընտրելու համար՝ սլաքների ստեղները, կապելու համար՝ Enter, չեղարկելու համար՝ Escape։`,
  target: (to, index, count) => `${to}, ${index}՝ ${count}-ից։`,
  noTarget: "Ոչ մի պորտ չի ընդունում այս կապը։",
  connected: (from, to) => `Կապվեցին՝ ${from} և ${to}։`,
  notConnected: "Չկապվեց։"
};
export {
  hy_default as default
};
