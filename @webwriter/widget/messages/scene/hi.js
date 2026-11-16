var hi_default = {
  selection: (count) => count === 0 ? "चयन हटाया गया।" : count === 1 ? "1 आइटम चुना गया।" : `चुने गए आइटम: ${count}।`,
  moving: (x, y) => `x ${x}, y ${y}।`,
  moved: (count) => count === 1 ? "हिलाया गया।" : `हिलाए गए आइटम: ${count}।`,
  notMoved: "नहीं हिलाया गया।",
  port: (port, node) => `${node} का ${port}`,
  linkPort: (port) => `${port} से कनेक्ट करें`,
  wiring: (from, count) => count === 1 ? `${from} से तार जोड़ा जा रहा है। 1 पोर्ट इसे स्वीकार करता है। चुनने के लिए तीर कुंजियाँ, जोड़ने के लिए Enter और रद्द करने के लिए Escape दबाएँ।` : `${from} से तार जोड़ा जा रहा है। इसे स्वीकार करने वाले पोर्ट: ${count}। चुनने के लिए तीर कुंजियाँ, जोड़ने के लिए Enter और रद्द करने के लिए Escape दबाएँ।`,
  target: (to, index, count) => `${to}, ${count} में से ${index}।`,
  noTarget: "कोई भी पोर्ट इस तार को स्वीकार नहीं करता।",
  connected: (from, to) => `${from} को ${to} से जोड़ा गया।`,
  notConnected: "जोड़ा नहीं गया।"
};
export {
  hi_default as default
};
