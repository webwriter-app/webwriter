var te_default = {
  picked: (item) => `తీసుకున్నది: ${item}. స్థలాన్ని ఎంచుకోవడానికి బాణం కీలు, వదలడానికి Enter, రద్దు చేయడానికి Escape నొక్కండి.`,
  pickedLink: (item) => `కలుపుతున్నారు: ${item}. దేనితో కలపాలో ఎంచుకోవడానికి బాణం కీలు, కలపడానికి Enter, రద్దు చేయడానికి Escape నొక్కండి.`,
  selected: (item) => `ఎంచుకున్నది: ${item}. ఎక్కడ ఉంచాలో అక్కడ క్లిక్ చేయండి, లేదా రద్దు చేయడానికి దాన్ని మళ్లీ క్లిక్ చేయండి.`,
  nextTarget: "Tab నొక్కితే తదుపరి లక్ష్యానికి వెళ్తుంది.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}${position.count} లో స్థానం ${position.index}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}ఎడమ నుండి ${x}, పై నుండి ${y}`,
  dropped: (item, target) => target ? `${item} వదిలారు: ${target}.` : `${item} వదిలారు.`,
  copied: (item, target) => target ? `${item} జోడించారు: ${target}.` : `${item} జోడించారు.`,
  linked: (item, target) => `${item}, ${target} కలపబడ్డాయి.`,
  cancelled: () => "రద్దు చేయబడింది.",
  notAllowed: "రద్దు చేయబడింది. ఇక్కడ ఇది ఇకపై అనుమతించబడదు."
};
export {
  te_default as default
};
