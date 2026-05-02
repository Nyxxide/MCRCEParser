(function () {
    "use strict";

    const Core = window.MCParser.core;
    const Editor = window.MCParser.editor;
    const Color = window.MCParser.color;

    const {
        state,
        el,
        ATLAS_DATA_SAFE,
        clamp,
        normalizeHexColor,
        normalizeBareHex,
        hexAndOpacityToShadowDecimal,
        shadowDecimalToHexAndOpacity,
        splitTopLevel,
        findMatching,
        extractFieldValueFlexible,
        normalizeTopLevelEntries,
        maybeWrapAtNamedPlayer,
        maybeUnwrapNamedPlayer,
        createCaretGuardNode,
        isCaretGuardNode,
        ensureCaretGuardsAroundAtlas,
        removeAdjacentCaretGuards,
        hexToRgbObject,
        editorKeyToElement,
        mcEscapeString,
        mcUnescapeString,
        setError
    } = Core;

    const atlasSpriteRenderCache = new Map();
    let atlasSourceImage = null;
    let atlasSourceImagePromise = null;

    function saveSelectionForEditor(editorKey) {
        const editor = editorKeyToElement(editorKey);
        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0) {
            state.atlasModal.savedRange = null;
            return;
        }

        const range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) {
            state.atlasModal.savedRange = null;
            return;
        }

        state.atlasModal.savedRange = range.cloneRange();
        state.atlasModal.editorKey = editorKey;
    }

    function restoreSavedSelection() {
        if (!state.atlasModal.savedRange) return false;
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(state.atlasModal.savedRange);
        return true;
    }

    function getAtlasImageUrl() {
        const candidates = [
            window.ATLAS_IMAGE_URL,
            window.ATLAS_SHEET_URL,
            window.ATLAS_TEXTURE_URL,
            document.documentElement.dataset.atlasImage,
            document.body?.dataset?.atlasImage
        ].filter(Boolean);

        return candidates[0] || "";
    }

    function getAllAtlasGroups() {
        const fromData = new Set();

        ATLAS_DATA_SAFE.forEach((entry) => {
            if (entry && entry.atlas) fromData.add(entry.atlas);
        });

        const groups = Array.from(fromData).sort((a, b) => a.localeCompare(b));

        if (groups.includes("minecraft:blocks")) {
            return ["minecraft:blocks", ...groups.filter((g) => g !== "minecraft:blocks")];
        }

        return groups;
    }

    function getDefaultAtlasGroup() {
        const groups = getAllAtlasGroups();
        if (groups.includes("minecraft:blocks")) return "minecraft:blocks";
        return groups[0] || "";
    }

    function findAtlasEntry(atlas, sprite) {
        if (!sprite) return null;

        const atlasGroup = atlas || "minecraft:blocks";

        if (typeof window.getAtlasEntry === "function") {
            const exact = window.getAtlasEntry(atlasGroup, sprite);
            if (exact) return exact;
        }

        const localExact = ATLAS_DATA_SAFE.find(
            (e) => e.atlas === atlasGroup && e.sprite === sprite
        );
        if (localExact) return localExact;

        return ATLAS_DATA_SAFE.find((e) => e.sprite === sprite) || null;
    }

    function getFilteredAtlasEntries(group, query) {
        const g = group || getDefaultAtlasGroup();
        const q = String(query || "").trim().toLowerCase();
        const base = ATLAS_DATA_SAFE.filter((entry) => entry.atlas === g);

        if (!q) return base;
        return base.filter((entry) =>
            String(entry.sprite || "").toLowerCase().includes(q)
        );
    }

    function loadAtlasSourceImage() {
        const imageUrl = getAtlasImageUrl();
        if (!imageUrl) return Promise.resolve(null);

        if (atlasSourceImage && atlasSourceImage.src === imageUrl && atlasSourceImage.complete) {
            return Promise.resolve(atlasSourceImage);
        }

        if (atlasSourceImagePromise) return atlasSourceImagePromise;

        atlasSourceImagePromise = new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                atlasSourceImage = img;
                atlasSourceImagePromise = null;
                resolve(img);
            };

            img.onerror = (err) => {
                atlasSourceImagePromise = null;
                reject(err);
            };

            img.src = imageUrl;
        });

        return atlasSourceImagePromise;
    }

    function recolorSpriteImageData(imageData, tintHex = null, alphaMultiplier = 1, darkenMultiplier = 1) {
        const data = imageData.data;

        const normalizedTint =
            tintHex && normalizeHexColor(tintHex, "#ffffff").toLowerCase();

        const hasTint = !!normalizedTint;

        let tint = null;
        let grayscaleBrightness = null;

        if (hasTint) {
            tint = hexToRgbObject(normalizedTint);

            const maxChannel = Math.max(tint.r, tint.g, tint.b);
            const minChannel = Math.min(tint.r, tint.g, tint.b);
            const grayscaleTolerance = 12;
            const isNearGrayscale = (maxChannel - minChannel) <= grayscaleTolerance;

            if (isNearGrayscale) {
                grayscaleBrightness = (tint.r + tint.g + tint.b) / (3 * 255);
                tint = null;
            }
        }

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];
            const a = data[i + 3];

            if (a === 0) continue;

            if (grayscaleBrightness !== null) {
                r = Math.round(r * grayscaleBrightness);
                g = Math.round(g * grayscaleBrightness);
                b = Math.round(b * grayscaleBrightness);
            } else if (tint) {
                const intensity = Math.max(r, g, b) / 255;
                r = Math.round(tint.r * intensity);
                g = Math.round(tint.g * intensity);
                b = Math.round(tint.b * intensity);
            }

            if (darkenMultiplier !== 1) {
                r = Math.round(r * darkenMultiplier);
                g = Math.round(g * darkenMultiplier);
                b = Math.round(b * darkenMultiplier);
            }

            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));

            if (alphaMultiplier !== 1) {
                data[i + 3] = Math.round(a * alphaMultiplier);
            }
        }

        return imageData;
    }

    function buildRenderedSpriteDataUrl(entry, sizePx, tintHex = null, alphaMultiplier = 1, darkenMultiplier = 1) {
        const cacheKey = [
            entry.atlas,
            entry.sprite,
            entry.x,
            entry.y,
            entry.size || 16,
            sizePx,
            tintHex || "",
            alphaMultiplier,
            darkenMultiplier
        ].join("|");

        if (atlasSpriteRenderCache.has(cacheKey)) {
            return Promise.resolve(atlasSpriteRenderCache.get(cacheKey));
        }

        return loadAtlasSourceImage().then((img) => {
            if (!img || !entry) return "";

            const spriteSize = entry.size || 16;

            const srcCanvas = document.createElement("canvas");
            srcCanvas.width = spriteSize;
            srcCanvas.height = spriteSize;
            const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });

            srcCtx.clearRect(0, 0, spriteSize, spriteSize);
            srcCtx.drawImage(
                img,
                entry.x,
                entry.y,
                spriteSize,
                spriteSize,
                0,
                0,
                spriteSize,
                spriteSize
            );

            const imageData = srcCtx.getImageData(0, 0, spriteSize, spriteSize);
            const recolored = recolorSpriteImageData(
                imageData,
                tintHex,
                alphaMultiplier,
                darkenMultiplier
            );
            srcCtx.putImageData(recolored, 0, 0);

            const outCanvas = document.createElement("canvas");
            outCanvas.width = sizePx;
            outCanvas.height = sizePx;
            const outCtx = outCanvas.getContext("2d");
            outCtx.imageSmoothingEnabled = false;
            outCtx.clearRect(0, 0, sizePx, sizePx);
            outCtx.drawImage(srcCanvas, 0, 0, spriteSize, spriteSize, 0, 0, sizePx, sizePx);

            const dataUrl = outCanvas.toDataURL("image/png");
            atlasSpriteRenderCache.set(cacheKey, dataUrl);
            return dataUrl;
        });
    }

    function createAtlasInstanceId() {
        return `atlas_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    }

    function atlasNodeToComponent(node) {
        return {
            __editorType: "atlas",
            text: "",
            atlas: node.dataset.atlas || "minecraft:blocks",
            sprite: node.dataset.sprite || "",
            instance_id: node.dataset.instanceId || createAtlasInstanceId(),
            bold: node.dataset.bold === "1",
            italic: node.dataset.italic === "1",
            underlined: node.dataset.underlined === "1",
            strikethrough: node.dataset.strikethrough === "1",
            color: node.dataset.color || null,
            shadow_color:
                node.dataset.shadowColor !== undefined
                    ? Number(node.dataset.shadowColor)
                    : undefined
        };
    }

    function applyAtlasNodeVisualState(node) {
        node.dataset.kind = "atlas";
        node.contentEditable = "false";
        node.classList.add("atlas-inline-node");

        node.style.display = "inline-flex";
        node.style.alignItems = "center";
        node.style.justifyContent = "center";
        const hasShadow =
            node.dataset.shadowColor !== undefined &&
            node.dataset.shadowColor !== null &&
            node.dataset.shadowColor !== "";

        node.style.minWidth = hasShadow ? "1.18em" : "1em";
        node.style.minHeight = "1em";
        node.style.paddingRight = hasShadow ? "0.16em" : "0";
        node.style.verticalAlign = "middle";
        node.style.cursor = "pointer";
        node.style.userSelect = "none";

        node.style.fontWeight = node.dataset.bold === "1" ? "700" : "400";
        node.style.fontStyle = node.dataset.italic === "1" ? "italic" : "normal";

        node.style.textDecoration = "none";

        if (node.dataset.shadowColor !== undefined && node.dataset.shadowColor !== "") {
            node.style.textShadow = Editor.getShadowCss(node.dataset.shadowColor);
        } else {
            node.style.textShadow = "";
        }
    }

    function createAtlasDecorationLine(kind, color, shadowColor, hasShadow, isBold, scale = "em") {
        const line = document.createElement("span");
        line.style.position = "absolute";
        line.style.left = "0";
        line.style.right = "0";
        line.style.height = isBold ? "3px" : "2px";
        line.style.background = color || "#ffffff";
        line.style.pointerEvents = "none";
        line.style.zIndex = "5";

        if (kind === "underline") {
            line.style.bottom = scale === "px" ? "-1px" : "-0.08em";
        } else {
            line.style.top = "50%";
            line.style.transform = "translateY(-50%)";
        }

        if (hasShadow && shadowColor) {
            line.style.boxShadow = `2px 2px 0 ${shadowColor}`;
        } else {
            line.style.boxShadow = "";
        }

        return line;
    }

    function updateAtlasInlineNodePreview(node) {
        applyAtlasNodeVisualState(node);

        const sprite = node.dataset.sprite || "";
        const atlas = node.dataset.atlas || "";
        const color = node.dataset.color || null;
        const hasShadow =
            node.dataset.shadowColor !== undefined &&
            node.dataset.shadowColor !== null &&
            node.dataset.shadowColor !== "";

        if (hasShadow) {
            const parsed = shadowDecimalToHexAndOpacity(node.dataset.shadowColor);
            node.style.setProperty("--atlas-shadow-color", parsed.hex);
        } else {
            node.style.removeProperty("--atlas-shadow-color");
        }

        const entry = findAtlasEntry(atlas, sprite);

        if (!entry) {
            node.textContent = `[${sprite || "atlas"}]`;
            return;
        }

        node.innerHTML = "";
        node.style.position = "relative";
        node.style.display = "inline-flex";
        node.style.alignItems = "center";
        node.style.justifyContent = "center";
        node.style.overflow = "visible";

        const wrapper = document.createElement("span");
        wrapper.style.position = "relative";
        wrapper.style.display = "inline-block";
        wrapper.style.width = "1em";
        wrapper.style.height = "1em";
        wrapper.style.overflow = "visible";

        if (hasShadow) {
            const shadowImg = document.createElement("img");
            shadowImg.alt = "";
            shadowImg.draggable = false;
            shadowImg.style.position = "absolute";
            shadowImg.style.left = "0.12em";
            shadowImg.style.top = "0.12em";
            shadowImg.style.width = "1em";
            shadowImg.style.height = "1em";
            shadowImg.style.imageRendering = "pixelated";
            shadowImg.style.pointerEvents = "none";

            const parsedShadow = shadowDecimalToHexAndOpacity(node.dataset.shadowColor);
            shadowImg.style.opacity = String(parsedShadow.opacity / 100);

            buildRenderedSpriteDataUrl(entry, 32, parsedShadow.hex, 1, 0.8)
                .then((url) => {
                    shadowImg.src = url || "";
                })
                .catch(() => {});

            wrapper.appendChild(shadowImg);
        }

        const baseImg = document.createElement("img");
        baseImg.alt = sprite;
        baseImg.draggable = false;
        baseImg.style.position = "absolute";
        baseImg.style.left = "0";
        baseImg.style.top = "0";
        baseImg.style.width = "1em";
        baseImg.style.height = "1em";
        baseImg.style.imageRendering = "pixelated";
        baseImg.style.pointerEvents = "none";

        wrapper.appendChild(baseImg);

        const parsedDecorationShadow = hasShadow
            ? shadowDecimalToHexAndOpacity(node.dataset.shadowColor)
            : null;

        const decorationShadowColor = parsedDecorationShadow?.hex || null;
        const isBoldDecoration = node.dataset.bold === "1";

        if (node.dataset.underlined === "1") {
            wrapper.appendChild(
                createAtlasDecorationLine(
                    "underline",
                    color || "#ffffff",
                    decorationShadowColor,
                    hasShadow,
                    isBoldDecoration,
                    "em"
                )
            );
        }

        if (node.dataset.strikethrough === "1") {
            wrapper.appendChild(
                createAtlasDecorationLine(
                    "strike",
                    color || "#ffffff",
                    decorationShadowColor,
                    hasShadow,
                    isBoldDecoration,
                    "em"
                )
            );
        }

        node.appendChild(wrapper);

        buildRenderedSpriteDataUrl(entry, 32, color || null, 1, 1)
            .then((url) => {
                baseImg.src = url || "";
            })
            .catch(() => {
                node.textContent = `[${sprite}]`;
            });
    }

    function createAtlasInlineNode(data) {
        const node = document.createElement("span");

        const atlasGroup = data.atlas || "minecraft:blocks";

        node.dataset.kind = "atlas";
        node.dataset.atlas = atlasGroup;
        node.dataset.sprite = data.sprite || "";
        node.dataset.instanceId = data.instance_id || createAtlasInstanceId();
        node.dataset.bold = data.bold ? "1" : "0";
        node.dataset.italic = data.italic ? "1" : "0";
        node.dataset.underlined = data.underlined ? "1" : "0";
        node.dataset.strikethrough = data.strikethrough ? "1" : "0";

        if (data.color) {
            node.dataset.color = normalizeHexColor(data.color, "#ffffff");
        }

        if (
            data.shadow_color !== undefined &&
            data.shadow_color !== null &&
            data.shadow_color !== ""
        ) {
            node.dataset.shadowColor = String(data.shadow_color);
            const parsed = shadowDecimalToHexAndOpacity(data.shadow_color);
            node.style.setProperty("--atlas-shadow-color", parsed.hex);
        }
        else {
            delete node.dataset.shadowColor;
            node.style.removeProperty("--atlas-shadow-color");
        }

        updateAtlasInlineNodePreview(node);

        node.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.selectedAtlasNode = node;
            const editorKey = el.customNameEditor.contains(node) ? "name" : "lore";
            openAtlasModalForEdit(editorKey, node);
        });

        return node;
    }

    function getAtlasModalPrimaryColor() {
        return state.atlasModal.colorStops.length
            ? `#${Editor.pickGradientColor(state.atlasModal.colorStops, 0, 1)}`
            : "#ffffff";
    }

    function getAtlasModalShadowColor() {
        if (!state.atlasModal.shadowEnabled) return null;
        if (!state.atlasModal.shadowStops.length) return null;
        return `#${Editor.pickGradientColor(state.atlasModal.shadowStops, 0, 1)}`;
    }

    function getAtlasModalShadowColorDecimal() {
        const shadowHex = getAtlasModalShadowColor();
        if (!shadowHex) return null;

        return hexAndOpacityToShadowDecimal(
            shadowHex,
            clamp(state.atlasModal.shadowOpacity, 0, 100)
        );
    }

    function setAtlasMainTab(tab) {
        state.atlasModal.activeMainTab = tab;
        const isAtlas = tab === "atlas";
        el.atlasTabBtn.classList.toggle("active", isAtlas);
        el.atlasFormattingTabBtn.classList.toggle("active", !isAtlas);
        el.atlasTabPanel.classList.toggle("active", isAtlas);
        el.atlasFormattingTabPanel.classList.toggle("active", !isAtlas);
    }

    function setAtlasColorTab(tab) {
        state.atlasModal.activeColorTab = tab;
        const isText = tab === "text";
        el.atlasTextColorTabBtn.classList.toggle("active", isText);
        el.atlasShadowColorTabBtn.classList.toggle("active", !isText);
        el.atlasTextColorTabPanel.classList.toggle("active", isText);
        el.atlasShadowColorTabPanel.classList.toggle("active", !isText);
    }

    function renderAtlasGradientStops(kind) {
        const isText = kind === "text";
        const container = isText
            ? el.atlasTextGradientStopsContainer
            : el.atlasShadowGradientStopsContainer;
        const stops = isText
            ? state.atlasModal.colorStops
            : state.atlasModal.shadowStops;
        const fallback = isText ? "ffffff" : "000000";

        container.innerHTML = "";

        if (!stops.length) {
            stops.push(fallback);
        }

        const fragment = el.gradientStopTemplate.content.cloneNode(true);
        const picker = fragment.querySelector(".gradient-color-picker");
        const hexInput = fragment.querySelector(".gradient-color-hex");
        const addBtn = fragment.querySelector(".gradient-add-btn");
        const removeBtn = fragment.querySelector(".gradient-remove-btn");

        const normalized = normalizeBareHex(stops[0], fallback);
        picker.value = `#${normalized}`;
        hexInput.value = normalized;

        if (addBtn) addBtn.remove();
        if (removeBtn) removeBtn.remove();

        picker.addEventListener("input", () => {
            const value = picker.value.replace("#", "").toLowerCase();
            stops[0] = value;

            if (!isText) {
                state.atlasModal.shadowEnabled = true;
            }

            hexInput.value = value;
            updateAtlasModalPreview();
        });

        hexInput.addEventListener("input", () => {
            const value = normalizeBareHex(hexInput.value, normalized);
            stops[0] = value;

            if (!isText) {
                state.atlasModal.shadowEnabled = true;
            }

            hexInput.value = value;
            picker.value = `#${value}`;
            updateAtlasModalPreview();
        });

        container.appendChild(fragment);
    }

    function updateAtlasPickerList() {
        const group = state.atlasModal.selectedAtlasGroup || getDefaultAtlasGroup();
        const query = el.atlasPickerSearchInput.value || "";
        const entries = getFilteredAtlasEntries(group, query);

        el.atlasPickerList.innerHTML = "";

        entries.forEach((entry) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "atlas-picker-item";
            btn.dataset.sprite = entry.sprite;
            btn.dataset.atlas = entry.atlas;

            const icon = document.createElement("span");
            icon.className = "atlas-picker-item-icon";

            const label = document.createElement("span");
            label.className = "atlas-picker-item-name";
            label.textContent = entry.sprite;

            btn.appendChild(icon);
            btn.appendChild(label);

            buildRenderedSpriteDataUrl(entry, 24, null, 1, 1)
                .then((url) => {
                    if (url) {
                        icon.style.backgroundImage = `url("${url}")`;
                        icon.style.backgroundSize = "contain";
                        icon.style.backgroundRepeat = "no-repeat";
                        icon.style.backgroundPosition = "center";
                    }
                })
                .catch(() => {});

            btn.addEventListener("click", () => {
                state.atlasModal.selectedAtlasGroup = entry.atlas;
                state.atlasModal.selectedAtlasSprite = entry.sprite;

                el.atlasPickerDropdown.classList.remove("open");
                el.atlasPickerDropdown.style.display = "none";
                el.atlasPickerDisplay.setAttribute("aria-expanded", "false");

                updateAtlasSelectedUi();
                updateAtlasModalPreview();
            });

            el.atlasPickerList.appendChild(btn);
        });
    }

    function updateAtlasSelectedUi() {
        const group = state.atlasModal.selectedAtlasGroup || getDefaultAtlasGroup();
        const sprite = state.atlasModal.selectedAtlasSprite || "";
        const entry = findAtlasEntry(group, sprite);

        el.atlasSelectedName.textContent = sprite || "None";
        el.atlasSelectedGroup.textContent = group || "None";
        el.atlasPickerDisplayName.textContent = sprite || "Choose sprite";

        if (entry) {
            buildRenderedSpriteDataUrl(entry, 32, null, 1, 1)
                .then((url) => {
                    el.atlasPickerDisplayIcon.style.backgroundImage = url ? `url("${url}")` : "";
                    el.atlasPickerDisplayIcon.style.backgroundSize = "contain";
                    el.atlasPickerDisplayIcon.style.backgroundRepeat = "no-repeat";
                    el.atlasPickerDisplayIcon.style.backgroundPosition = "center";

                    el.atlasPreviewSprite.style.backgroundImage = url ? `url("${url}")` : "";
                    el.atlasPreviewSprite.style.backgroundSize = "contain";
                    el.atlasPreviewSprite.style.backgroundRepeat = "no-repeat";
                    el.atlasPreviewSprite.style.backgroundPosition = "center";
                })
                .catch(() => {
                    el.atlasPickerDisplayIcon.style.backgroundImage = "";
                    el.atlasPreviewSprite.style.backgroundImage = "";
                });
        } else {
            el.atlasPickerDisplayIcon.style.backgroundImage = "";
            el.atlasPreviewSprite.style.backgroundImage = "";
        }
    }

    function updateAtlasModalPreview() {
        const sprite = state.atlasModal.selectedAtlasSprite || "";
        const group = state.atlasModal.selectedAtlasGroup || getDefaultAtlasGroup();
        const entry = findAtlasEntry(group, sprite);

        el.atlasBoldBtn.classList.toggle("active", !!state.atlasModal.bold);
        el.atlasItalicBtn.classList.toggle("active", !!state.atlasModal.italic);
        el.atlasUnderlineBtn.classList.toggle("active", !!state.atlasModal.underlined);
        el.atlasStrikethroughBtn.classList.toggle("active", !!state.atlasModal.strikethrough);

        el.atlasBoldBtn.style.color = state.atlasModal.bold ? "#8ecbff" : "";
        el.atlasItalicBtn.style.color = state.atlasModal.italic ? "#8ecbff" : "";
        el.atlasUnderlineBtn.style.color = state.atlasModal.underlined ? "#8ecbff" : "";
        el.atlasStrikethroughBtn.style.color = state.atlasModal.strikethrough ? "#8ecbff" : "";

        el.atlasModalShadowOpacityInput.value = clamp(state.atlasModal.shadowOpacity, 0, 100);

        if (!entry) {
            el.atlasModalSelectionPreview.textContent = "No atlas selected";
            el.atlasModalSelectionPreview.style.color = "";
            el.atlasModalSelectionPreview.style.textShadow = "";
            return;
        }

        el.atlasModalSelectionPreview.innerHTML = "";
        el.atlasModalSelectionPreview.style.position = "relative";
        el.atlasModalSelectionPreview.style.overflow = "visible";
        el.atlasModalSelectionPreview.style.minHeight = "40px";

        const color = getAtlasModalPrimaryColor();
        const hasShadow = !!state.atlasModal.shadowEnabled;

        const wrapper = document.createElement("span");
        wrapper.style.position = "relative";
        wrapper.style.display = "inline-block";
        wrapper.style.width = "36px";
        wrapper.style.height = "36px";
        wrapper.style.overflow = "visible";

        if (hasShadow) {
            const shadowImg = document.createElement("img");
            shadowImg.alt = "";
            shadowImg.style.position = "absolute";
            shadowImg.style.left = "3.5px";
            shadowImg.style.top = "3.5px";
            shadowImg.style.width = "32px";
            shadowImg.style.height = "32px";
            shadowImg.style.imageRendering = "pixelated";
            shadowImg.style.pointerEvents = "none";

            const shadowHex = getAtlasModalShadowColor();
            shadowImg.style.opacity = String(clamp(state.atlasModal.shadowOpacity, 0, 100) / 100);

            buildRenderedSpriteDataUrl(entry, 32, shadowHex, 1, 0.8)
                .then((url) => {
                    shadowImg.src = url || "";
                })
                .catch(() => {});

            wrapper.appendChild(shadowImg);
        }

        const baseImg = document.createElement("img");
        baseImg.alt = sprite;
        baseImg.style.position = "absolute";
        baseImg.style.left = "0";
        baseImg.style.top = "0";
        baseImg.style.width = "32px";
        baseImg.style.height = "32px";
        baseImg.style.imageRendering = "pixelated";
        baseImg.style.pointerEvents = "none";
        wrapper.appendChild(baseImg);

        const modalShadowHex = hasShadow ? getAtlasModalShadowColor() : null;
        const modalIsBoldDecoration = !!state.atlasModal.bold;

        if (state.atlasModal.underlined) {
            wrapper.appendChild(
                createAtlasDecorationLine(
                    "underline",
                    color || "#ffffff",
                    modalShadowHex,
                    hasShadow,
                    modalIsBoldDecoration,
                    "px"
                )
            );
        }

        if (state.atlasModal.strikethrough) {
            wrapper.appendChild(
                createAtlasDecorationLine(
                    "strike",
                    color || "#ffffff",
                    modalShadowHex,
                    hasShadow,
                    modalIsBoldDecoration,
                    "px"
                )
            );
        }

        el.atlasModalSelectionPreview.appendChild(wrapper);

        buildRenderedSpriteDataUrl(entry, 32, color, 1, 1)
            .then((url) => {
                if (url) baseImg.src = url;
            })
            .catch(() => {
                el.atlasModalSelectionPreview.textContent = `[${sprite}]`;
            });

        updateAtlasSelectedUi();
    }

    function populateAtlasGroupSelect() {
        const groups = getAllAtlasGroups();
        el.atlasCategorySelect.innerHTML = "";

        groups.forEach((group) => {
            const option = document.createElement("option");
            option.value = group;
            option.textContent = group;
            el.atlasCategorySelect.appendChild(option);
        });
    }

    function resetAtlasModalState() {
        state.atlasModal.mode = "insert";
        state.atlasModal.editorKey = "name";
        state.atlasModal.savedRange = null;
        state.atlasModal.atlasTargetNode = null;
        state.atlasModal.selectedAtlasGroup = getDefaultAtlasGroup();
        state.atlasModal.selectedAtlasSprite = "";
        state.atlasModal.colorStops = ["ffffff"];
        state.atlasModal.shadowStops = ["000000"];
        state.atlasModal.shadowEnabled = false;
        state.atlasModal.shadowOpacity = 100;
        state.atlasModal.bold = false;
        state.atlasModal.italic = false;
        state.atlasModal.underlined = false;
        state.atlasModal.strikethrough = false;
        state.atlasModal.activeMainTab = "atlas";
        state.atlasModal.activeColorTab = "text";
    }

    function openAtlasModalForInsert(editorKey) {
        resetAtlasModalState();
        state.atlasModal.editorKey = editorKey;
        saveSelectionForEditor(editorKey);

        state.atlasModal.shadowStops = ["000000"];
        state.atlasModal.shadowEnabled = false;
        state.atlasModal.shadowOpacity = 100;

        const groups = getAllAtlasGroups();
        if (groups.length && !state.atlasModal.selectedAtlasGroup) {
            state.atlasModal.selectedAtlasGroup = groups[0];
        }

        populateAtlasGroupSelect();
        el.atlasCategorySelect.value = state.atlasModal.selectedAtlasGroup || getDefaultAtlasGroup();
        el.atlasPickerSearchInput.value = "";
        el.atlasPickerDropdown.style.display = "none";
        el.atlasPickerDisplay.setAttribute("aria-expanded", "false");

        setAtlasMainTab("atlas");
        setAtlasColorTab("text");
        renderAtlasGradientStops("text");
        renderAtlasGradientStops("shadow");
        updateAtlasPickerList();
        updateAtlasModalPreview();

        el.atlasModalTitle.textContent = "Insert Atlas Sprite";
        el.insertAtlasBtn.textContent = "Insert Atlas";
        el.deleteAtlasBtn.textContent = "Delete Atlas";
        el.deleteAtlasBtn.disabled = true;

        el.atlasModalBackdrop.classList.remove("hidden");
        el.atlasModalBackdrop.setAttribute("aria-hidden", "false");
    }

    function openAtlasModalForEdit(editorKey, node) {
        resetAtlasModalState();
        state.atlasModal.mode = "edit";
        state.atlasModal.editorKey = editorKey;
        state.atlasModal.atlasTargetNode = node;
        state.atlasModal.selectedAtlasGroup = node.dataset.atlas || "minecraft:blocks";
        state.atlasModal.selectedAtlasSprite = node.dataset.sprite || "";
        state.atlasModal.bold = node.dataset.bold === "1";
        state.atlasModal.italic = node.dataset.italic === "1";
        state.atlasModal.underlined = node.dataset.underlined === "1";
        state.atlasModal.strikethrough = node.dataset.strikethrough === "1";
        state.atlasModal.colorStops = [normalizeBareHex(node.dataset.color || "ffffff", "ffffff")];

        if (node.dataset.shadowColor !== undefined && node.dataset.shadowColor !== "") {
            const parsedShadow = shadowDecimalToHexAndOpacity(node.dataset.shadowColor);
            state.atlasModal.shadowStops = [normalizeBareHex(parsedShadow.hex, "000000")];
            state.atlasModal.shadowEnabled = true;
            state.atlasModal.shadowOpacity = parsedShadow.opacity;
        } else {
            state.atlasModal.shadowStops = ["000000"];
            state.atlasModal.shadowEnabled = false;
            state.atlasModal.shadowOpacity = 100;
        }

        populateAtlasGroupSelect();
        el.atlasCategorySelect.value = state.atlasModal.selectedAtlasGroup || getDefaultAtlasGroup();
        el.atlasPickerSearchInput.value = "";
        el.atlasPickerDropdown.style.display = "none";
        el.atlasPickerDisplay.setAttribute("aria-expanded", "false");

        setAtlasMainTab("atlas");
        setAtlasColorTab("text");
        renderAtlasGradientStops("text");
        renderAtlasGradientStops("shadow");
        updateAtlasPickerList();
        updateAtlasModalPreview();

        el.atlasModalTitle.textContent = "Edit Atlas Sprite";
        el.insertAtlasBtn.textContent = "Update Atlas";
        el.deleteAtlasBtn.textContent = "Delete Atlas";
        el.deleteAtlasBtn.disabled = false;

        el.atlasModalBackdrop.classList.remove("hidden");
        el.atlasModalBackdrop.setAttribute("aria-hidden", "false");
    }

    function closeAtlasModal() {
        el.atlasModalBackdrop.classList.add("hidden");
        el.atlasModalBackdrop.setAttribute("aria-hidden", "true");
        state.atlasModal.savedRange = null;
        state.atlasModal.atlasTargetNode = null;
    }

    function insertOrUpdateAtlasFromModal() {
        const editor = editorKeyToElement(state.atlasModal.editorKey);
        const sprite = state.atlasModal.selectedAtlasSprite || "";
        const atlas = state.atlasModal.selectedAtlasGroup || "minecraft:blocks";

        if (!sprite) {
            setError("Choose an atlas sprite first.");
            return;
        }

        const data = {
            atlas,
            sprite,
            instance_id:
                state.atlasModal.mode === "edit" && state.atlasModal.atlasTargetNode
                    ? (state.atlasModal.atlasTargetNode.dataset.instanceId || createAtlasInstanceId())
                    : createAtlasInstanceId(),
            bold: !!state.atlasModal.bold,
            italic: !!state.atlasModal.italic,
            underlined: !!state.atlasModal.underlined,
            strikethrough: !!state.atlasModal.strikethrough,
            color: getAtlasModalPrimaryColor()
        };

        const shadowColorDecimal = getAtlasModalShadowColorDecimal();
        if (shadowColorDecimal !== null) {
            data.shadow_color = shadowColorDecimal;
        }

        const node = createAtlasInlineNode(data);

        if (state.atlasModal.mode === "edit" && state.atlasModal.atlasTargetNode) {
            const oldNode = state.atlasModal.atlasTargetNode;
            oldNode.replaceWith(node);
            ensureCaretGuardsAroundAtlas(node);
            Editor.normalizeEditor(editor);
            closeAtlasModal();
            return;
        }

        if (!restoreSavedSelection()) {
            editor.focus();
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            editor.appendChild(createCaretGuardNode());
            editor.appendChild(node);
            editor.appendChild(createCaretGuardNode());
            closeAtlasModal();
            return;
        }

        const range = selection.getRangeAt(0);
        range.deleteContents();

        const afterGuard = createCaretGuardNode();
        range.insertNode(afterGuard);
        range.insertNode(node);
        range.insertNode(createCaretGuardNode());

        const newRange = document.createRange();
        newRange.setStartAfter(afterGuard);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        ensureCaretGuardsAroundAtlas(node);
        Editor.normalizeEditor(editor);
        closeAtlasModal();
    }

    function deleteAtlasFromModal() {
        if (state.atlasModal.mode !== "edit" || !state.atlasModal.atlasTargetNode) {
            closeAtlasModal();
            return;
        }

        const node = state.atlasModal.atlasTargetNode;
        removeAdjacentCaretGuards(node);
        node.remove();
        closeAtlasModal();
    }

    function renderCommandRows() {
        const mode = el.cmdStorageMode?.value || "minecart_chain";

        if (mode === "direct_cmd") {
            const firstCommand = String(state.commands[0] || "");
            state.commands = [firstCommand];
        } else if (state.commands.length < 2) {
            while (state.commands.length < 2) {
                state.commands.push("");
            }
        }

        el.commandsContainer.innerHTML = "";

        state.commands.forEach((command, index) => {
            const fragment = el.commandRowTemplate.content.cloneNode(true);
            const row = fragment.querySelector(".command-row");
            const label = fragment.querySelector(".command-label");
            const textarea = fragment.querySelector(".command-text");
            const dragHandle = fragment.querySelector(".drag-handle");
            const moveUpBtn = fragment.querySelector(".move-up-btn");
            const moveDownBtn = fragment.querySelector(".move-down-btn");
            const insertAboveBtn = fragment.querySelector(".insert-above-btn");
            const insertBelowBtn = fragment.querySelector(".insert-below-btn");
            const removeBtn = fragment.querySelector(".remove-command-btn");

            label.textContent =
                mode === "direct_cmd" ? "Direct Command" : `Command ${index + 1}`;

            textarea.value = command || "";
            textarea.addEventListener("input", () => {
                state.commands[index] = textarea.value;
            });

            if (mode === "direct_cmd") {
                if (dragHandle) dragHandle.style.display = "none";
                if (moveUpBtn) moveUpBtn.style.display = "none";
                if (moveDownBtn) moveDownBtn.style.display = "none";
                if (insertAboveBtn) insertAboveBtn.style.display = "none";
                if (insertBelowBtn) insertBelowBtn.style.display = "none";
                if (removeBtn) removeBtn.style.display = "none";

                el.commandsContainer.appendChild(fragment);
                return;
            }

            moveUpBtn.addEventListener("click", () => {
                if (index === 0) return;
                [state.commands[index - 1], state.commands[index]] =
                    [state.commands[index], state.commands[index - 1]];
                renderCommandRows();
            });

            moveDownBtn.addEventListener("click", () => {
                if (index >= state.commands.length - 1) return;
                [state.commands[index + 1], state.commands[index]] =
                    [state.commands[index], state.commands[index + 1]];
                renderCommandRows();
            });

            insertAboveBtn.addEventListener("click", () => {
                state.commands.splice(index, 0, "");
                renderCommandRows();
            });

            insertBelowBtn.addEventListener("click", () => {
                state.commands.splice(index + 1, 0, "");
                renderCommandRows();
            });

            removeBtn.addEventListener("click", () => {
                if (state.commands.length <= 2) {
                    state.commands[index] = "";
                } else {
                    state.commands.splice(index, 1);
                }
                renderCommandRows();
            });

            dragHandle.addEventListener("dragstart", () => {
                state.draggedIndex = index;
                row.classList.add("dragging");
            });

            dragHandle.addEventListener("dragend", () => {
                state.draggedIndex = null;
                row.classList.remove("dragging");
            });

            row.addEventListener("dragover", (e) => {
                e.preventDefault();
            });

            row.addEventListener("drop", (e) => {
                e.preventDefault();
                if (state.draggedIndex === null || state.draggedIndex === index) return;

                const [dragged] = state.commands.splice(state.draggedIndex, 1);
                state.commands.splice(index, 0, dragged);
                state.draggedIndex = null;
                renderCommandRows();
            });

            el.commandsContainer.appendChild(fragment);
        });
    }

    function buildMinecartPassenger(command, targetPlayer) {
        const processed = maybeWrapAtNamedPlayer(command, targetPlayer);
        return `{id:"minecraft:command_block_minecart",Command:"${mcEscapeString(processed)}"}`;
    }

    function buildCleanupMinecart() {
        return `{id:"minecraft:command_block_minecart",Command:"${mcEscapeString(Core.CLEANUP_COMMAND)}"}`;
    }

    function buildSummonCommand(commands, summonPos, targetPlayer) {
        const passengerList = commands
            .filter((cmd) => cmd.trim())
            .map((cmd) => buildMinecartPassenger(cmd, targetPlayer));

        if (!passengerList.length) return null;
        passengerList.push(buildCleanupMinecart());

        return `summon minecraft:falling_block ${summonPos} {BlockState:{Name:"minecraft:activator_rail"},Time:1,DropItem:0b,HurtEntities:0b,Passengers:[${passengerList.join(",")}]}`
    }

    function buildDirectCommand(commands) {
        const nonEmpty = commands.filter((cmd) => String(cmd || "").trim());
        if (!nonEmpty.length) return null;
        return String(nonEmpty[0]).trim();
    }

    function buildCustomDataValue(cmdValue, extraCustomDataRaw) {
        const entries = normalizeTopLevelEntries(extraCustomDataRaw);
        const filtered = entries.filter((entry) => {
            const lower = entry.toLowerCase();
            return !(lower === "cmd" || lower.startsWith("cmd:") || lower.startsWith("cmd="));
        });

        if (cmdValue) {
            filtered.push(`cmd:"${mcEscapeString(cmdValue)}"`);
        }

        return filtered.length ? `{${filtered.join(",")}}` : null;
    }

    function serializeComponentForMinecraft(component) {
        if (component.__editorType === "atlas" || typeof component.sprite === "string") {
            const atlasGroup = component.atlas || "minecraft:blocks";

            const out = {
                sprite: component.sprite || ""
            };

            if (atlasGroup !== "minecraft:blocks") {
                out.atlas = atlasGroup;
            }

            if (component.bold) out.bold = true;
            if (component.italic) out.italic = true;
            if (component.underlined) out.underlined = true;
            if (component.strikethrough) out.strikethrough = true;
            if (component.color) out.color = normalizeHexColor(component.color, "#ffffff");
            if (
                component.shadow_color !== undefined &&
                component.shadow_color !== null &&
                component.shadow_color !== ""
            ) {
                out.shadow_color = Number(component.shadow_color);
            }

            return out;
        }

        return Editor.buildTextComponentObject(component.text || "", {
            bold: !!component.bold,
            italic: !!component.italic,
            underlined: !!component.underlined,
            strikethrough: !!component.strikethrough,
            color: component.color || null,
            shadowColor:
                component.shadow_color !== undefined ? component.shadow_color : null
        });
    }

    function serializeLineForMinecraft(line) {
        return line.map((component) => serializeComponentForMinecraft(component));
    }

    function buildGiveExample(itemId, customDataValue, extraFields) {
        const components = [];

        if (extraFields.itemModel) {
            components.push(`item_model="${mcEscapeString(extraFields.itemModel)}"`);
        }

        const mcNameLine = (extraFields.customNameLines[0] || [])
            .map((component) => serializeLineForMinecraft([component])[0])
            .filter(Boolean);

        if (mcNameLine.length > 0) {
            components.push(`custom_name=${JSON.stringify(mcNameLine)}`);
        }

        const mcLoreLines = extraFields.loreLines
            .map((line) => serializeLineForMinecraft(line))
            .filter((line) => line.length > 0);

        if (mcLoreLines.length > 0) {
            components.push(`lore=${JSON.stringify(mcLoreLines)}`);
        }

        if (customDataValue) {
            components.push(`custom_data=${customDataValue}`);
        }

        const extraComponents = normalizeTopLevelEntries(extraFields.extraComponentsRaw);
        components.push(...extraComponents);

        return `/give @p ${itemId}${components.length ? `[${components.join(",")}]` : ""}`;
    }

    function extractGiveItemAndComponents(giveCmd) {
        const prefixMatch = giveCmd.match(/^\/?give\s+\S+\s+/);
        if (!prefixMatch) {
            throw new Error("Could not parse the beginning of the give command.");
        }

        const rest = giveCmd.slice(prefixMatch[0].length).trim();
        const bracketStart = rest.indexOf("[");

        if (bracketStart === -1) {
            return { itemId: rest, componentStrings: [] };
        }

        const itemId = rest.slice(0, bracketStart).trim();
        const bracketEnd = findMatching(rest, bracketStart, "[", "]");
        const inner = rest.slice(bracketStart + 1, bracketEnd).trim();

        return {
            itemId,
            componentStrings: splitTopLevel(inner)
        };
    }

    function parseTextComponentValue(rawValue, multiline = false) {
        const trimmed = (rawValue || "").trim();
        if (!trimmed) return [];

        try {
            const parsed = JSON.parse(trimmed);

            if (Array.isArray(parsed)) {
                if (multiline) {
                    return parsed.map((line) => (Array.isArray(line) ? line : [line]));
                }
                return [parsed];
            }

            return [[parsed]];
        } catch (_err) {
            return [[{ text: mcUnescapeString(trimmed) }]];
        }
    }

    function extractMinecartCommandsFromSummonChain(rawSummon) {
        const raw = String(rawSummon || "").trim();

        const passengersKey = "Passengers:";
        const passengersIdx = raw.indexOf(passengersKey);

        if (passengersIdx === -1) {
            throw new Error("Could not find Passengers:[...] in the summon command.");
        }

        const arrayStart = raw.indexOf("[", passengersIdx);
        if (arrayStart === -1) {
            throw new Error("Found Passengers but could not find its opening [.");
        }

        const arrayEnd = findMatching(raw, arrayStart, "[", "]");
        const passengersRaw = raw.slice(arrayStart + 1, arrayEnd);
        const passengers = splitTopLevel(passengersRaw);

        const commands = [];

        passengers.forEach((passenger) => {
            if (!/command_block_minecart/i.test(passenger)) return;

            const commandRaw = extractFieldValueFlexible("Command", passenger);
            if (!commandRaw) return;

            const command = maybeUnwrapNamedPlayer(commandRaw);
            const trimmed = command.trim();

            if (
                trimmed === Core.CLEANUP_COMMAND ||
                trimmed === "kill @e[type=command_block_minecart]" ||
                trimmed.includes("kill @e[type=minecraft:command_block_minecart") ||
                trimmed.includes("kill @e[type=command_block_minecart")
            ) {
                return;
            }

            commands.push(command);
        });

        if (!commands.length) {
            throw new Error("No command_block_minecart Command values were found.");
        }

        return commands;
    }

    function reverseParseMinecartChain(rawSummon) {
        const commands = extractMinecartCommandsFromSummonChain(rawSummon);

        if (el.cmdStorageMode) {
            el.cmdStorageMode.value = "minecart_chain";
        }

        state.commands = commands;
        renderCommandRows();
        setError("");
    }

    function reverseParseGiveCommand(giveCmd) {
        const { itemId, componentStrings } = extractGiveItemAndComponents(giveCmd);
        el.itemId.value = itemId || "minecraft:grass_block";

        let nameLines = [[]];
        let loreLines = [];
        let customDataValue = null;
        let itemModel = "";
        const extraComponents = [];

        componentStrings.forEach((component) => {
            const trimmed = component.trim();
            if (trimmed.startsWith("custom_name=")) {
                nameLines = parseTextComponentValue(trimmed.slice("custom_name=".length), false);
            } else if (trimmed.startsWith("lore=")) {
                loreLines = parseTextComponentValue(trimmed.slice("lore=".length), true);
            } else if (trimmed.startsWith("custom_data=")) {
                customDataValue = trimmed.slice("custom_data=".length);
            } else if (trimmed.startsWith("item_model=")) {
                itemModel = mcUnescapeString(
                    trimmed.slice("item_model=".length).replace(/^"(.*)"$/, "$1")
                );
            } else {
                extraComponents.push(trimmed);
            }
        });

        el.itemModel.value = itemModel;
        el.extraComponentsInput.value = extraComponents.join(",");

        Editor.linesToEditorDom(el.customNameEditor, nameLines);
        Editor.linesToEditorDom(el.loreEditor, loreLines);

        let extractedCmd = null;
        const extraCustomData = [];

        if (customDataValue && customDataValue.startsWith("{") && customDataValue.endsWith("}")) {
            const inner = customDataValue.slice(1, -1);
            const entries = splitTopLevel(inner);

            entries.forEach((entry) => {
                const lower = entry.toLowerCase();
                if (lower.startsWith("cmd:") || lower.startsWith("cmd=")) {
                    const raw = extractFieldValueFlexible("cmd", entry);
                    extractedCmd = raw;
                } else {
                    extraCustomData.push(entry);
                }
            });
        }

        el.extraCustomDataInput.value = extraCustomData.join(",");

        const commands = [];
        if (extractedCmd) {
            const passengerMatch = extractedCmd.match(/Passengers:\[(.*)\]\s*}$/);

            if (passengerMatch) {
                if (el.cmdStorageMode) {
                    el.cmdStorageMode.value = "minecart_chain";
                }

                const passengers = splitTopLevel(passengerMatch[1]);

                passengers.forEach((p) => {
                    if (!/command_block_minecart/i.test(p)) return;
                    const commandRaw = extractFieldValueFlexible("Command", p);
                    const command = maybeUnwrapNamedPlayer(commandRaw);
                    if (command !== Core.CLEANUP_COMMAND) {
                        commands.push(command);
                    }
                });
            } else {
                if (el.cmdStorageMode) {
                    el.cmdStorageMode.value = "direct_cmd";
                }

                commands.push(mcUnescapeString(extractedCmd));
            }
        }

        state.commands = commands.length ? commands : ["", ""];
        renderCommandRows();

        state.commands = commands.length ? commands : ["", ""];
        renderCommandRows();
    }

    function generateOutputs() {
        try {
            setError("");

            const customNameLines = Editor.editorDomToComponentLines(el.customNameEditor);
            const loreLines = Editor.editorDomToComponentLines(el.loreEditor);

            const mode = el.cmdStorageMode?.value || "minecart_chain";
            const nonEmptyCommands = state.commands.filter((cmd) => String(cmd || "").trim());

            let summonCommand = null;
            let cmdValue = null;

            if (mode === "direct_cmd") {
                if (nonEmptyCommands.length > 1) {
                    throw new Error("Direct cmd mode only supports one command.");
                }

                cmdValue = buildDirectCommand(state.commands);
            } else {
                summonCommand = buildSummonCommand(
                    state.commands,
                    el.summonPos.value.trim() || "~ ~0.5 ~",
                    el.targetPlayer.value.trim()
                );
                cmdValue = summonCommand;
            }

            const customDataValue = buildCustomDataValue(
                cmdValue,
                el.extraCustomDataInput.value
            );

            const giveExample = buildGiveExample(
                el.itemId.value.trim() || "minecraft:grass_block",
                customDataValue,
                {
                    itemModel: el.itemModel.value.trim(),
                    customNameLines,
                    loreLines,
                    extraComponentsRaw: el.extraComponentsInput.value
                }
            );

            el.summonOutput.value = summonCommand || "";
            el.customOutput.value = customDataValue || "";
            el.giveOutput.value = giveExample || "";
        } catch (err) {
            setError(err && err.message ? err.message : String(err));
        }
    }

    function replaceAllCommands(findText, replaceText) {
        if (!findText) return;
        state.commands = state.commands.map((cmd) =>
            String(cmd || "").split(findText).join(replaceText)
        );
        renderCommandRows();
    }

    window.MCParser = window.MCParser || {};
    window.MCParser.atlasParser = {
        saveSelectionForEditor,
        restoreSavedSelection,
        getAtlasImageUrl,
        getAllAtlasGroups,
        getDefaultAtlasGroup,
        findAtlasEntry,
        getFilteredAtlasEntries,
        loadAtlasSourceImage,
        recolorSpriteImageData,
        buildRenderedSpriteDataUrl,
        createAtlasInstanceId,
        atlasNodeToComponent,
        applyAtlasNodeVisualState,
        updateAtlasInlineNodePreview,
        createAtlasInlineNode,
        getAtlasModalPrimaryColor,
        getAtlasModalShadowColorDecimal,
        setAtlasMainTab,
        setAtlasColorTab,
        renderAtlasGradientStops,
        updateAtlasPickerList,
        updateAtlasSelectedUi,
        updateAtlasModalPreview,
        populateAtlasGroupSelect,
        resetAtlasModalState,
        openAtlasModalForInsert,
        openAtlasModalForEdit,
        closeAtlasModal,
        insertOrUpdateAtlasFromModal,
        deleteAtlasFromModal,
        renderCommandRows,
        buildMinecartPassenger,
        buildCleanupMinecart,
        buildSummonCommand,
        buildDirectCommand,
        buildCustomDataValue,
        serializeComponentForMinecraft,
        serializeLineForMinecraft,
        buildGiveExample,
        extractGiveItemAndComponents,
        parseTextComponentValue,
        reverseParseGiveCommand,
        extractMinecartCommandsFromSummonChain,
        reverseParseMinecartChain,
        generateOutputs,
        replaceAllCommands
    };
})();