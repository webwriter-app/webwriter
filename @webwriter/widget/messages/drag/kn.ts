import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `ಎತ್ತಿಕೊಂಡದ್ದು: ${item}. ಸ್ಥಳವನ್ನು ಆಯ್ಕೆ ಮಾಡಲು ಬಾಣದ ಕೀಲಿಗಳು, ಬಿಡಲು Enter, ರದ್ದುಗೊಳಿಸಲು Escape ಒತ್ತಿರಿ.`,
  pickedLink: item => `ಜೋಡಿಸಲಾಗುತ್ತಿದೆ: ${item}. ಯಾವುದಕ್ಕೆ ಜೋಡಿಸಬೇಕೆಂದು ಆಯ್ಕೆ ಮಾಡಲು ಬಾಣದ ಕೀಲಿಗಳು, ಜೋಡಿಸಲು Enter, ರದ್ದುಗೊಳಿಸಲು Escape ಒತ್ತಿರಿ.`,
  selected: item => `ಆಯ್ಕೆ ಮಾಡಿದ್ದು: ${item}. ಎಲ್ಲಿ ಇಡಬೇಕೋ ಅಲ್ಲಿ ಕ್ಲಿಕ್ ಮಾಡಿ, ಅಥವಾ ರದ್ದುಗೊಳಿಸಲು ಅದನ್ನು ಮತ್ತೆ ಕ್ಲಿಕ್ ಮಾಡಿ.`,
  nextTarget: "Tab ಒತ್ತಿದರೆ ಮುಂದಿನ ಗುರಿಗೆ ಹೋಗುತ್ತದೆ.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.count} ರಲ್ಲಿ ಸ್ಥಾನ ${position.index}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}ಎಡದಿಂದ ${x}, ಮೇಲಿನಿಂದ ${y}`,
  dropped: (item, target) => (target ? `${item} ಬಿಡಲಾಗಿದೆ: ${target}.` : `${item} ಬಿಡಲಾಗಿದೆ.`),
  copied: (item, target) => (target ? `${item} ಸೇರಿಸಲಾಗಿದೆ: ${target}.` : `${item} ಸೇರಿಸಲಾಗಿದೆ.`),
  linked: (item, target) => `${item} ಮತ್ತು ${target} ಜೋಡಿಸಲಾಗಿದೆ.`,
  cancelled: () => "ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.",
  notAllowed: "ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ. ಇಲ್ಲಿ ಇದಕ್ಕೆ ಇನ್ನು ಅನುಮತಿ ಇಲ್ಲ.",
} satisfies Catalog<DragMessages>
