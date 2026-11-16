import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "ಆಯ್ಕೆಯನ್ನು ತೆರವುಗೊಳಿಸಲಾಗಿದೆ." : count === 1 ? "1 ಐಟಂ ಆಯ್ಕೆ ಮಾಡಲಾಗಿದೆ." : `ಆಯ್ಕೆ ಮಾಡಿದ ಐಟಂಗಳು: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "ಸರಿಸಲಾಗಿದೆ." : `ಸರಿಸಿದ ಐಟಂಗಳು: ${count}.`),
  notMoved: "ಸರಿಸಿಲ್ಲ.",
  port: (port, node) => `${port} (${node})`,
  linkPort: port => `${port} ನಿಂದ ಸಂಪರ್ಕಿಸಿ`,
  wiring: (from, count) => (count === 1 ? `${from} ನಿಂದ ತಂತಿ ಜೋಡಿಸಲಾಗುತ್ತಿದೆ. 1 ಪೋರ್ಟ್ ಇದನ್ನು ಸ್ವೀಕರಿಸುತ್ತದೆ. ಆಯ್ಕೆ ಮಾಡಲು ಬಾಣದ ಕೀಲಿಗಳು, ಸಂಪರ್ಕಿಸಲು Enter, ರದ್ದುಗೊಳಿಸಲು Escape ಒತ್ತಿರಿ.` : `${from} ನಿಂದ ತಂತಿ ಜೋಡಿಸಲಾಗುತ್ತಿದೆ. ಇದನ್ನು ಸ್ವೀಕರಿಸುವ ಪೋರ್ಟ್‌ಗಳು: ${count}. ಆಯ್ಕೆ ಮಾಡಲು ಬಾಣದ ಕೀಲಿಗಳು, ಸಂಪರ್ಕಿಸಲು Enter, ರದ್ದುಗೊಳಿಸಲು Escape ಒತ್ತಿರಿ.`),
  target: (to, index, count) => `${to}, ${count} ರಲ್ಲಿ ${index}.`,
  noTarget: "ಯಾವ ಪೋರ್ಟ್ ಕೂಡ ಈ ತಂತಿಯನ್ನು ಸ್ವೀಕರಿಸುವುದಿಲ್ಲ.",
  connected: (from, to) => `${from} ಮತ್ತು ${to} ಸಂಪರ್ಕಿಸಲಾಗಿದೆ.`,
  notConnected: "ಸಂಪರ್ಕಿಸಿಲ್ಲ.",
} satisfies Catalog<SceneMessages>
