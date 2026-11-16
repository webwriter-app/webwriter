var pa_default = {
  selection: (count) => count === 0 ? "ਚੋਣ ਹਟਾਈ ਗਈ।" : count === 1 ? "1 ਆਈਟਮ ਚੁਣੀ ਗਈ।" : `ਚੁਣੀਆਂ ਆਈਟਮਾਂ: ${count}।`,
  moving: (x, y) => `x ${x}, y ${y}।`,
  moved: (count) => count === 1 ? "ਹਿਲਾਇਆ ਗਿਆ।" : `ਹਿਲਾਈਆਂ ਆਈਟਮਾਂ: ${count}।`,
  notMoved: "ਹਿਲਾਇਆ ਨਹੀਂ ਗਿਆ।",
  port: (port, node) => `${port} (${node})`,
  linkPort: (port) => `${port} ਤੋਂ ਜੋੜੋ`,
  wiring: (from, count) => count === 1 ? `${from} ਤੋਂ ਤਾਰ ਜੋੜੀ ਜਾ ਰਹੀ ਹੈ। 1 ਪੋਰਟ ਇਸ ਨੂੰ ਸਵੀਕਾਰ ਕਰਦਾ ਹੈ। ਚੁਣਨ ਲਈ ਤੀਰ ਕੁੰਜੀਆਂ, ਜੋੜਨ ਲਈ Enter ਅਤੇ ਰੱਦ ਕਰਨ ਲਈ Escape ਦਬਾਓ।` : `${from} ਤੋਂ ਤਾਰ ਜੋੜੀ ਜਾ ਰਹੀ ਹੈ। ਇਸ ਨੂੰ ਸਵੀਕਾਰ ਕਰਨ ਵਾਲੇ ਪੋਰਟ: ${count}। ਚੁਣਨ ਲਈ ਤੀਰ ਕੁੰਜੀਆਂ, ਜੋੜਨ ਲਈ Enter ਅਤੇ ਰੱਦ ਕਰਨ ਲਈ Escape ਦਬਾਓ।`,
  target: (to, index, count) => `${to}, ${count} ਵਿੱਚੋਂ ${index}।`,
  noTarget: "ਕੋਈ ਵੀ ਪੋਰਟ ਇਸ ਤਾਰ ਨੂੰ ਸਵੀਕਾਰ ਨਹੀਂ ਕਰਦਾ।",
  connected: (from, to) => `${from} ਅਤੇ ${to} ਜੋੜੇ ਗਏ।`,
  notConnected: "ਜੋੜਿਆ ਨਹੀਂ ਗਿਆ।"
};
export {
  pa_default as default
};
