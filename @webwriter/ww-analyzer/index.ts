import {LitElementWw} from "@webwriter/lit"
import {html} from "lit"
import {customElement, property} from "lit/decorators.js"
import XAPI, { Statement } from "@xapi/xapi"

export type ExperienceEvent = CustomEvent<Partial<Statement>>


function unscopePackageName(name: string) {
  return name.split(/\@.*\//).pop()
}

function prettifyPackageName(name: string, capitalizeFirstLetter=true) {
  const coreName = unscopePackageName(name.split("-").pop())
  return capitalizeFirstLetter? coreName.charAt(0).toUpperCase() + coreName.slice(1): coreName
}

@customElement("ww-analyzer")
export class WwAnalyzer extends LitElementWw {

  parentElement: HTMLElement;

  @property({attribute: true})
  LRSEndpoint: string

  @property({attribute: false})
  LRSUsername: string

  @property({attribute: false})
  LRSPassword: string

  connectedCallback(): void {
    this.parentElement.addEventListener("experience", (e: ExperienceEvent) => {
      
      const attrs = Object.fromEntries(this.parentElement.getAttributeNames().map(
        key => [key, this.parentElement.getAttribute(key)]
      ))
      const element = e.target as HTMLElement
      const name = prettifyPackageName(element.tagName.toLowerCase()) // scoped?
      const fallbackActor: Statement["actor"] = {
        
      }
      const fallbackVerb: Statement["verb"] = {
        id: "http://adlnet.gov/expapi/verbs/experienced",
        display: {"en-US": "experienced"}
      }
      const fallbackObject: Statement["object"] = {
        id: element.id,
        definition: {
          // @ts-ignore
          type: `https://www.npmjs.com/package/${name}`,
          moreInfo: `https://www.npmjs.com/package/${name}`,
          name: {"en-US": prettifyPackageName(name)}
        }
      }
      const statement: Statement = {
        actor: e.detail.actor ?? fallbackActor,
        verb: e.detail.verb ?? fallbackVerb,
        object: e.detail.object ?? fallbackObject
      }
      
      const auth = XAPI.toBasicAuth(this.LRSUsername, this.LRSPassword)
      const endpoint = this.LRSEndpoint
      const xapi = new XAPI({endpoint, auth})

      xapi.sendStatement({statement})
    })
  }
}