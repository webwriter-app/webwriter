var hi_default = {
  picked: (item) => `${item} उठाया गया। स्थान चुनने के लिए तीर कुंजियाँ, छोड़ने के लिए Enter और रद्द करने के लिए Escape दबाएँ।`,
  pickedLink: (item) => `${item} को जोड़ा जा रहा है। किससे जोड़ना है, यह चुनने के लिए तीर कुंजियाँ, जोड़ने के लिए Enter और रद्द करने के लिए Escape दबाएँ।`,
  selected: (item) => `${item} चुना गया। जहाँ रखना है वहाँ क्लिक करें, या रद्द करने के लिए उस पर दोबारा क्लिक करें।`,
  nextTarget: "Tab दबाने पर अगले लक्ष्य पर जाते हैं।",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}${position.count} में से स्थान ${position.index}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}बाएँ से ${x}, ऊपर से ${y}`,
  dropped: (item, target) => target ? `${item} को ${target} पर छोड़ा गया।` : `${item} को छोड़ा गया।`,
  copied: (item, target) => target ? `${item} को ${target} में जोड़ा गया।` : `${item} को जोड़ा गया।`,
  linked: (item, target) => `${item} को ${target} से जोड़ा गया।`,
  cancelled: () => "रद्द किया गया।",
  notAllowed: "रद्द किया गया। यहाँ अब इसकी अनुमति नहीं है।"
};
export {
  hi_default as default
};
