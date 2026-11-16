import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} ඔසවන ලදී. ස්ථානයක් තේරීමට ඊතල යතුරු, දැමීමට Enter, අවලංගු කිරීමට Escape ඔබන්න.`,
  pickedLink: item => `${item} සම්බන්ධ කරමින්. කුමකට සම්බන්ධ කළ යුතු දැයි තේරීමට ඊතල යතුරු, සම්බන්ධ කිරීමට Enter, අවලංගු කිරීමට Escape ඔබන්න.`,
  selected: item => `${item} තෝරන ලදී. තැබිය යුතු තැන ක්ලික් කරන්න, නැතහොත් අවලංගු කිරීමට එය නැවත ක්ලික් කරන්න.`,
  nextTarget: "Tab ඔබන විට ඊළඟ ඉලක්කයට යයි.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.count} න් ස්ථානය ${position.index}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}වමේ සිට ${x}, ඉහළ සිට ${y}`,
  dropped: (item, target) => (target ? `${item} දමන ලදී: ${target}.` : `${item} දමන ලදී.`),
  copied: (item, target) => (target ? `${item} එක් කරන ලදී: ${target}.` : `${item} එක් කරන ලදී.`),
  linked: (item, target) => `${item} සහ ${target} සම්බන්ධ කරන ලදී.`,
  cancelled: () => "අවලංගු කරන ලදී.",
  notAllowed: "අවලංගු කරන ලදී. මෙහි මෙය තවදුරටත් අවසර නැත.",
} satisfies Catalog<DragMessages>
