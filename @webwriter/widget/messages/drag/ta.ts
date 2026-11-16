import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `எடுக்கப்பட்டது: ${item}. இடத்தைத் தேர்ந்தெடுக்க அம்புக்குறி விசைகளையும், விட Enter-ஐயும், ரத்துசெய்ய Escape-ஐயும் அழுத்தவும்.`,
  pickedLink: item => `இணைக்கப்படுகிறது: ${item}. எதனுடன் இணைப்பது என்பதைத் தேர்ந்தெடுக்க அம்புக்குறி விசைகளையும், இணைக்க Enter-ஐயும், ரத்துசெய்ய Escape-ஐயும் அழுத்தவும்.`,
  selected: item => `தேர்ந்தெடுக்கப்பட்டது: ${item}. எங்கே வைக்க வேண்டுமோ அங்கே கிளிக் செய்யவும், அல்லது ரத்துசெய்ய அதை மீண்டும் கிளிக் செய்யவும்.`,
  nextTarget: "Tab அழுத்தினால் அடுத்த இலக்குக்குச் செல்லும்.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.count} இல் நிலை ${position.index}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}இடமிருந்து ${x}, மேலிருந்து ${y}`,
  dropped: (item, target) => (target ? `விடப்பட்டது: ${item}, இடம்: ${target}.` : `விடப்பட்டது: ${item}.`),
  copied: (item, target) => (target ? `சேர்க்கப்பட்டது: ${item}, இடம்: ${target}.` : `சேர்க்கப்பட்டது: ${item}.`),
  linked: (item, target) => `${item} மற்றும் ${target} இணைக்கப்பட்டன.`,
  cancelled: () => "ரத்துசெய்யப்பட்டது.",
  notAllowed: "ரத்துசெய்யப்பட்டது. இங்கே இது இனி அனுமதிக்கப்படாது.",
} satisfies Catalog<DragMessages>
