var mr_default = {
  selection: (count) => count === 0 ? "निवड काढली." : count === 1 ? "1 आयटम निवडला." : `निवडलेले आयटम: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "हलवले." : `हलवलेले आयटम: ${count}.`,
  notMoved: "हलवले नाही.",
  port: (port, node) => `${port} (${node})`,
  linkPort: (port) => `${port} पासून जोडा`,
  wiring: (from, count) => count === 1 ? `${from} पासून वायर जोडली जात आहे. 1 पोर्ट ती स्वीकारतो. निवडण्यासाठी बाण कळा, जोडण्यासाठी Enter आणि रद्द करण्यासाठी Escape दाबा.` : `${from} पासून वायर जोडली जात आहे. ती स्वीकारणारे पोर्ट: ${count}. निवडण्यासाठी बाण कळा, जोडण्यासाठी Enter आणि रद्द करण्यासाठी Escape दाबा.`,
  target: (to, index, count) => `${to}, ${count} पैकी ${index}.`,
  noTarget: "कोणताही पोर्ट ही वायर स्वीकारत नाही.",
  connected: (from, to) => `${from} आणि ${to} जोडले गेले.`,
  notConnected: "जोडले गेले नाही."
};
export {
  mr_default as default
};
