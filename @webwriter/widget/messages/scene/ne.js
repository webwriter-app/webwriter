var ne_default = {
  selection: (count) => count === 0 ? "चयन हटाइयो।" : count === 1 ? "1 वस्तु चयन गरियो।" : `चयन गरिएका वस्तु: ${count}।`,
  moving: (x, y) => `x ${x}, y ${y}।`,
  moved: (count) => count === 1 ? "सारियो।" : `सारिएका वस्तु: ${count}।`,
  notMoved: "सारिएन।",
  port: (port, node) => `${port} (${node})`,
  linkPort: (port) => `${port} बाट जोड्नुहोस्`,
  wiring: (from, count) => count === 1 ? `${from} बाट तार जोडिँदै छ। 1 पोर्टले यसलाई स्वीकार गर्छ। छान्न तीर कुञ्जीहरू, जोड्न Enter र रद्द गर्न Escape थिच्नुहोस्।` : `${from} बाट तार जोडिँदै छ। यसलाई स्वीकार गर्ने पोर्ट: ${count}। छान्न तीर कुञ्जीहरू, जोड्न Enter र रद्द गर्न Escape थिच्नुहोस्।`,
  target: (to, index, count) => `${to}, ${count} मध्ये ${index}।`,
  noTarget: "कुनै पनि पोर्टले यो तारलाई स्वीकार गर्दैन।",
  connected: (from, to) => `${from} र ${to} जोडियो।`,
  notConnected: "जोडिएन।"
};
export {
  ne_default as default
};
