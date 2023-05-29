import { LitElement, css, html } from 'lit';
import {property} from "lit/decorators.js"

export const tagName = 'ww-impressum';

export type Props = {
  address: string
}


const name = "Frederic Salmen"
const address = "Ahornstr. 55, 52074 Aachen"
const email = "contact@webwriter.app"
const phone = "+49 241 80 21967"


let IMPRESSUM_TEXT = () => html`
<div id="text">
<h1>Legal Notice</h1>

<div>
<u>Responsible:</u><br>
${name}<br>
${address}<br>
Email: ${email}<br>
Phone: ${phone}<br>
</div>

<p>Online Dispute Resolution: <a href="https://ec.europa.eu/consumers/odr">https://ec.europa.eu/consumers/odr</a></p>

<p>This Legal Notice complies with the German laws under § 5 TMG and § 55 RStV.</p>
 

<h2>Liability for Content</h2>

<p>The contents of our website have been created with the greatest possible care. However, we cannot guarantee the contents' accuracy, completeness, or topicality. According to Section 7, paragraph 1 of the TMG (Telemediengesetz - German Telemedia Act), we as service providers are liable for our content on these pages by general laws. However, according to Sections 8 to 10 of the TMG, we service providers are not obliged to monitor external information transmitted or stored or investigate circumstances pointing to illegal activity. Obligations to remove or block the use of information under general laws remain unaffected. However, a liability in this regard is only possible from the moment of knowledge of a specific infringement. Upon notification of such violations, we will remove the content immediately.</p>

<h2>Liability for Links</h2>

<p>Our website contains links to external websites, over whose contents we have no control. Therefore, we cannot accept any liability for these external contents. The respective provider or operator of the websites is always responsible for the contents of the linked pages. The linked pages were checked for possible legal violations at the time of linking. Illegal contents were not identified at the time of linking. However, permanent monitoring of the contents of the linked pages is not reasonable without specific indications of a violation. Upon notification of violations, we will remove such links immediately.</p>

<h2>Copyright</h2>

<p>The contents and works on these pages created by the site operator are subject to German copyright law. The duplication, processing, distribution, and any kind of utilization outside the limits of copyright require the written consent of the respective author or creator. Downloads and copies of these pages are only permitted for private, non-commercial use. In so far as the contents on this site were not created by the operator, the copyrights of third parties are respected. In particular, third-party content is marked as such. Should you become aware of a copyright infringement, please inform us accordingly. Upon notification of violations, we will remove such contents immediately.</p>

<i>Last Updated: May 29, 2023</i> 
</div>
`


export class Impressum extends LitElement {


  renderRoot: HTMLElement | ShadowRoot = this

	render() {
		return IMPRESSUM_TEXT()
	}
}

customElements.define(tagName, Impressum);