var am_default = {
  picked: (item) => `${item} ተነስቷል። ቦታ ለመምረጥ የቀስት ቁልፎችን ይጠቀሙ፣ ለመጣል Enter፣ ለመሰረዝ Escape ይጫኑ።`,
  pickedLink: (item) => `${item} በማገናኘት ላይ ነው። የሚገናኝበትን ለመምረጥ የቀስት ቁልፎችን ይጠቀሙ፣ ለማገናኘት Enter፣ ለመሰረዝ Escape ይጫኑ።`,
  selected: (item) => `${item} ተመርጧል። መሄድ ያለበት ቦታ ላይ ጠቅ ያድርጉ፣ ወይም ለመሰረዝ እንደገና ጠቅ ያድርጉት።`,
  nextTarget: "Tab ወደሚቀጥለው መድረሻ ይወስዳል።",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}ቦታ ${position.index} ከ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}ከግራ ${x}፣ ከላይ ${y}`,
  dropped: (item, target) => target ? `${item} በ${target} ላይ ተጥሏል።` : `${item} ተጥሏል።`,
  copied: (item, target) => target ? `${item} ወደ ${target} ተጨምሯል።` : `${item} ተጨምሯል።`,
  linked: (item, target) => `${item} ከ${target} ጋር ተገናኝቷል።`,
  cancelled: () => "ተሰርዟል።",
  notAllowed: "ተሰርዟል። ይህ እዚህ ከአሁን በኋላ አይፈቀድም።"
};
export {
  am_default as default
};
