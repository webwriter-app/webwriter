import { localized } from "@lit/localize";
import { SlTabPanel } from "@shoelace-style/shoelace";
import { css } from "lit";
import { customElement } from "lit/decorators.js";

@localized()
@customElement("ww-tab-panel")
export class TabPanel extends SlTabPanel {
	static get styles() {
		return [SlTabPanel.styles, css`

			:host([active]), :root, [part=base] {
				display: contents !important;
			}

			[part=base] {
				padding: 0;
			}

		`] as any
	}
}