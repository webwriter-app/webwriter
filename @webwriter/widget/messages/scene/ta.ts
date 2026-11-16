import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "தேர்வு நீக்கப்பட்டது." : count === 1 ? "1 உருப்படி தேர்ந்தெடுக்கப்பட்டது." : `தேர்ந்தெடுக்கப்பட்ட உருப்படிகள்: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "நகர்த்தப்பட்டது." : `நகர்த்தப்பட்ட உருப்படிகள்: ${count}.`),
  notMoved: "நகர்த்தப்படவில்லை.",
  port: (port, node) => `${port} (${node})`,
  linkPort: port => `${port} இலிருந்து இணைக்கவும்`,
  wiring: (from, count) => (count === 1 ? `${from} இலிருந்து கம்பி இணைக்கப்படுகிறது. 1 போர்ட் இதை ஏற்கிறது. தேர்ந்தெடுக்க அம்புக்குறி விசைகளையும், இணைக்க Enter-ஐயும், ரத்துசெய்ய Escape-ஐயும் அழுத்தவும்.` : `${from} இலிருந்து கம்பி இணைக்கப்படுகிறது. இதை ஏற்கும் போர்ட்கள்: ${count}. தேர்ந்தெடுக்க அம்புக்குறி விசைகளையும், இணைக்க Enter-ஐயும், ரத்துசெய்ய Escape-ஐயும் அழுத்தவும்.`),
  target: (to, index, count) => `${to}, ${count} இல் ${index}.`,
  noTarget: "எந்தப் போர்ட்டும் இந்தக் கம்பியை ஏற்காது.",
  connected: (from, to) => `${from} மற்றும் ${to} இணைக்கப்பட்டன.`,
  notConnected: "இணைக்கப்படவில்லை.",
} satisfies Catalog<SceneMessages>
