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
    correctedText: string,
    incorrectText: string,
    start: number,
    end: number
  ) {
    removeTooltip();

    const tooltip = document.createElement("div");
    tooltip.style.position = "absolute";
    tooltip.style.backgroundColor = "#030712";
    tooltip.style.color = "white";
    tooltip.style.padding = "3px";
    tooltip.style.paddingInline = "3px";
    tooltip.style.paddingLeft = "10px";
    tooltip.style.borderRadius = "5px";
    tooltip.style.zIndex = "1000";
    tooltip.style.display = "flex";
    tooltip.style.alignItems = "center";
    tooltip.style.pointerEvents = "auto";
    tooltip.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";

    // Add a pseudo-element for the peeking corner
    tooltip.style.position = "relative";
    tooltip.style.marginTop = "10px"; // Add some space for the corner

    const corner = document.createElement("div");
    corner.style.position = "absolute";
    corner.style.bottom = "-5px";
    corner.style.left = "50%";
    corner.style.width = "0";
    corner.style.height = "0";
    corner.style.borderLeft = "5px solid transparent";
    corner.style.borderRight = "5px solid transparent";
    corner.style.borderTop = "5px solid #030712";
    corner.style.transform = "translateX(-50%)";
    tooltip.appendChild(corner);

    const textSpan = document.createElement("span");
    if (correctedText) {
      textSpan.textContent = correctedText;
      textSpan.addEventListener("mouseover", () => {
        textSpan.style.color = "#4CAF50"; // Green color on hover
      });
    } else {
      textSpan.textContent = incorrectText;
      textSpan.style.textDecoration = "line-through";
      textSpan.addEventListener("mouseover", () => {
        textSpan.style.color = "#FF5722"; // Red color on hover
      });
    }
    textSpan.style.fontSize = "16px";
    textSpan.style.marginRight = "10px";
    textSpan.style.fontFamily = "sans-serif";
    textSpan.style.cursor = "pointer";
    textSpan.style.transition = "color 0.1s ease";

    textSpan.addEventListener("mouseout", () => {
      textSpan.style.color = "white";
    });
    textSpan.addEventListener("click", () =>
      handleCorrectionClick(correctedText)
    );
    tooltip.appendChild(textSpan);

    const dismissButton = document.createElement("span");
    dismissButton.textContent = "✕";
    dismissButton.style.cursor = "pointer";
    dismissButton.style.marginLeft = "auto";
    dismissButton.style.padding = "2px 6px";
    dismissButton.style.borderRadius = "3px";
    dismissButton.style.transition = "background-color 0.1s ease";
    dismissButton.addEventListener("mouseover", () => {
      dismissButton.style.backgroundColor = "#FF5722"; // Red color on hover
    });
    dismissButton.addEventListener("mouseout", () => {
      dismissButton.style.backgroundColor = "transparent";
    });
    dismissButton.addEventListener("click", handleDismiss);
    tooltip.appendChild(dismissButton);

    // Create a container for the tooltip that's a child of the editor
    const tooltipContainer = document.createElement("div");
    tooltipContainer.style.position = "absolute";
    tooltipContainer.style.top = "0";
    tooltipContainer.style.left = "0";
    tooltipContainer.style.height = "0";
    tooltipContainer.style.overflow = "visible";
    tooltipContainer.style.pointerEvents = "none"; // Allow clicks to pass through
    tooltipContainer.appendChild(tooltip);

    view.dom.parentNode?.appendChild(tooltipContainer);

    currentTooltip = tooltip;
    activeView = view;
    activeRange = { from: start, to: end };

    updateTooltipPosition();
  }

  function updateTooltipPosition() {
    if (!currentTooltip || !activeView || !activeRange) return;

    const { from, to } = activeRange;
    const start_coords = activeView.coordsAtPos(from);
    const end_coords = activeView.coordsAtPos(to);

    const tooltipRect = currentTooltip.getBoundingClientRect();
    const editorRect = activeView.dom.getBoundingClientRect();

    // Get computed margin or padding for the editor
    const computedStyle = window.getComputedStyle(activeView.dom);
    const editorLeftMargin = parseFloat(computedStyle.marginLeft) || 0;

    // Calculate the center of the marked text
    const centerX = (start_coords.left + end_coords.right) / 2;

    // Position the tooltip horizontally
    const leftPosition =
      centerX - tooltipRect.width / 2 - editorRect.left + editorLeftMargin;
    currentTooltip.style.left = `${Math.max(0, leftPosition)}px`;

    // Position the tooltip vertically
    const topPosition =
      start_coords.top - tooltipRect.height - 15 - editorRect.top;
    currentTooltip.style.top = `${Math.max(0, topPosition)}px`;

    // Ensure the tooltip doesn't go off-screen to the right
    const rightEdge = leftPosition + tooltipRect.width;
    if (rightEdge > editorRect.width) {
      currentTooltip.style.left = `${editorRect.width - tooltipRect.width}px`;
    }
  }

  function removeTooltip() {
    if (
      currentTooltip &&
      currentTooltip.parentNode &&
      currentTooltip.parentNode.parentNode
    ) {
      currentTooltip.removeEventListener("click", handleTooltipClick);
      currentTooltip.parentNode.parentNode.removeChild(
        currentTooltip.parentNode
      );
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

  function handleCorrectionClick(correctedText: string) {
    if (activeView && activeRange) {
      const { from, to } = activeRange;

      if (correctedText) {
        // If there's a correction, replace with the corrected text
        activeView.dispatch(
          activeView.state.tr
            .removeMark(from, to, activeView.state.schema.marks.grammar)
            .insertText(correctedText, from, to)
        );
      } else {
        // If there's no correction, just remove the marked text
        activeView.dispatch(
          activeView.state.tr
            .removeMark(from, to, activeView.state.schema.marks.grammar)
            .delete(from, to)
        );
      }

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

        const handleScroll = () => {
          updateTooltipPosition();
        };

        document.addEventListener("click", handleDocumentClick);
        editorView.dom.addEventListener("scroll", handleScroll);
        window.addEventListener("scroll", handleScroll);
        window.addEventListener("resize", handleScroll);

        return {
          destroy() {
            document.removeEventListener("click", handleDocumentClick);
            editorView.dom.removeEventListener("scroll", handleScroll);
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleScroll);
            removeTooltip();
          },
        };
      },
      props: {
        handleClick(view, pos, event) {
          const { state } = view;
          const { doc } = state;

          const range = doc.resolve(pos);
          let mark = range.marks().find((m) => m.type.name === "grammar");

          if (!mark) {
            // try positions before and after the click
            const rangeBefore = doc.resolve(Math.max(0, pos - 1));
            const rangeAfter = doc.resolve(Math.min(doc.content.size, pos + 1));

            mark = rangeBefore.marks().find((m) => m.type.name === "grammar");
            if (mark) {
              pos = Math.max(0, pos - 1);
            } else {
              mark = rangeAfter.marks().find((m) => m.type.name === "grammar");
              if (mark) {
                pos = Math.min(doc.content.size, pos + 1);
              }
            }
          }

          if (mark) {
            let start = pos,
              end = pos;
            let incorrectText = "";
            doc.nodesBetween(0, doc.content.size, (node, nodeStart) => {
              if (
                node.isInline &&
                node.marks.some((m) => m.type.name === "grammar")
              ) {
                if (nodeStart <= pos && nodeStart + node.nodeSize > pos) {
                  start = nodeStart;
                  end = nodeStart + node.nodeSize;
                  incorrectText = node.text || "";
                  return false;
                }
              }
              return true;
            });
            const correctedText = mark.attrs.corrected || "";
            showTooltip(view, correctedText, incorrectText, start, end);
            return true;
          }
          removeTooltip();
          return false;
        },
      },
    }),
  };
};
