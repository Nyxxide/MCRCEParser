(function () {
    "use strict";

    const CLEANUP_COMMAND = "kill @e[type=minecraft:command_block_minecart]";

    const MINECRAFT_NAMED_COLORS = {
        black: "#000000",
        dark_blue: "#0000aa",
        dark_green: "#00aa00",
        dark_aqua: "#00aaaa",
        dark_red: "#aa0000",
        dark_purple: "#aa00aa",
        gold: "#ffaa00",
        gray: "#aaaaaa",
        dark_gray: "#555555",
        blue: "#5555ff",
        green: "#55ff55",
        aqua: "#55ffff",
        red: "#ff5555",
        light_purple: "#ff55ff",
        yellow: "#ffff55",
        white: "#ffffff"
    };

    const ATLAS_DATA_SAFE = Array.isArray(window.ATLAS_DATA) ? window.ATLAS_DATA : [];
    const ATLAS_GROUPS_SAFE = window.ATLAS_GROUPS || {};
    const SEARCH_ATLAS_SAFE =
        typeof window.searchAtlas === "function"
            ? window.searchAtlas
            : function fallbackSearchAtlas(group, query) {
                const list = ATLAS_GROUPS_SAFE[group] || [];
                if (!query) return list;
                const q = String(query).toLowerCase();
                return list.filter((e) => String(e.sprite || "").toLowerCase().includes(q));
            };

    const CARET_GUARD = "\u200B";

    const state = {
        commands: ["", ""],
        draggedIndex: null,
        selectedAtlasNode: null,
        focusedEditorKey: "name",
        typingStyle: {
            name: {
                bold: false,
                italic: false,
                underlined: false,
                strikethrough: false,
                color: null,
                shadowColor: null
            },
            lore: {
                bold: false,
                italic: false,
                underlined: false,
                strikethrough: false,
                color: null,
                shadowColor: null
            }
        },
        colorModal: {
            editorKey: null,
            savedRange: null,
            textStops: ["ffffff"],
            shadowStops: [],
            shadowOpacity: 100,
            activeTab: "text"
        },
        atlasModal: {
            mode: "insert",
            editorKey: "name",
            savedRange: null,
            atlasTargetNode: null,
            selectedAtlasGroup: "",
            selectedAtlasSprite: "",
            colorStops: ["ffffff"],
            shadowStops: ["000000"],
            shadowOpacity: 100,
            bold: false,
            italic: false,
            underlined: false,
            strikethrough: false,
            activeMainTab: "atlas",
            activeColorTab: "text"
        }
    };

    const el = {
        summonPos: document.getElementById("summonPos"),
        itemId: document.getElementById("itemId"),
        itemModel: document.getElementById("itemModel"),
        targetPlayer: document.getElementById("targetPlayer"),
        cmdStorageMode: document.getElementById("cmdStorageMode"),

        customNameEditor: document.getElementById("customNameEditor"),
        loreEditor: document.getElementById("loreEditor"),

        nameBoldBtn: document.getElementById("nameBoldBtn"),
        nameItalicBtn: document.getElementById("nameItalicBtn"),
        nameUnderlineBtn: document.getElementById("nameUnderlineBtn"),
        nameStrikethroughBtn: document.getElementById("nameStrikethroughBtn"),
        nameClearStyleBtn: document.getElementById("nameClearStyleBtn"),
        openNameColorModalBtn: document.getElementById("openNameColorModalBtn"),
        openNameAtlasModalBtn: document.getElementById("openNameAtlasModalBtn"),

        loreBoldBtn: document.getElementById("loreBoldBtn"),
        loreItalicBtn: document.getElementById("loreItalicBtn"),
        loreUnderlineBtn: document.getElementById("loreUnderlineBtn"),
        loreStrikethroughBtn: document.getElementById("loreStrikethroughBtn"),
        loreClearStyleBtn: document.getElementById("loreClearStyleBtn"),
        openLoreColorModalBtn: document.getElementById("openLoreColorModalBtn"),
        openLoreAtlasModalBtn: document.getElementById("openLoreAtlasModalBtn"),

        colorModalBackdrop: document.getElementById("colorModalBackdrop"),
        colorModal: document.getElementById("colorModal"),
        closeColorModalBtn: document.getElementById("closeColorModalBtn"),
        colorModalSelectionPreview: document.getElementById("colorModalSelectionPreview"),
        textColorTabBtn: document.getElementById("textColorTabBtn"),
        shadowColorTabBtn: document.getElementById("shadowColorTabBtn"),
        textColorTabPanel: document.getElementById("textColorTabPanel"),
        shadowColorTabPanel: document.getElementById("shadowColorTabPanel"),
        addTextGradientStopBtn: document.getElementById("addTextGradientStopBtn"),
        addShadowGradientStopBtn: document.getElementById("addShadowGradientStopBtn"),
        textGradientStopsContainer: document.getElementById("textGradientStopsContainer"),
        shadowGradientStopsContainer: document.getElementById("shadowGradientStopsContainer"),
        modalShadowOpacityInput: document.getElementById("modalShadowOpacityInput"),
        applyColorModalBtn: document.getElementById("applyColorModalBtn"),

        atlasModalBackdrop: document.getElementById("atlasModalBackdrop"),
        atlasModal: document.getElementById("atlasModal"),
        atlasModalTitle: document.getElementById("atlasModalTitle"),
        closeAtlasModalBtn: document.getElementById("closeAtlasModalBtn"),
        atlasTabBtn: document.getElementById("atlasTabBtn"),
        atlasFormattingTabBtn: document.getElementById("atlasFormattingTabBtn"),
        atlasTabPanel: document.getElementById("atlasTabPanel"),
        atlasFormattingTabPanel: document.getElementById("atlasFormattingTabPanel"),
        atlasCategorySelect: document.getElementById("atlasCategorySelect"),
        atlasPickerSearchInput: document.getElementById("atlasPickerSearchInput"),
        atlasPickerDisplay: document.getElementById("atlasPickerDisplay"),
        atlasPickerDisplayIcon: document.getElementById("atlasPickerDisplayIcon"),
        atlasPickerDisplayName: document.getElementById("atlasPickerDisplayName"),
        atlasPickerDropdown: document.getElementById("atlasPickerDropdown"),
        atlasPickerList: document.getElementById("atlasPickerList"),
        atlasSearchInput: document.getElementById("atlasSearchInput"),
        atlasSpriteSelect: document.getElementById("atlasSpriteSelect"),
        atlasPreviewBox: document.getElementById("atlasPreviewBox"),
        atlasPreviewSprite: document.getElementById("atlasPreviewSprite"),
        atlasSelectedName: document.getElementById("atlasSelectedName"),
        atlasSelectedGroup: document.getElementById("atlasSelectedGroup"),
        atlasModalSelectionPreview: document.getElementById("atlasModalSelectionPreview"),
        atlasBoldBtn: document.getElementById("atlasBoldBtn"),
        atlasItalicBtn: document.getElementById("atlasItalicBtn"),
        atlasUnderlineBtn: document.getElementById("atlasUnderlineBtn"),
        atlasStrikethroughBtn: document.getElementById("atlasStrikethroughBtn"),
        atlasClearFormattingBtn: document.getElementById("atlasClearFormattingBtn"),
        atlasTextColorTabBtn: document.getElementById("atlasTextColorTabBtn"),
        atlasShadowColorTabBtn: document.getElementById("atlasShadowColorTabBtn"),
        atlasTextColorTabPanel: document.getElementById("atlasTextColorTabPanel"),
        atlasShadowColorTabPanel: document.getElementById("atlasShadowColorTabPanel"),
        addAtlasTextGradientStopBtn: document.getElementById("addAtlasTextGradientStopBtn"),
        addAtlasShadowGradientStopBtn: document.getElementById("addAtlasShadowGradientStopBtn"),
        atlasTextGradientStopsContainer: document.getElementById("atlasTextGradientStopsContainer"),
        atlasShadowGradientStopsContainer: document.getElementById("atlasShadowGradientStopsContainer"),
        atlasModalShadowOpacityInput: document.getElementById("atlasModalShadowOpacityInput"),
        insertAtlasBtn: document.getElementById("insertAtlasBtn"),
        deleteAtlasBtn: document.getElementById("deleteAtlasBtn"),

        extraCustomDataInput: document.getElementById("extraCustomDataInput"),
        extraComponentsInput: document.getElementById("extraComponentsInput"),

        findAllInput: document.getElementById("findAllInput"),
        replaceAllInput: document.getElementById("replaceAllInput"),
        replaceAllBtn: document.getElementById("replaceAllBtn"),

        segmentParserTabBtn: document.getElementById("segmentParserTabBtn"),
        minecartParserTabBtn: document.getElementById("minecartParserTabBtn"),
        segmentParserTabPanel: document.getElementById("segmentParserTabPanel"),
        minecartParserTabPanel: document.getElementById("minecartParserTabPanel"),

        segmentInput: document.getElementById("segmentInput"),
        segmentOutput: document.getElementById("segmentOutput"),
        minecartChainInput: document.getElementById("minecartChainInput"),
        reverseInput: document.getElementById("reverseInput"),

        summonOutput: document.getElementById("summonOutput"),
        customOutput: document.getElementById("customOutput"),
        giveOutput: document.getElementById("giveOutput"),

        commandsContainer: document.getElementById("commandsContainer"),
        commandRowTemplate: document.getElementById("commandRowTemplate"),

        parseSegmentBtn: document.getElementById("parseSegmentBtn"),
        clearSegmentBtn: document.getElementById("clearSegmentBtn"),
        copySegmentBtn: document.getElementById("copySegmentBtn"),
        parseMinecartChainBtn: document.getElementById("parseMinecartChainBtn"),
        clearMinecartChainBtn: document.getElementById("clearMinecartChainBtn"),

        reverseParseBtn: document.getElementById("reverseParseBtn"),
        clearReverseBtn: document.getElementById("clearReverseBtn"),

        addCommandBtn: document.getElementById("addCommandBtn"),
        addCommandTopBtn: document.getElementById("addCommandTopBtn"),
        generateBtn: document.getElementById("generateBtn"),
        clearOutputBtn: document.getElementById("clearOutputBtn"),
        resetCommandsBtn: document.getElementById("resetCommandsBtn"),

        copySummonBtn: document.getElementById("copySummonBtn"),
        copyCustomBtn: document.getElementById("copyCustomBtn"),
        copyGiveBtn: document.getElementById("copyGiveBtn"),

        errorBox: document.getElementById("errorBox"),
        gradientStopTemplate: document.getElementById("gradientStopTemplate")
    };

    function setError(message) {
        if (!el.errorBox) return;
        if (message) {
            el.errorBox.textContent = message;
            el.errorBox.classList.remove("hidden");
        } else {
            el.errorBox.textContent = "";
            el.errorBox.classList.add("hidden");
        }
    }

    function copyText(text) {
        navigator.clipboard.writeText(text).catch(() => {
            const temp = document.createElement("textarea");
            temp.value = text;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand("copy");
            document.body.removeChild(temp);
        });
    }

    function mcEscapeString(s) {
        return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function mcUnescapeString(s) {
        const out = [];
        let i = 0;
        while (i < s.length) {
            const ch = s[i];
            if (ch === "\\" && i + 1 < s.length) {
                out.push(s[i + 1]);
                i += 2;
            } else {
                out.push(ch);
                i += 1;
            }
        }
        return out.join("");
    }

    function escapeSingleQuotedString(s) {
        return String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    }

    function unescapeSingleQuotedString(s) {
        const out = [];
        let i = 0;
        while (i < s.length) {
            const ch = s[i];
            if (ch === "\\" && i + 1 < s.length) {
                out.push(s[i + 1]);
                i += 2;
            } else {
                out.push(ch);
                i += 1;
            }
        }
        return out.join("");
    }

    function normalizeHexColor(value, fallback = "#ffffff") {
        if (!value) return fallback;

        let v = String(value).trim().toLowerCase();
        if (MINECRAFT_NAMED_COLORS[v]) return MINECRAFT_NAMED_COLORS[v];
        if (!v.startsWith("#")) v = `#${v}`;
        return /^#[0-9a-f]{6}$/.test(v) ? v : fallback;
    }

    function normalizeBareHex(value, fallback = "ffffff") {
        return normalizeHexColor(value, `#${fallback}`).replace("#", "").toLowerCase();
    }

    function clamp(num, min, max) {
        const n = Number(num);
        if (Number.isNaN(n)) return min;
        return Math.min(max, Math.max(min, n));
    }

    function argbHexToSignedDecimal(argbHex) {
        const normalized = String(argbHex).replace("#", "").toUpperCase();
        const unsigned = parseInt(normalized, 16) >>> 0;
        return unsigned > 0x7fffffff ? unsigned - 0x100000000 : unsigned;
    }

    function signedDecimalToArgbHex(value) {
        const n = Number(value);
        if (Number.isNaN(n)) return null;
        const unsigned = n < 0 ? 0x100000000 + n : n;
        return (unsigned >>> 0).toString(16).toUpperCase().padStart(8, "0");
    }

    function hexAndOpacityToShadowDecimal(hex, opacityPercent) {
        const colorHex = normalizeHexColor(hex, "#000000").replace("#", "").toUpperCase();
        const opacity = clamp(opacityPercent, 0, 100);
        const alpha = Math.round((opacity / 100) * 255)
            .toString(16)
            .toUpperCase()
            .padStart(2, "0");
        return argbHexToSignedDecimal(`${alpha}${colorHex}`);
    }

    function shadowDecimalToHexAndOpacity(raw) {
        if (raw === undefined || raw === null || raw === "") {
            return { hex: "#000000", opacity: 100 };
        }

        let argb = null;

        if (typeof raw === "number") {
            argb = signedDecimalToArgbHex(raw);
        } else if (typeof raw === "string") {
            const trimmed = raw.trim();
            if (/^-?\d+$/.test(trimmed)) {
                argb = signedDecimalToArgbHex(Number(trimmed));
            } else if (/^#?[0-9a-fA-F]{8}$/.test(trimmed)) {
                argb = trimmed.replace("#", "").toUpperCase();
            }
        }

        if (!argb || argb.length !== 8) {
            return { hex: "#000000", opacity: 100 };
        }

        const alpha = parseInt(argb.slice(0, 2), 16);
        return {
            hex: `#${argb.slice(2).toLowerCase()}`,
            opacity: Math.round((alpha / 255) * 100)
        };
    }

    function splitTopLevel(s, delimiter = ",") {
        const parts = [];
        let start = 0;
        let braceDepth = 0;
        let bracketDepth = 0;
        let quoteChar = null;
        let escaped = false;

        for (let i = 0; i < s.length; i += 1) {
            const ch = s[i];

            if (quoteChar !== null) {
                if (escaped) {
                    escaped = false;
                } else if (ch === "\\") {
                    escaped = true;
                } else if (ch === quoteChar) {
                    quoteChar = null;
                }
                continue;
            }

            if (ch === '"' || ch === "'") {
                quoteChar = ch;
                continue;
            }

            if (ch === "{") braceDepth += 1;
            if (ch === "}") braceDepth -= 1;
            if (ch === "[") bracketDepth += 1;
            if (ch === "]") bracketDepth -= 1;

            if (ch === delimiter && braceDepth === 0 && bracketDepth === 0) {
                parts.push(s.slice(start, i).trim());
                start = i + 1;
            }
        }

        const tail = s.slice(start).trim();
        if (tail) parts.push(tail);
        return parts;
    }

    function findMatching(s, startIndex, openChar, closeChar) {
        let depth = 0;
        let quoteChar = null;
        let escaped = false;

        for (let i = startIndex; i < s.length; i += 1) {
            const ch = s[i];

            if (quoteChar !== null) {
                if (escaped) {
                    escaped = false;
                } else if (ch === "\\") {
                    escaped = true;
                } else if (ch === quoteChar) {
                    quoteChar = null;
                }
                continue;
            }

            if (ch === '"' || ch === "'") {
                quoteChar = ch;
                continue;
            }

            if (ch === openChar) depth += 1;
            if (ch === closeChar) depth -= 1;
            if (depth === 0) return i;
        }

        throw new Error(`Could not find matching ${closeChar}.`);
    }

    function extractFieldValueFlexible(fieldName, s) {
        const patterns = [`${fieldName}:`, `${fieldName}=`];
        let start = -1;
        let matchedPattern = "";

        for (const pattern of patterns) {
            const idx = s.indexOf(pattern);
            if (idx !== -1 && (start === -1 || idx < start)) {
                start = idx;
                matchedPattern = pattern;
            }
        }

        if (start === -1) throw new Error(`Could not find field ${fieldName}.`);

        let i = start + matchedPattern.length;
        while (i < s.length && /\s/.test(s[i])) i += 1;
        if (i >= s.length) throw new Error(`Field ${fieldName} has no value.`);

        const first = s[i];

        if (first === '"' || first === "'") {
            const quote = first;
            i += 1;
            const out = [];
            let escaped = false;

            while (i < s.length) {
                const ch = s[i];
                if (escaped) {
                    out.push(ch);
                    escaped = false;
                } else if (ch === "\\") {
                    escaped = true;
                } else if (ch === quote) {
                    return out.join("");
                } else {
                    out.push(ch);
                }
                i += 1;
            }

            throw new Error(`Could not parse quoted value for field ${fieldName}.`);
        }

        if (first === "{") {
            const end = findMatching(s, i, "{", "}");
            return s.slice(i, end + 1);
        }

        if (first === "[") {
            const end = findMatching(s, i, "[", "]");
            return s.slice(i, end + 1);
        }

        let j = i;
        while (j < s.length && s[j] !== "," && s[j] !== "]" && s[j] !== "}") {
            j += 1;
        }

        return s.slice(i, j).trim();
    }

    function normalizeTopLevelEntries(raw) {
        return splitTopLevel(raw || "", ",")
            .map((part) => part.trim())
            .filter(Boolean);
    }

    function maybeWrapAtNamedPlayer(command, targetPlayer) {
        const cmd = String(command || "").trim();
        const lower = cmd.toLowerCase();
        const target = String(targetPlayer || "").trim();

        if (target && (lower.startsWith("setblock ") || lower.startsWith("summon "))) {
            return `execute at @a[name="${target}"] run ${cmd}`;
        }

        return cmd;
    }

    function maybeUnwrapNamedPlayer(command) {
        const cmd = String(command || "").trim();
        const prefix = 'execute at @a[name="';
        if (!cmd.startsWith(prefix)) return cmd;

        let i = prefix.length;
        while (i < cmd.length) {
            if (cmd[i] === '"' && i + 1 < cmd.length && cmd[i + 1] === "]") break;
            i += 1;
        }

        if (i >= cmd.length || i + 7 > cmd.length) return cmd;

        const remainder = cmd.slice(i + 2);
        if (!remainder.startsWith(" run ")) return cmd;

        const inner = remainder.slice(5);
        const innerLower = inner.toLowerCase();
        return innerLower.startsWith("setblock ") || innerLower.startsWith("summon ") ? inner : cmd;
    }

    function createCaretGuardNode() {
        return document.createTextNode(CARET_GUARD);
    }

    function isCaretGuardNode(node) {
        return node && node.nodeType === Node.TEXT_NODE && node.nodeValue === CARET_GUARD;
    }

    function ensureCaretGuardsAroundAtlas(node) {
        if (!node || !node.parentNode) return;

        if (!isCaretGuardNode(node.previousSibling)) {
            node.parentNode.insertBefore(createCaretGuardNode(), node);
        }

        if (!isCaretGuardNode(node.nextSibling)) {
            node.parentNode.insertBefore(createCaretGuardNode(), node.nextSibling);
        }
    }

    function removeAdjacentCaretGuards(node) {
        if (!node || !node.parentNode) return;
        if (isCaretGuardNode(node.previousSibling)) node.previousSibling.remove();
        if (isCaretGuardNode(node.nextSibling)) node.nextSibling.remove();
    }

    function hexToRgbObject(hex) {
        const normalized = normalizeHexColor(hex, "#ffffff").replace("#", "");
        return {
            r: parseInt(normalized.slice(0, 2), 16),
            g: parseInt(normalized.slice(2, 4), 16),
            b: parseInt(normalized.slice(4, 6), 16)
        };
    }

    function editorKeyToElement(key) {
        return key === "name" ? el.customNameEditor : el.loreEditor;
    }

    window.MCParser = window.MCParser || {};
    window.MCParser.core = {
        CLEANUP_COMMAND,
        MINECRAFT_NAMED_COLORS,
        ATLAS_DATA_SAFE,
        ATLAS_GROUPS_SAFE,
        SEARCH_ATLAS_SAFE,
        CARET_GUARD,
        state,
        el,
        setError,
        copyText,
        mcEscapeString,
        mcUnescapeString,
        escapeSingleQuotedString,
        unescapeSingleQuotedString,
        normalizeHexColor,
        normalizeBareHex,
        clamp,
        argbHexToSignedDecimal,
        signedDecimalToArgbHex,
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
        editorKeyToElement
    };
})();