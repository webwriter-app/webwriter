import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `Poimittu: ${item}. Valitse paikka nuolinäppäimillä, pudota Enter-näppäimellä, peruuta Escape-näppäimellä.`,
  pickedLink: item => `Yhdistetään: ${item}. Valitse nuolinäppäimillä, mihin yhdistetään, yhdistä Enter-näppäimellä, peruuta Escape-näppäimellä.`,
  selected: item => `Valittu: ${item}. Napsauta kohtaa, johon se kuuluu, tai peruuta napsauttamalla uudelleen.`,
  nextTarget: "Sarkain-näppäin siirtää seuraavaan kohteeseen.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}paikka ${position.index}, yhteensä ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} vasemmalta, ${y} ylhäältä`,
  dropped: (item, target) => (target ? `Pudotettu: ${item}, kohde: ${target}.` : `Pudotettu: ${item}.`),
  copied: (item, target) => (target ? `Lisätty: ${item}, kohde: ${target}.` : `Lisätty: ${item}.`),
  linked: (item, target) => `Yhdistetty: ${item} ja ${target}.`,
  cancelled: () => "Peruttu.",
  notAllowed: "Peruttu. Tämä ei ole enää sallittua täällä.",
} satisfies Catalog<DragMessages>
