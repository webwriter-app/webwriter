var am_default = {
  selection: (count) => count === 0 ? "ምርጫው ጸድቷል።" : count === 1 ? "1 ንጥል ተመርጧል።" : `የተመረጡ ንጥሎች፦ ${count}።`,
  moving: (x, y) => `x ${x}፣ y ${y}።`,
  moved: (count) => count === 1 ? "ተንቀሳቅሷል።" : `የተንቀሳቀሱ ንጥሎች፦ ${count}።`,
  notMoved: "አልተንቀሳቀሰም።",
  port: (port, node) => `${node} ${port}`,
  linkPort: (port) => `ከ${port} አገናኝ`,
  wiring: (from, count) => count === 1 ? `ከ${from} የሚነሳ ሽቦ። 1 ወደብ ይቀበለዋል። የቀስት ቁልፎች ይመርጣሉ፣ Enter ያገናኛል፣ Escape ይሰርዛል።` : `ከ${from} የሚነሳ ሽቦ። የሚቀበሉት ወደቦች፦ ${count}። የቀስት ቁልፎች ይመርጣሉ፣ Enter ያገናኛል፣ Escape ይሰርዛል።`,
  target: (to, index, count) => `${to}፣ ${index} ከ${count}።`,
  noTarget: "ይህን ሽቦ የሚቀበል ወደብ የለም።",
  connected: (from, to) => `${from} ከ${to} ጋር ተገናኝቷል።`,
  notConnected: "አልተገናኘም።"
};
export {
  am_default as default
};
