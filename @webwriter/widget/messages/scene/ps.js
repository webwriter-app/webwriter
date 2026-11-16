var ps_default = {
  selection: (count) => count === 0 ? "انتخاب لرې شو." : count === 1 ? "۱ توکی وټاکل شو." : `ټاکل شوي توکي: ${count}.`,
  moving: (x, y) => `x ${x}، y ${y}.`,
  moved: (count) => count === 1 ? "ولېږدول شو." : `لېږدول شوي توکي: ${count}.`,
  notMoved: "ونه لېږدول شو.",
  port: (port, node) => `د ${node} ${port}`,
  linkPort: (port) => `له ${port} نښلول`,
  wiring: (from, count) => count === 1 ? `له ${from} څخه تار. ۱ پورټ یې مني. د غشو کیلیدونه ټاکي، Enter نښلوي، Escape لغوه کوي.` : `له ${from} څخه تار. هغه پورټونه چې یې مني: ${count}. د غشو کیلیدونه ټاکي، Enter نښلوي، Escape لغوه کوي.`,
  target: (to, index, count) => `${to}، ${count} څخه ${index}.`,
  noTarget: "هیڅ پورټ دا تار نه مني.",
  connected: (from, to) => `${from} له ${to} سره ونښلول شو.`,
  notConnected: "ونه نښلول شو."
};
export {
  ps_default as default
};
