var pa_default = {
  picked: (item) => `${item} ਚੁੱਕਿਆ ਗਿਆ। ਥਾਂ ਚੁਣਨ ਲਈ ਤੀਰ ਕੁੰਜੀਆਂ, ਛੱਡਣ ਲਈ Enter ਅਤੇ ਰੱਦ ਕਰਨ ਲਈ Escape ਦਬਾਓ।`,
  pickedLink: (item) => `${item} ਨੂੰ ਜੋੜਿਆ ਜਾ ਰਿਹਾ ਹੈ। ਕਿਸ ਨਾਲ ਜੋੜਨਾ ਹੈ ਇਹ ਚੁਣਨ ਲਈ ਤੀਰ ਕੁੰਜੀਆਂ, ਜੋੜਨ ਲਈ Enter ਅਤੇ ਰੱਦ ਕਰਨ ਲਈ Escape ਦਬਾਓ।`,
  selected: (item) => `${item} ਚੁਣਿਆ ਗਿਆ। ਜਿੱਥੇ ਰੱਖਣਾ ਹੈ ਉੱਥੇ ਕਲਿੱਕ ਕਰੋ, ਜਾਂ ਰੱਦ ਕਰਨ ਲਈ ਇਸ 'ਤੇ ਦੁਬਾਰਾ ਕਲਿੱਕ ਕਰੋ।`,
  nextTarget: "Tab ਨਾਲ ਅਗਲੇ ਟੀਚੇ 'ਤੇ ਜਾਇਆ ਜਾਂਦਾ ਹੈ।",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}${position.count} ਵਿੱਚੋਂ ਸਥਿਤੀ ${position.index}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}ਖੱਬੇ ਤੋਂ ${x}, ਉੱਪਰੋਂ ${y}`,
  dropped: (item, target) => target ? `${item} ਛੱਡਿਆ ਗਿਆ: ${target}।` : `${item} ਛੱਡਿਆ ਗਿਆ।`,
  copied: (item, target) => target ? `${item} ਜੋੜਿਆ ਗਿਆ: ${target}।` : `${item} ਜੋੜਿਆ ਗਿਆ।`,
  linked: (item, target) => `${item} ਅਤੇ ${target} ਜੋੜੇ ਗਏ।`,
  cancelled: () => "ਰੱਦ ਕੀਤਾ ਗਿਆ।",
  notAllowed: "ਰੱਦ ਕੀਤਾ ਗਿਆ। ਇੱਥੇ ਹੁਣ ਇਸ ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ ਹੈ।"
};
export {
  pa_default as default
};
