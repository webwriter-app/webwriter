import {SchemaPlugin} from ".";
import {HTMLElementSpec} from "../htmlelementspec";
import {Plugin} from "prosemirror-state";
import styles from "./ai.css";


export const aiPlugin = () => ({
    plugin: new Plugin({
        props: {
            handleKeyDown(view, event) {
                console.log("A key was pressed!")
                return false // We did not handle this
            }
        }
    }),
    styles: []
} as SchemaPlugin);