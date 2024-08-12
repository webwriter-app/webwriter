import { SchemaPlugin } from ".";
import { Plugin, PluginKey } from "prosemirror-state";
import { MarkSpec } from "prosemirror-model";
import { EditorView } from "prosemirror-view";

export const grammarPlugin = (): SchemaPlugin => {
  const grammarPluginKey = new PluginKey("grammar");
  let currentTooltip: HTMLElement | null = null;
  let activeView: EditorView | null = null;
  let activeRange: { from: number; to: number } | null = null;

  function showTooltip(
    view: EditorView,
    text: string,
    start: number,
    end: number
  ) {
    removeTooltip();

    const tooltip = document.createElement("div");
    tooltip.style.position = "absolute";
    tooltip.style.backgroundColor = "#030712";
    tooltip.style.color = "white";
    tooltip.style.padding = "3px";
    tooltip.style.paddingInline = "10px";
    tooltip.style.borderRadius = "5px";
    tooltip.style.zIndex = "1000";
    tooltip.style.cursor = "pointer";
    tooltip.style.display = "flex";
    tooltip.style.alignItems = "center";

    const textSpan = document.createElement("span");
    textSpan.textContent = text;
    textSpan.style.fontSize = "16px";
    textSpan.style.marginRight = "10px";
    tooltip.appendChild(textSpan);

    const dismissButton = document.createElement("span");
    dismissButton.textContent = "✕";
    dismissButton.style.cursor = "pointer";
    dismissButton.style.marginLeft = "auto";
    dismissButton.addEventListener("click", handleDismiss);
    tooltip.appendChild(dismissButton);

    textSpan.addEventListener("click", handleTooltipClick);

    document.body.appendChild(tooltip);

    const start_coords = view.coordsAtPos(start);
    const end_coords = view.coordsAtPos(end);

    const tooltipRect = tooltip.getBoundingClientRect();

    const centerX = (start_coords.left + end_coords.right) / 2;
    tooltip.style.left = `${centerX - tooltipRect.width / 2}px`;
    tooltip.style.top = `${start_coords.top + 15}px`;

    currentTooltip = tooltip;
    activeView = view;
    activeRange = { from: start, to: end };
  }

  function removeTooltip() {
    if (currentTooltip) {
      currentTooltip.removeEventListener("click", handleTooltipClick);
      document.body.removeChild(currentTooltip);
      currentTooltip = null;
    }
    activeView = null;
    activeRange = null;
  }

  function handleTooltipClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (activeView && activeRange && currentTooltip) {
      const { from, to } = activeRange;
      const correctedText =
        currentTooltip.querySelector("span")?.textContent || "";

      activeView.dispatch(
        activeView.state.tr
          .removeMark(from, to, activeView.state.schema.marks.grammar)
          .insertText(correctedText, from, to)
      );

      removeTooltip();
    }
  }

  function handleDismiss(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (activeView && activeRange) {
      const { from, to } = activeRange;

      activeView.dispatch(
        activeView.state.tr.removeMark(
          from,
          to,
          activeView.state.schema.marks.grammar
        )
      );

      removeTooltip();
    }
  }

  return {
    marks: {
      grammar: {
        parseDOM: [
          {
            tag: "gr",
            getAttrs: (node: HTMLElement) => ({
              corrected: node.getAttribute("corrected"),
            }),
          },
        ],
        toDOM: (node) => [
          "gr",
          {
            class: "grammar-mark",
            corrected: node.attrs.corrected,
          },
          0,
        ],
        attrs: {
          corrected: { default: null },
        },
        inclusive: false,
      } as MarkSpec,
    },
    plugin: new Plugin({
      key: grammarPluginKey,
      view(editorView) {
        const handleDocumentClick = (event: MouseEvent) => {
          const posInfo = editorView.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });

          if (!posInfo) {
            removeTooltip();
          }
        };

        document.addEventListener("click", handleDocumentClick);

        return {
          destroy() {
            document.removeEventListener("click", handleDocumentClick);
            removeTooltip();
          },
        };
      },
      props: {
        handleClick(view, pos, event) {
          const { state } = view;
          const { doc } = state;
          const range = doc.resolve(pos);

          const mark = range.marks().find((m) => m.type.name === "grammar");
          if (mark) {
            let start = pos,
              end = pos;
            doc.nodesBetween(0, doc.content.size, (node, nodeStart) => {
              if (
                node.isInline &&
                node.marks.some((m) => m.type.name === "grammar")
              ) {
                if (nodeStart <= pos && nodeStart + node.nodeSize > pos) {
                  start = nodeStart;
                  end = nodeStart + node.nodeSize;
                  return false;
                }
              }
              return true;
            });

            const correctedText =
              mark.attrs.corrected || "No correction available";
            showTooltip(view, correctedText, start, end);

            return true;
          }
          removeTooltip();
          return false;
        },
      },
    }),
  };
};
