(function () {
    "use strict";

    const Core = window.MCParser.core;
    const {
        state,
        el,
        normalizeHexColor,
        hexAndOpacityToShadowDecimal,
        shadowDecimalToHexAndOpacity,
        clamp,
        editorKeyToElement,
        setError
    } = Core;

    function getDefaultStyleState() {
        return {
            bold: false,
            italic: false,
            underlined: false,
            strikethrough: false,
            color: null,
            shadowColor: null
        };
    }

    function cloneStyleState(style) {
        return {
            bold: !!style.bold,
            italic: !!style.italic,
            underlined: !!style.underlined,
            strikethrough: !!style.strikethrough,
            color: style.color || null,
            shadowColor: style.shadowColor || null
        };
    }

    function getTypingStyle(editorKey) {
        if (!state.typingStyle) {
            state.typingStyle = {};
        }

        if (!state.typingStyle[editorKey]) {
            state.typingStyle[editorKey] = getDefaultStyleState();
        }

        return state.typingStyle[editorKey];
    }

    function setTypingStyle(editorKey, style) {
        state.typingStyle[editorKey] = cloneStyleState(style);
    }

    function mergeElementDatasetStyle(baseStyle, element) {
        const style = cloneStyleState(baseStyle);
        if (!element || !element.dataset) return style;

        if (element.dataset.bold !== undefined) {
            style.bold = element.dataset.bold === "1";
        }

        if (element.dataset.italic !== undefined) {
            style.italic = element.dataset.italic === "1";
        }

        if (element.dataset.underlined !== undefined) {
            style.underlined = element.dataset.underlined === "1";
        }

        if (element.dataset.strikethrough !== undefined) {
            style.strikethrough = element.dataset.strikethrough === "1";
        }

        if (element.dataset.color !== undefined) {
            style.color = element.dataset.color || null;
        }

        if (element.dataset.shadowColor !== undefined) {
            style.shadowColor = element.dataset.shadowColor || null;
        }

        return style;
    }

    function getDeepTextNode(node, preferLast) {
        let current = node;

        while (current && current.nodeType === Node.ELEMENT_NODE && current.childNodes.length) {
            current = preferLast
                ? current.childNodes[current.childNodes.length - 1]
                : current.childNodes[0];
        }

        return current;
    }

    function getCaretStyle(editorKey) {
        const editor = editorKeyToElement(editorKey);
        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0) {
            return cloneStyleState(getTypingStyle(editorKey));
        }

        const range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) {
            return cloneStyleState(getTypingStyle(editorKey));
        }

        if (!range.collapsed) {
            return getNodeStyleState(range.startContainer, editor);
        }

        const container = range.startContainer;
        const offset = range.startOffset;

        if (container.nodeType === Node.TEXT_NODE) {
            return getNodeStyleState(container, editor);
        }

        if (container.nodeType === Node.ELEMENT_NODE) {
            const before = offset > 0 ? getDeepTextNode(container.childNodes[offset - 1], true) : null;
            if (before) return getNodeStyleState(before, editor);

            const after = offset < container.childNodes.length
                ? getDeepTextNode(container.childNodes[offset], false)
                : null;
            if (after) return getNodeStyleState(after, editor);
        }

        return cloneStyleState(getTypingStyle(editorKey));
    }

    function syncTypingStyleFromCaret(editorKey) {
        const style = getCaretStyle(editorKey);
        setTypingStyle(editorKey, style);
        return style;
    }

    function getShadowCss(shadowColorDecimal) {
        if (
            shadowColorDecimal === null ||
            shadowColorDecimal === undefined ||
            shadowColorDecimal === ""
        ) {
            return "";
        }

        const parsed = shadowDecimalToHexAndOpacity(shadowColorDecimal);
        const hex = parsed.hex.replace("#", "");
        const opacity = parsed.opacity / 100;
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);

        return `2px 2px 1px rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    function applyStyleToSpan(span, style) {
        span.dataset.bold = style.bold ? "1" : "0";
        span.dataset.italic = style.italic ? "1" : "0";
        span.dataset.underlined = style.underlined ? "1" : "0";
        span.dataset.strikethrough = style.strikethrough ? "1" : "0";

        if (style.color) {
            const normalized = normalizeHexColor(style.color, "#ffffff");
            span.dataset.color = normalized;
            span.style.color = normalized;
        } else {
            delete span.dataset.color;
            span.style.color = "";
        }

        if (
            style.shadowColor !== null &&
            style.shadowColor !== undefined &&
            style.shadowColor !== ""
        ) {
            span.dataset.shadowColor = String(style.shadowColor);
            span.style.textShadow = getShadowCss(style.shadowColor);
            const parsedShadow = shadowDecimalToHexAndOpacity(style.shadowColor);
            span.style.setProperty("--decoration-shadow-color", parsedShadow.hex);
            span.style.setProperty("--decoration-shadow-opacity", String(parsedShadow.opacity / 100));
        } else {
            delete span.dataset.shadowColor;
            span.style.textShadow = "";
            span.style.removeProperty("--decoration-shadow-color");
            span.style.removeProperty("--decoration-shadow-opacity");
        }

        span.style.fontWeight = style.bold ? "900" : "400";
        span.style.fontStyle = style.italic ? "italic" : "normal";

        span.style.textDecoration = "none";
        span.dataset.hasUnderline = style.underlined ? "1" : "0";
        span.dataset.hasStrike = style.strikethrough ? "1" : "0";
    }

    function createStyledSpan(text, style) {
        const span = document.createElement("span");
        applyStyleToSpan(span, style);
        span.textContent = text;
        return span;
    }

    function getElementInlineStyleState(element) {
        const style = getDefaultStyleState();
        if (!element || !element.dataset) return style;

        if (element.dataset.bold === "1") style.bold = true;
        if (element.dataset.italic === "1") style.italic = true;
        if (element.dataset.underlined === "1") style.underlined = true;
        if (element.dataset.strikethrough === "1") style.strikethrough = true;
        if (element.dataset.color) style.color = element.dataset.color;
        if (element.dataset.shadowColor !== undefined) {
            style.shadowColor = element.dataset.shadowColor;
        }

        return style;
    }

    function getNodeStyleState(node, editor) {
        let style = getDefaultStyleState();
        let chain = [];
        let current = node && node.nodeType === Node.TEXT_NODE ? node.parentNode : node;

        while (current && current !== editor && current !== document.body) {
            if (current.nodeType === Node.ELEMENT_NODE) {
                chain.push(current);
            }
            current = current.parentNode;
        }

        chain.reverse().forEach((element) => {
            style = mergeElementDatasetStyle(style, element);
        });

        return style;
    }

    function mergeStyleStates(a, b) {
        const out = cloneStyleState(a);

        if (b.bold) out.bold = true;
        if (b.italic) out.italic = true;
        if (b.underlined) out.underlined = true;
        if (b.strikethrough) out.strikethrough = true;
        if (b.color) out.color = b.color;
        if (
            b.shadowColor !== null &&
            b.shadowColor !== undefined &&
            b.shadowColor !== ""
        ) {
            out.shadowColor = b.shadowColor;
        }

        return out;
    }

    function selectionInsideEditor(editor) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return false;
        const range = selection.getRangeAt(0);
        const common = range.commonAncestorContainer;
        return editor.contains(common);
    }

    function normalizeEditor(editor) {
        editor.normalize();
    }

    function setEditorText(editor, text) {
        editor.innerHTML = "";
        editor.appendChild(document.createTextNode(text || ""));
    }

    function splitLinesFromEditor(editor) {
        const lines = editorDomToComponentLines(editor);
        return lines
            .map((line) => line.map((component) => component.text || "").join(""))
            .filter((line) => line.trim() !== "");
    }

    function mergePatchOntoStyle(style, patch) {
        const merged = cloneStyleState(style);

        if ("bold" in patch) merged.bold = patch.bold;
        if ("italic" in patch) merged.italic = patch.italic;
        if ("underlined" in patch) merged.underlined = patch.underlined;
        if ("strikethrough" in patch) merged.strikethrough = patch.strikethrough;
        if ("color" in patch) merged.color = patch.color;
        if ("shadowColor" in patch) merged.shadowColor = patch.shadowColor;

        return merged;
    }

    function rebuildFragmentWithPatchedStyle(node, inheritedStyle, patch) {
        const fragment = document.createDocumentFragment();

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.nodeValue || "";
            if (text) {
                const patchedStyle = mergePatchOntoStyle(inheritedStyle, patch);
                fragment.appendChild(createStyledSpan(text, patchedStyle));
            }
            return fragment;
        }

        if (node.nodeName === "BR") {
            fragment.appendChild(document.createElement("br"));
            return fragment;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return fragment;
        }

        const elementStyle = mergeElementDatasetStyle(inheritedStyle, node);

        Array.from(node.childNodes).forEach((child) => {
            fragment.appendChild(rebuildFragmentWithPatchedStyle(child, elementStyle, patch));
        });

        return fragment;
    }

    function getSavedRangeForEditor(editorKey) {
        if (state.colorModal.editorKey === editorKey && state.colorModal.savedRange) {
            return state.colorModal.savedRange;
        }
        if (state.atlasModal.editorKey === editorKey && state.atlasModal.savedRange) {
            return state.atlasModal.savedRange;
        }
        return null;
    }

    function restoreSavedSelection(editorKey) {
        const saved = getSavedRangeForEditor(editorKey);
        if (!saved) return false;

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(saved);
        return true;
    }

    function getSelectedTextSegments(editor, range) {
        const segments = [];

        const walker = document.createTreeWalker(
            editor,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (!node.nodeValue || node.nodeValue === Core.CARET_GUARD) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    try {
                        return range.intersectsNode(node)
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

            if (node === range.startContainer) start = range.startOffset;
            if (node === range.endContainer) end = range.endOffset;
            if (start >= end) continue;

            const text = node.nodeValue.slice(start, end);
            if (!text) continue;

            const parent = node.parentElement;

            segments.push({
                text,
                style: getNodeStyleState(node, editor),
                meta: {
                    colorGradientId: parent?.dataset?.colorGradientId || "",
                    colorGradientStops: parent?.dataset?.colorGradientStops || "",
                    shadowGradientId: parent?.dataset?.shadowGradientId || "",
                    shadowGradientStops: parent?.dataset?.shadowGradientStops || ""
                }
            });
        }

        return segments;
    }

    function buildFragmentFromStyledSegments(segments, patch) {
        const fragment = document.createDocumentFragment();

        segments.forEach((segment) => {
            const patchedStyle = mergePatchOntoStyle(segment.style, patch);

            [...segment.text].forEach((char) => {
                if (char === "\n") {
                    fragment.appendChild(document.createElement("br"));
                } else {
                    const span = createStyledSpan(char, patchedStyle);

                    if (!("color" in patch) && segment.meta?.colorGradientId) {
                        span.dataset.colorGradientId = segment.meta.colorGradientId;
                        span.dataset.colorGradientStops = segment.meta.colorGradientStops;
                    }

                    if (!("shadowColor" in patch) && segment.meta?.shadowGradientId) {
                        span.dataset.shadowGradientId = segment.meta.shadowGradientId;
                        span.dataset.shadowGradientStops = segment.meta.shadowGradientStops;
                    }

                    fragment.appendChild(span);
                }
            });
        });

        return fragment;
    }

    function applyStylePatchToSelection(editorKey, patch) {
        const editor = editorKeyToElement(editorKey);
        const saved = getSavedRangeForEditor(editorKey);

        if (!saved) {
            const style = cloneStyleState(getTypingStyle(editorKey));
            setTypingStyle(editorKey, mergePatchOntoStyle(style, patch));
            setError("");
            return;
        }

        restoreSavedSelection(editorKey);

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);

        if (range.collapsed) {
            const style = cloneStyleState(getTypingStyle(editorKey));
            setTypingStyle(editorKey, mergePatchOntoStyle(style, patch));
            setError("");
            return;
        }

        const segments = getSelectedTextSegments(editor, range);
        if (!segments.length) return;

        const fragment = buildFragmentFromStyledSegments(segments, patch);

        const startMarker = document.createTextNode("");
        const endMarker = document.createTextNode("");

        const wrapped = document.createDocumentFragment();
        wrapped.appendChild(startMarker);
        wrapped.appendChild(fragment);
        wrapped.appendChild(endMarker);

        range.deleteContents();
        range.insertNode(wrapped);

        const newRange = document.createRange();
        newRange.setStartAfter(startMarker);
        newRange.setEndBefore(endMarker);

        selection.removeAllRanges();
        selection.addRange(newRange);

        if (state.colorModal.editorKey === editorKey) {
            state.colorModal.savedRange = newRange.cloneRange();
        }

        if (state.atlasModal.editorKey === editorKey) {
            state.atlasModal.savedRange = newRange.cloneRange();
        }

        const typingStyle = cloneStyleState(getTypingStyle(editorKey));
        Object.keys(patch).forEach((key) => {
            typingStyle[key] = patch[key];
        });
        setTypingStyle(editorKey, typingStyle);

        startMarker.remove();
        endMarker.remove();

        normalizeEditor(editor);
        setError("");
    }

    function clearSelectionFormatting(editorKey) {
        const editor = editorKeyToElement(editorKey);
        const saved = getSavedRangeForEditor(editorKey);

        const clearPatch = {
            bold: false,
            italic: false,
            underlined: false,
            strikethrough: false,
            color: null,
            shadowColor: null
        };

        if (!saved || !editor.contains(saved.commonAncestorContainer) || saved.collapsed) {
            setTypingStyle(editorKey, getDefaultStyleState());
            setError("");
            return;
        }

        applyStylePatchToSelection(editorKey, clearPatch);
        setTypingStyle(editorKey, getDefaultStyleState());
        setError("");
    }

    function pickGradientColor(stops, index, totalChars) {
        const normalizedStops = (stops || []).map((stop) =>
            Core.normalizeBareHex(stop, "ffffff")
        );

        if (!normalizedStops.length) return "ffffff";
        if (normalizedStops.length === 1 || totalChars <= 1) return normalizedStops[0];

        const position = index / Math.max(totalChars - 1, 1);
        const scaled = position * (normalizedStops.length - 1);
        const leftIndex = Math.floor(scaled);
        const rightIndex = Math.min(normalizedStops.length - 1, leftIndex + 1);
        const blend = scaled - leftIndex;

        const left = Core.hexToRgbObject(`#${normalizedStops[leftIndex]}`);
        const right = Core.hexToRgbObject(`#${normalizedStops[rightIndex]}`);

        const r = Math.round(left.r + (right.r - left.r) * blend);
        const g = Math.round(left.g + (right.g - left.g) * blend);
        const b = Math.round(left.b + (right.b - left.b) * blend);

        return [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
    }

    function applyGradientToSelection(editorKey, textStops, shadowStops, shadowOpacity) {
        const editor = editorKeyToElement(editorKey);
        const saved = getSavedRangeForEditor(editorKey);
        const shadowOpacityClamped = clamp(shadowOpacity, 0, 100);

        const normalizedTextStops = (textStops || []).map((s) => Core.normalizeBareHex(s, "ffffff"));
        const normalizedShadowStops = (shadowStops || []).map((s) => Core.normalizeBareHex(s, "000000"));

        const textGradientId =
            normalizedTextStops.length > 1
                ? `textgrad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
                : "";

        const shadowGradientId =
            normalizedShadowStops.length > 1
                ? `shadowgrad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
                : "";

        if (!saved || !editor.contains(saved.commonAncestorContainer)) {
            const style = cloneStyleState(getTypingStyle(editorKey));

            if (normalizedTextStops.length) {
                style.color = `#${pickGradientColor(normalizedTextStops, 0, 1)}`;
            }

            if (normalizedShadowStops.length) {
                style.shadowColor = hexAndOpacityToShadowDecimal(
                    `#${pickGradientColor(normalizedShadowStops, 0, 1)}`,
                    shadowOpacityClamped
                );
            }

            setTypingStyle(editorKey, style);
            setError("");
            return;
        }

        restoreSavedSelection(editorKey);

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);

        if (range.collapsed) {
            const style = cloneStyleState(getTypingStyle(editorKey));

            if (normalizedTextStops.length) {
                style.color = `#${pickGradientColor(normalizedTextStops, 0, 1)}`;
            }

            if (normalizedShadowStops.length) {
                style.shadowColor = hexAndOpacityToShadowDecimal(
                    `#${pickGradientColor(normalizedShadowStops, 0, 1)}`,
                    shadowOpacityClamped
                );
            }

            setTypingStyle(editorKey, style);
            setError("");
            return;
        }

        const segments = getSelectedTextSegments(editor, range);
        if (!segments.length) return;

        const chars = [];
        segments.forEach((segment) => {
            [...segment.text].forEach((char) => {
                chars.push({
                    char,
                    style: cloneStyleState(segment.style)
                });
            });
        });

        const fragment = document.createDocumentFragment();

        chars.forEach((entry, index) => {
            const style = cloneStyleState(entry.style);

            if (normalizedTextStops.length) {
                style.color = `#${pickGradientColor(normalizedTextStops, index, chars.length)}`;
            }

            if (normalizedShadowStops.length) {
                style.shadowColor = hexAndOpacityToShadowDecimal(
                    `#${pickGradientColor(normalizedShadowStops, index, chars.length)}`,
                    shadowOpacityClamped
                );
            }

            if (entry.char === "\n") {
                fragment.appendChild(document.createElement("br"));
            } else {
                const span = createStyledSpan(entry.char, style);

                if (textGradientId) {
                    span.dataset.colorGradientId = textGradientId;
                    span.dataset.colorGradientStops = normalizedTextStops.join(",");
                }

                if (shadowGradientId) {
                    span.dataset.shadowGradientId = shadowGradientId;
                    span.dataset.shadowGradientStops = normalizedShadowStops.join(",");
                }

                fragment.appendChild(span);
            }
        });

        const startMarker = document.createTextNode("");
        const endMarker = document.createTextNode("");
        const wrapped = document.createDocumentFragment();

        wrapped.appendChild(startMarker);
        wrapped.appendChild(fragment);
        wrapped.appendChild(endMarker);

        range.deleteContents();
        range.insertNode(wrapped);

        const newRange = document.createRange();
        newRange.setStartAfter(startMarker);
        newRange.setEndBefore(endMarker);

        selection.removeAllRanges();
        selection.addRange(newRange);

        startMarker.remove();
        endMarker.remove();

        normalizeEditor(editor);

        if (selection.rangeCount > 0) {
            const liveRange = selection.getRangeAt(0).cloneRange();
            state.colorModal.editorKey = editorKey;
            state.colorModal.savedRange = liveRange.cloneRange();
            state.atlasModal.editorKey = editorKey;
            state.atlasModal.savedRange = liveRange.cloneRange();
        }

        setError("");
    }

    function selectionHasStyle(editorKey, key) {
        const editor = editorKeyToElement(editorKey);

        let saved = null;
        if (state.colorModal.editorKey === editorKey && state.colorModal.savedRange) {
            saved = state.colorModal.savedRange;
        } else if (state.atlasModal.editorKey === editorKey && state.atlasModal.savedRange) {
            saved = state.atlasModal.savedRange;
        }

        if (!saved || !editor.contains(saved.commonAncestorContainer)) {
            return !!getTypingStyle(editorKey)[key];
        }

        if (saved.collapsed) {
            return !!getTypingStyle(editorKey)[key];
        }

        const selectedTextNodes = [];
        const walker = document.createTreeWalker(
            editor,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (!node.nodeValue || !node.nodeValue.trim()) {
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
            selectedTextNodes.push(walker.currentNode);
        }

        if (!selectedTextNodes.length) return false;

        return selectedTextNodes.every((node) => {
            const style = getNodeStyleState(node, editor);
            return !!style[key];
        });
    }

    function insertTextWithTypingStyle(editorKey, text) {
        const editor = editorKeyToElement(editorKey);
        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0) return false;

        const range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) return false;

        const style = cloneStyleState(getTypingStyle(editorKey));
        const fragment = document.createDocumentFragment();
        let lastNode = null;

        [...text].forEach((char) => {
            if (char === "\n") {
                lastNode = document.createElement("br");
            } else {
                lastNode = createStyledSpan(char, style);
            }
            fragment.appendChild(lastNode);
        });

        range.deleteContents();
        range.insertNode(fragment);

        const newRange = document.createRange();

        if (lastNode) {
            newRange.setStartAfter(lastNode);
        } else {
            newRange.setStart(range.startContainer, range.startOffset);
        }

        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        state.colorModal.editorKey = editorKey;
        state.colorModal.savedRange = newRange.cloneRange();

        state.atlasModal.editorKey = editorKey;
        state.atlasModal.savedRange = newRange.cloneRange();

        normalizeEditor(editor);
        return true;
    }

    function bindEditorTypingBehavior(editorKey) {
        const editor = editorKeyToElement(editorKey);

        function saveCollapsedRangeFromCurrentSelection() {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;

            const range = selection.getRangeAt(0);
            if (!editor.contains(range.commonAncestorContainer)) return;

            if (state.colorModal.editorKey === editorKey) {
                state.colorModal.savedRange = range.cloneRange();
            }

            if (state.atlasModal.editorKey === editorKey) {
                state.atlasModal.savedRange = range.cloneRange();
            }
        }

        editor.addEventListener("mousedown", () => {
            state.focusedEditorKey = editorKey;
        });

        editor.addEventListener("mouseup", () => {
            state.focusedEditorKey = editorKey;
            syncTypingStyleFromCaret(editorKey);
            saveCollapsedRangeFromCurrentSelection();
        });

        editor.addEventListener("keyup", (e) => {
            const navKeys = new Set([
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown"
            ]);

            if (navKeys.has(e.key)) {
                syncTypingStyleFromCaret(editorKey);
                saveCollapsedRangeFromCurrentSelection();
            }
        });

        editor.addEventListener("focus", () => {
            state.focusedEditorKey = editorKey;
        });

        editor.addEventListener("beforeinput", (e) => {
            if (e.inputType === "insertText" && e.data) {
                e.preventDefault();
                insertTextWithTypingStyle(editorKey, e.data);
                return;
            }

            if (e.inputType === "insertParagraph") {
                e.preventDefault();
                insertTextWithTypingStyle(editorKey, "\n");
                return;
            }

            if (
                e.inputType === "deleteContentBackward" ||
                e.inputType === "deleteContentForward" ||
                e.inputType === "deleteWordBackward" ||
                e.inputType === "deleteWordForward"
            ) {
                setTimeout(() => {
                    syncTypingStyleFromCaret(editorKey);

                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        const currentRange = selection.getRangeAt(0);
                        if (editor.contains(currentRange.commonAncestorContainer)) {
                            state.colorModal.editorKey = editorKey;
                            state.colorModal.savedRange = currentRange.cloneRange();

                            state.atlasModal.editorKey = editorKey;
                            state.atlasModal.savedRange = currentRange.cloneRange();
                        }
                    }
                }, 0);
            }
        });
    }

    function toggleInlineStyle(editorKey, styleKey) {
        const editor = editorKeyToElement(editorKey);
        const saved = getSavedRangeForEditor(editorKey);

        const hasSelection =
            saved &&
            editor.contains(saved.commonAncestorContainer) &&
            !saved.collapsed;

        const currentOn = selectionHasStyle(editorKey, styleKey);
        const nextValue = !currentOn;

        const patch = {};
        patch[styleKey] = nextValue;

        if (hasSelection) {
            applyStylePatchToSelection(editorKey, patch);

            const typingStyle = cloneStyleState(getTypingStyle(editorKey));
            typingStyle[styleKey] = nextValue;
            setTypingStyle(editorKey, typingStyle);
        } else {
            const typingStyle = cloneStyleState(getTypingStyle(editorKey));
            typingStyle[styleKey] = nextValue;
            setTypingStyle(editorKey, typingStyle);
        }

        editor.focus();
        setError("");
    }

    function styleStatesEqual(a, b) {
        return (
            !!a.bold === !!b.bold &&
            !!a.italic === !!b.italic &&
            !!a.underlined === !!b.underlined &&
            !!a.strikethrough === !!b.strikethrough &&
            (a.color || null) === (b.color || null) &&
            (a.shadow_color ?? null) === (b.shadow_color ?? null) &&
            (a.sprite || null) === (b.sprite || null) &&
            (a.atlas || null) === (b.atlas || null)
        );
    }

    function buildTextComponentObject(text, style) {
        const obj = { text: text ?? "" };

        if (style.bold) obj.bold = true;
        obj.italic = !!style.italic;
        if (style.underlined) obj.underlined = true;
        if (style.strikethrough) obj.strikethrough = true;
        if (style.color) obj.color = normalizeHexColor(style.color, "#ffffff");
        if (
            style.shadowColor !== undefined &&
            style.shadowColor !== null &&
            style.shadowColor !== ""
        ) {
            obj.shadow_color = Number(style.shadowColor);
        }

        return obj;
    }

    function pushComponentToLine(line, text, style) {
        if (!text) return;

        const component = buildTextComponentObject(text, style);
        const last = line[line.length - 1];

        if (last && styleStatesEqual(last, component)) {
            last.text += text;
        } else {
            line.push(component);
        }
    }

    function traverseNodeToLines(node, lines, currentStyle) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = (node.nodeValue || "").replace(/\u200B/g, "");
            if (text) pushComponentToLine(lines[lines.length - 1], text, currentStyle);
            return;
        }

        if (node.nodeName === "BR") {
            lines.push([]);
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const element = node;

        if (element.dataset?.kind === "atlas") {
            lines[lines.length - 1].push({
                __editorType: "atlas",
                text: "",
                atlas: element.dataset.atlas || "",
                sprite: element.dataset.sprite || "",
                instance_id: element.dataset.instanceId || "",
                bold: element.dataset.bold === "1",
                italic: element.dataset.italic === "1",
                underlined: element.dataset.underlined === "1",
                strikethrough: element.dataset.strikethrough === "1",
                color: element.dataset.color || null,
                shadow_color:
                    element.dataset.shadowColor !== undefined
                        ? Number(element.dataset.shadowColor)
                        : undefined
            });
            return;
        }

        const tag = element.tagName;

        if (tag === "DIV" || tag === "P") {
            const beforeChildrenCount = lines.length;
            Array.from(element.childNodes).forEach((child) =>
                traverseNodeToLines(child, lines, currentStyle)
            );
            const isLastLineEmpty = lines[lines.length - 1].length === 0;
            if (!isLastLineEmpty || lines.length === beforeChildrenCount) {
                lines.push([]);
            }
            return;
        }

        const mergedStyle = mergeElementDatasetStyle(currentStyle, element);

        Array.from(element.childNodes).forEach((child) =>
            traverseNodeToLines(child, lines, mergedStyle)
        );
    }

    function editorDomToComponentLines(editor) {
        const lines = [[]];
        const baseStyle = getDefaultStyleState();

        Array.from(editor.childNodes).forEach((node) => {
            traverseNodeToLines(node, lines, baseStyle);
        });

        while (lines.length && lines[lines.length - 1].length === 0) {
            lines.pop();
        }

        return lines.length ? lines : [[]];
    }

    function linesToEditorDom(editor, lines) {
        editor.innerHTML = "";

        const AtlasParser = window.MCParser.atlasParser;

        lines.forEach((line, lineIndex) => {
            line.forEach((component) => {
                if (
                    component &&
                    (
                        component.__editorType === "atlas" ||
                        (typeof component.sprite === "string" &&
                            (component.text === "" || component.text === undefined))
                    )
                ) {
                    const atlasNode = AtlasParser.createAtlasInlineNode({
                        atlas: component.atlas || "",
                        sprite: component.sprite || "",
                        instance_id: component.instance_id || AtlasParser.createAtlasInstanceId(),
                        bold: !!component.bold,
                        italic: !!component.italic,
                        underlined: !!component.underlined,
                        strikethrough: !!component.strikethrough,
                        color: component.color || null,
                        shadow_color: component.shadow_color
                    });

                    editor.appendChild(Core.createCaretGuardNode());
                    editor.appendChild(atlasNode);
                    editor.appendChild(Core.createCaretGuardNode());
                    return;
                }

                const style = {
                    bold: !!component.bold,
                    italic: !!component.italic,
                    underlined: !!component.underlined,
                    strikethrough: !!component.strikethrough,
                    color: component.color || null,
                    shadowColor:
                        component.shadow_color !== undefined ? component.shadow_color : null
                };

                editor.appendChild(createStyledSpan(component.text || "", style));
            });

            if (lineIndex < lines.length - 1) {
                editor.appendChild(document.createElement("br"));
            }
        });
    }

    window.MCParser = window.MCParser || {};
    window.MCParser.editor = {
        getDefaultStyleState,
        cloneStyleState,
        getShadowCss,
        applyStyleToSpan,
        createStyledSpan,
        getElementInlineStyleState,
        getNodeStyleState,
        mergeStyleStates,
        selectionInsideEditor,
        normalizeEditor,
        setEditorText,
        splitLinesFromEditor,
        mergePatchOntoStyle,
        rebuildFragmentWithPatchedStyle,
        applyStylePatchToSelection,
        clearSelectionFormatting,
        pickGradientColor,
        applyGradientToSelection,
        selectionHasStyle,
        getTypingStyle,
        setTypingStyle,
        syncTypingStyleFromCaret,
        insertTextWithTypingStyle,
        bindEditorTypingBehavior,
        toggleInlineStyle,
        styleStatesEqual,
        buildTextComponentObject,
        pushComponentToLine,
        traverseNodeToLines,
        editorDomToComponentLines,
        linesToEditorDom
    };
})();