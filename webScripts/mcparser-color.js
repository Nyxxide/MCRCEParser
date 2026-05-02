(function () {
    "use strict";

    const Core = window.MCParser.core;
    const Editor = window.MCParser.editor;

    const {
        state,
        el,
        clamp,
        hexToRgbObject,
        editorKeyToElement,
        normalizeBareHex,
        shadowDecimalToHexAndOpacity
    } = Core;

    function saveSelectionForEditor(editorKey) {
        const editor = editorKeyToElement(editorKey);
        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0) {
            state.colorModal.savedRange = null;
            return;
        }

        const range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) {
            state.colorModal.savedRange = null;
            return;
        }

        state.colorModal.savedRange = range.cloneRange();
        state.colorModal.editorKey = editorKey;
    }

    function restoreSavedSelection() {
        if (!state.colorModal.savedRange) return false;
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(state.colorModal.savedRange);
        return true;
    }

    function selectionTextForEditor(editorKey) {
        const editor = editorKeyToElement(editorKey);

        if (!state.colorModal.savedRange) return "";

        const cloned = state.colorModal.savedRange.cloneRange();
        if (!editor.contains(cloned.commonAncestorContainer)) return "";

        return cloned.toString();
    }

    function getSelectedTextStyleRuns(editorKey) {
        const editor = editorKeyToElement(editorKey);
        const saved = state.colorModal.savedRange;

        if (!saved || !editor.contains(saved.commonAncestorContainer)) {
            const typingStyle = Editor.getTypingStyle(editorKey);
            return [{
                text: "",
                style: Editor.cloneStyleState(typingStyle),
                meta: {}
            }];
        }

        if (saved.collapsed) {
            const typingStyle = Editor.getTypingStyle(editorKey);
            return [{
                text: "",
                style: Editor.cloneStyleState(typingStyle),
                meta: {}
            }];
        }

        const runs = [];
        const walker = document.createTreeWalker(
            editor,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (!node.nodeValue || node.nodeValue === Core.CARET_GUARD) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    try {
                        return saved.intersectsNode(node)
                            ? NodeFilter.FILTER_ACCEPT
                            : NodeFilter.FILTER_REJECT;
                    } catch (_err) {
                        return NodeFilter.FILTER_REJECT;
                    }
                }
            }
        );

        while (walker.nextNode()) {
            const node = walker.currentNode;
            let start = 0;
            let end = node.nodeValue.length;

            if (node === saved.startContainer) start = saved.startOffset;
            if (node === saved.endContainer) end = saved.endOffset;
            if (start >= end) continue;

            const text = node.nodeValue.slice(start, end);
            if (!text) continue;

            const parent = node.parentElement;

            runs.push({
                text,
                style: Editor.getNodeStyleState(node, editor),
                meta: {
                    colorGradientId: parent?.dataset?.colorGradientId || "",
                    colorGradientStops: parent?.dataset?.colorGradientStops || "",
                    shadowGradientId: parent?.dataset?.shadowGradientId || "",
                    shadowGradientStops: parent?.dataset?.shadowGradientStops || ""
                }
            });
        }

        return runs;
    }

    function compactStops(stops) {
        const out = [];

        stops.forEach((stop) => {
            const normalized = String(stop || "").toLowerCase();
            if (!normalized) return;
            if (out.length === 0 || out[out.length - 1] !== normalized) {
                out.push(normalized);
            }
        });

        const unique = Array.from(new Set(out));
        return unique.length === 1 ? [unique[0]] : out;
    }

    function getModalStopsFromSelection(editorKey) {
        const runs = getSelectedTextStyleRuns(editorKey);

        const colorGradientIds = new Set();
        const shadowGradientIds = new Set();
        let colorGradientStops = "";
        let shadowGradientStops = "";

        const textStops = [];
        const shadowStops = [];
        let shadowOpacity = null;

        runs.forEach((run) => {
            if (run.meta?.colorGradientId && run.meta?.colorGradientStops) {
                colorGradientIds.add(run.meta.colorGradientId);
                colorGradientStops = run.meta.colorGradientStops;
            }

            if (run.meta?.shadowGradientId && run.meta?.shadowGradientStops) {
                shadowGradientIds.add(run.meta.shadowGradientId);
                shadowGradientStops = run.meta.shadowGradientStops;
            }

            [...(run.text || "")].forEach((char) => {
                if (char === "\n") return;

                if (run.style.color) {
                    textStops.push(normalizeBareHex(run.style.color, "ffffff"));
                }

                if (
                    run.style.shadowColor !== null &&
                    run.style.shadowColor !== undefined &&
                    run.style.shadowColor !== ""
                ) {
                    const parsed = shadowDecimalToHexAndOpacity(run.style.shadowColor);
                    shadowStops.push(normalizeBareHex(parsed.hex, "000000"));

                    if (shadowOpacity === null) {
                        shadowOpacity = parsed.opacity;
                    }
                }
            });
        });

        const editorGradientTextStops =
            colorGradientIds.size === 1 && colorGradientStops
                ? colorGradientStops.split(",").map((s) => normalizeBareHex(s, "ffffff"))
                : null;

        const editorGradientShadowStops =
            shadowGradientIds.size === 1 && shadowGradientStops
                ? shadowGradientStops.split(",").map((s) => normalizeBareHex(s, "000000"))
                : null;

        const compactTextStops = compactStops(textStops);
        const compactShadowStops = compactStops(shadowStops);

        return {
            textStops: editorGradientTextStops || (compactTextStops.length ? compactTextStops : ["ffffff"]),
            shadowStops: editorGradientShadowStops || compactShadowStops,
            shadowOpacity: shadowOpacity === null ? 100 : shadowOpacity
        };
    }

    function setModalActiveTab(tab) {
        state.colorModal.activeTab = tab;

        const isText = tab === "text";
        el.textColorTabBtn.classList.toggle("active", isText);
        el.shadowColorTabBtn.classList.toggle("active", !isText);

        if (el.textColorTabPanel) {
            el.textColorTabPanel.classList.toggle("active", isText);
        }
        if (el.shadowColorTabPanel) {
            el.shadowColorTabPanel.classList.toggle("active", !isText);
        }
    }

    function renderGenericGradientStops(stops, container, onChange, fallback) {
        if (!container || !el.gradientStopTemplate) return;

        container.innerHTML = "";

        stops.forEach((stop, index) => {
            const fragment = el.gradientStopTemplate.content.cloneNode(true);
            const picker = fragment.querySelector(".gradient-color-picker");
            const hexInput = fragment.querySelector(".gradient-color-hex");
            const addBtn = fragment.querySelector(".gradient-add-btn");
            const removeBtn = fragment.querySelector(".gradient-remove-btn");

            const normalized = Core.normalizeBareHex(stop, fallback);
            picker.value = `#${normalized}`;
            hexInput.value = normalized;

            picker.addEventListener("input", () => {
                const value = picker.value.replace("#", "").toLowerCase();
                stops[index] = value;
                hexInput.value = value;
                onChange();
            });

            hexInput.addEventListener("input", () => {
                const value = Core.normalizeBareHex(hexInput.value, normalized);
                stops[index] = value;
                hexInput.value = value;
                picker.value = `#${value}`;
                onChange();
            });

            addBtn.addEventListener("click", () => {
                stops.splice(index + 1, 0, normalized);
                renderGenericGradientStops(stops, container, onChange, fallback);
                onChange();
            });

            removeBtn.addEventListener("click", () => {
                stops.splice(index, 1);
                renderGenericGradientStops(stops, container, onChange, fallback);
                onChange();
            });

            container.appendChild(fragment);
        });
    }

    function renderGradientStops(kind) {
        const isText = kind === "text";
        const container = isText
            ? el.textGradientStopsContainer
            : el.shadowGradientStopsContainer;
        const stops = isText
            ? state.colorModal.textStops
            : state.colorModal.shadowStops;
        const fallback = isText ? "ffffff" : "000000";

        renderGenericGradientStops(stops, container, updateColorModalSelectionPreview, fallback);
    }

    function updateColorModalSelectionPreview() {
        if (!el.colorModalSelectionPreview) return;

        const editorKey = state.colorModal.editorKey || Core.state.focusedEditorKey;
        const runs = getSelectedTextStyleRuns(editorKey);

        el.colorModalSelectionPreview.innerHTML = "";
        el.colorModalSelectionPreview.style.whiteSpace = "pre-wrap";

        const chars = [];

        runs.forEach((run) => {
            const sourceText = run.text || "No selection";
            [...sourceText].forEach((char) => {
                chars.push({
                    char,
                    style: Editor.cloneStyleState(run.style)
                });
            });
        });

        const hasShadow = state.colorModal.shadowStops.length > 0;
        const opacity =
            clamp(
                el.modalShadowOpacityInput?.value ?? state.colorModal.shadowOpacity,
                0,
                100
            ) / 100;

        chars.forEach((entry, index) => {
            if (entry.char === "\n") {
                el.colorModalSelectionPreview.appendChild(document.createElement("br"));
                return;
            }

            const span = document.createElement("span");
            span.textContent = entry.char;

            span.style.fontWeight = entry.style.bold ? "900" : "400";
            span.style.fontStyle = entry.style.italic ? "italic" : "normal";
            span.style.textDecoration = [
                entry.style.underlined ? "underline" : "",
                entry.style.strikethrough ? "line-through" : ""
            ].filter(Boolean).join(" ") || "none";

            if (state.colorModal.textStops.length) {
                span.style.color = `#${Editor.pickGradientColor(
                    state.colorModal.textStops,
                    index,
                    chars.length
                )}`;
            } else if (entry.style.color) {
                span.style.color = entry.style.color;
            } else {
                span.style.color = "";
            }

            if (hasShadow) {
                const shadowHex = `#${Editor.pickGradientColor(
                    state.colorModal.shadowStops,
                    index,
                    chars.length
                )}`;
                const shadowRgb = hexToRgbObject(shadowHex);
                span.style.textShadow =
                    `2px 2px 1px rgba(${shadowRgb.r}, ${shadowRgb.g}, ${shadowRgb.b}, ${opacity})`;
            } else if (entry.style.shadowColor !== null && entry.style.shadowColor !== undefined) {
                span.style.textShadow = Editor.getShadowCss(entry.style.shadowColor);
            } else {
                span.style.textShadow = "";
            }

            el.colorModalSelectionPreview.appendChild(span);
        });
    }

    function openColorModal(editorKey) {
        state.colorModal.editorKey = editorKey;
        saveSelectionForEditor(editorKey);

        const modalStops = getModalStopsFromSelection(editorKey);

        state.colorModal.textStops = modalStops.textStops;
        state.colorModal.shadowStops = modalStops.shadowStops;
        state.colorModal.shadowOpacity = modalStops.shadowOpacity;

        setModalActiveTab("text");
        renderGradientStops("text");
        renderGradientStops("shadow");

        if (el.modalShadowOpacityInput) {
            el.modalShadowOpacityInput.value = clamp(state.colorModal.shadowOpacity, 0, 100);
        }

        updateColorModalSelectionPreview();

        el.colorModalBackdrop.classList.remove("hidden");
        el.colorModalBackdrop.setAttribute("aria-hidden", "false");
    }

    function closeColorModal() {
        el.colorModalBackdrop.classList.add("hidden");
        el.colorModalBackdrop.setAttribute("aria-hidden", "true");
        state.colorModal.editorKey = null;
        state.colorModal.savedRange = null;
    }

    window.MCParser = window.MCParser || {};
    window.MCParser.color = {
        saveSelectionForEditor,
        restoreSavedSelection,
        selectionTextForEditor,
        getSelectedTextStyleRuns,
        getModalStopsFromSelection,
        setModalActiveTab,
        renderGenericGradientStops,
        renderGradientStops,
        updateColorModalSelectionPreview,
        openColorModal,
        closeColorModal
    };
})();