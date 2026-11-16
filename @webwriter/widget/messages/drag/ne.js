var ne_default = {
  picked: (item) => `${item} उठाइयो। ठाउँ छान्न तीर कुञ्जीहरू, छोड्न Enter र रद्द गर्न Escape थिच्नुहोस्।`,
  pickedLink: (item) => `${item} जोड्दै। केसँग जोड्ने छान्न तीर कुञ्जीहरू, जोड्न Enter र रद्द गर्न Escape थिच्नुहोस्।`,
  selected: (item) => `${item} चयन गरियो। जहाँ राख्ने हो त्यहाँ क्लिक गर्नुहोस्, वा रद्द गर्न यसमा फेरि क्लिक गर्नुहोस्।`,
  nextTarget: "Tab थिचेपछि अर्को लक्ष्यमा जान्छ।",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}${position.count} मध्ये स्थान ${position.index}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}बायाँबाट ${x}, माथिबाट ${y}`,
  dropped: (item, target) => target ? `${item} छोडियो: ${target}।` : `${item} छोडियो।`,
  copied: (item, target) => target ? `${item} थपियो: ${target}।` : `${item} थपियो।`,
  linked: (item, target) => `${item} र ${target} जोडियो।`,
  cancelled: () => "रद्द गरियो।",
  notAllowed: "रद्द गरियो। यहाँ अब यसको अनुमति छैन।"
};
export {
  ne_default as default
};
