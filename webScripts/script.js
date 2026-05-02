(function () {
    "use strict";

    function requireModule(name) {
        const mod = window.MCParser && window.MCParser[name];
        if (!mod) {
            throw new Error(`MCParser module missing: ${name}`);
        }
        return mod;
    }

    const Core = requireModule("core");
    const Editor = requireModule("editor");
    const Color = requireModule("color");
    const AtlasParser = requireModule("atlasParser");

    function bindPlainTextPaste(editor, singleLine) {
        editor.addEventListener("paste", (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData("text/plain");
            const normalized = singleLine
                ? text.replace(/[\r\n]+/g, " ")
                : text.replace(/\r\n/g, "\n");
            document.execCommand("insertText", false, normalized);
        });
    }

    function bindSelectionToolbar(editorKey, config) {
        const editor = Core.editorKeyToElement(editorKey);

        function saveBothSelections() {
            Color.saveSelectionForEditor(editorKey);
            AtlasParser.saveSelectionForEditor(editorKey);
        }

        function updateButtonStates() {
            const mappings = [
                [config.boldBtn, "bold"],
                [config.italicBtn, "italic"],
                [config.underlineBtn, "underlined"],
                [config.strikethroughBtn, "strikethrough"]
            ];

            mappings.forEach(([btn, key]) => {
                const isOn = Editor.selectionHasStyle(editorKey, key);
                btn.classList.toggle("active", isOn);
                btn.style.color = isOn ? "#8ecbff" : "";
            });

            config.clearBtn.classList.remove("active");
            config.clearBtn.style.color = "";
        }

        editor.addEventListener("mouseup", () => {
            saveBothSelections();
            updateButtonStates();
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
                "PageDown",
                "Backspace",
                "Delete"
            ]);

            if (navKeys.has(e.key)) {
                saveBothSelections();
                updateButtonStates();
            }
        });

        editor.addEventListener("focus", () => {
            Core.state.focusedEditorKey = editorKey;
            updateButtonStates();
        });

        [config.boldBtn, config.italicBtn, config.underlineBtn, config.strikethroughBtn, config.clearBtn]
            .forEach((btn) => {
                btn.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                });
            });

        config.boldBtn.addEventListener("click", () => {
            saveBothSelections();
            Editor.toggleInlineStyle(editorKey, "bold");
            setTimeout(updateButtonStates, 0);
        });

        config.italicBtn.addEventListener("click", () => {
            saveBothSelections();
            Editor.toggleInlineStyle(editorKey, "italic");
            setTimeout(updateButtonStates, 0);
        });

        config.underlineBtn.addEventListener("click", () => {
            saveBothSelections();
            Editor.toggleInlineStyle(editorKey, "underlined");
            setTimeout(updateButtonStates, 0);
        });

        config.strikethroughBtn.addEventListener("click", () => {
            saveBothSelections();
            Editor.toggleInlineStyle(editorKey, "strikethrough");
            setTimeout(updateButtonStates, 0);
        });

        config.clearBtn.addEventListener("click", () => {
            saveBothSelections();
            Editor.clearSelectionFormatting(editorKey);
            setTimeout(updateButtonStates, 0);
        });

        config.colorBtn.addEventListener("mousedown", (e) => e.preventDefault());
        config.colorBtn.addEventListener("click", () => {
            saveBothSelections();
            updateButtonStates();
            Color.openColorModal(editorKey);
        });

        config.atlasBtn.addEventListener("mousedown", (e) => e.preventDefault());
        config.atlasBtn.addEventListener("click", () => {
            saveBothSelections();
            updateButtonStates();
            AtlasParser.openAtlasModalForInsert(editorKey);
        });
    }

    function setParserToolTab(tab) {
        const { el } = Core;

        const isSegment = tab === "segment";

        el.segmentParserTabBtn.classList.toggle("active", isSegment);
        el.minecartParserTabBtn.classList.toggle("active", !isSegment);

        el.segmentParserTabPanel.classList.toggle("active", isSegment);
        el.minecartParserTabPanel.classList.toggle("active", !isSegment);
    }

    function bindParserButtons() {
        const { el } = Core;

        el.segmentParserTabBtn.addEventListener("click", () => {
            setParserToolTab("segment");
        });

        el.minecartParserTabBtn.addEventListener("click", () => {
            setParserToolTab("minecart");
        });

        el.parseSegmentBtn.addEventListener("click", () => {
            el.segmentOutput.value = Core.mcEscapeString(el.segmentInput.value || "");
        });

        el.clearSegmentBtn.addEventListener("click", () => {
            el.segmentInput.value = "";
            el.segmentOutput.value = "";
        });

        el.copySegmentBtn.addEventListener("click", () => {
            Core.copyText(el.segmentOutput.value || "");
        });

        el.parseMinecartChainBtn.addEventListener("click", () => {
            try {
                AtlasParser.reverseParseMinecartChain(el.minecartChainInput.value || "");
                Core.setError("");
            } catch (err) {
                Core.setError(err && err.message ? err.message : String(err));
            }
        });

        el.clearMinecartChainBtn.addEventListener("click", () => {
            el.minecartChainInput.value = "";
        });

        el.reverseParseBtn.addEventListener("click", () => {
            try {
                AtlasParser.reverseParseGiveCommand(el.reverseInput.value || "");
                Core.setError("");
            } catch (err) {
                Core.setError(err && err.message ? err.message : String(err));
            }
        });

        el.clearReverseBtn.addEventListener("click", () => {
            el.reverseInput.value = "";
        });
    }

    function bindCommandButtons() {
        const { el, state } = Core;

        el.addCommandBtn.addEventListener("click", () => {
            state.commands.push("");
            AtlasParser.renderCommandRows();
        });

        el.addCommandTopBtn.addEventListener("click", () => {
            state.commands.unshift("");
            AtlasParser.renderCommandRows();
        });

        el.resetCommandsBtn.addEventListener("click", () => {
            state.commands = ["", ""];
            AtlasParser.renderCommandRows();
        });

        el.replaceAllBtn.addEventListener("click", () => {
            AtlasParser.replaceAllCommands(el.findAllInput.value, el.replaceAllInput.value);
        });

        el.generateBtn.addEventListener("click", () => {
            AtlasParser.generateOutputs();
        });

        el.clearOutputBtn.addEventListener("click", () => {
            el.summonOutput.value = "";
            el.customOutput.value = "";
            el.giveOutput.value = "";
        });

        el.copySummonBtn.addEventListener("click", () => {
            Core.copyText(el.summonOutput.value || "");
        });

        el.copyCustomBtn.addEventListener("click", () => {
            Core.copyText(el.customOutput.value || "");
        });

        el.copyGiveBtn.addEventListener("click", () => {
            Core.copyText(el.giveOutput.value || "");
        });
    }

    function bindGlobalModalClose() {
        const { el } = Core;

        el.closeColorModalBtn.addEventListener("click", Color.closeColorModal);
        el.colorModalBackdrop.addEventListener("click", (e) => {
            if (e.target === el.colorModalBackdrop) {
                Color.closeColorModal();
            }
        });

        el.closeAtlasModalBtn.addEventListener("click", AtlasParser.closeAtlasModal);
        el.atlasModalBackdrop.addEventListener("click", (e) => {
            if (e.target === el.atlasModalBackdrop) {
                AtlasParser.closeAtlasModal();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape") return;

            if (!el.colorModalBackdrop.classList.contains("hidden")) {
                Color.closeColorModal();
            }

            if (!el.atlasModalBackdrop.classList.contains("hidden")) {
                AtlasParser.closeAtlasModal();
            }
        });
    }

    function bindColorModal() {
        const { el, state } = Core;

        el.textColorTabBtn.addEventListener("click", () => {
            Color.setModalActiveTab("text");
        });

        el.shadowColorTabBtn.addEventListener("click", () => {
            Color.setModalActiveTab("shadow");
        });

        el.addTextGradientStopBtn.addEventListener("click", () => {
            state.colorModal.textStops.push(
                state.colorModal.textStops[state.colorModal.textStops.length - 1] || "ffffff"
            );
            Color.renderGradientStops("text");
            Color.updateColorModalSelectionPreview();
        });

        el.addShadowGradientStopBtn.addEventListener("click", () => {
            state.colorModal.shadowStops.push(
                state.colorModal.shadowStops[state.colorModal.shadowStops.length - 1] || "000000"
            );
            Color.renderGradientStops("shadow");
            Color.updateColorModalSelectionPreview();
        });

        el.modalShadowOpacityInput.addEventListener("input", () => {
            state.colorModal.shadowOpacity = Core.clamp(el.modalShadowOpacityInput.value, 0, 100);
            Color.updateColorModalSelectionPreview();
        });

        el.applyColorModalBtn.addEventListener("mousedown", (e) => e.preventDefault());
        el.applyColorModalBtn.addEventListener("click", () => {
            if (!state.colorModal.editorKey) {
                Color.closeColorModal();
                return;
            }

            Editor.applyGradientToSelection(
                state.colorModal.editorKey,
                state.colorModal.textStops,
                state.colorModal.shadowStops,
                Core.clamp(el.modalShadowOpacityInput.value, 0, 100)
            );

            Color.closeColorModal();
        });
    }

    function bindAtlasModal() {
        const { el, state } = Core;

        el.atlasTabBtn.addEventListener("click", () => {
            AtlasParser.setAtlasMainTab("atlas");
        });

        el.atlasFormattingTabBtn.addEventListener("click", () => {
            AtlasParser.setAtlasMainTab("formatting");
        });

        el.atlasTextColorTabBtn.addEventListener("click", () => {
            AtlasParser.setAtlasColorTab("text");
        });

        el.atlasShadowColorTabBtn.addEventListener("click", () => {
            AtlasParser.setAtlasColorTab("shadow");
        });

        el.atlasCategorySelect.addEventListener("change", () => {
            state.atlasModal.selectedAtlasGroup = el.atlasCategorySelect.value;
            state.atlasModal.selectedAtlasSprite = "";

            el.atlasPickerSearchInput.value = "";
            el.atlasPickerDropdown.style.display = "none";
            el.atlasPickerDisplay.setAttribute("aria-expanded", "false");

            AtlasParser.updateAtlasPickerList();
            AtlasParser.updateAtlasSelectedUi();
            AtlasParser.updateAtlasModalPreview();
        });

        el.atlasPickerSearchInput.addEventListener("input", () => {
            AtlasParser.updateAtlasPickerList();
        });

        el.atlasPickerDisplay.addEventListener("click", () => {
            const isOpen = el.atlasPickerDropdown.style.display === "block";
            const nextOpen = !isOpen;

            el.atlasPickerDropdown.style.display = nextOpen ? "block" : "none";
            el.atlasPickerDisplay.setAttribute("aria-expanded", nextOpen ? "true" : "false");

            if (nextOpen) {
                requestAnimationFrame(() => {
                    el.atlasPickerSearchInput.focus();
                    el.atlasPickerSearchInput.select();
                });
            }
        });

        document.addEventListener("click", (e) => {
            if (
                el.atlasPickerDropdown &&
                !el.atlasPickerDropdown.contains(e.target) &&
                e.target !== el.atlasPickerDisplay &&
                !el.atlasPickerDisplay.contains(e.target)
            ) {
                el.atlasPickerDropdown.style.display = "none";
                el.atlasPickerDisplay.setAttribute("aria-expanded", "false");
            }
        });

        el.atlasBoldBtn.addEventListener("click", () => {
            state.atlasModal.bold = !state.atlasModal.bold;
            AtlasParser.updateAtlasModalPreview();
        });

        el.atlasItalicBtn.addEventListener("click", () => {
            state.atlasModal.italic = !state.atlasModal.italic;
            AtlasParser.updateAtlasModalPreview();
        });

        el.atlasUnderlineBtn.addEventListener("click", () => {
            state.atlasModal.underlined = !state.atlasModal.underlined;
            AtlasParser.updateAtlasModalPreview();
        });

        el.atlasStrikethroughBtn.addEventListener("click", () => {
            state.atlasModal.strikethrough = !state.atlasModal.strikethrough;
            AtlasParser.updateAtlasModalPreview();
        });

        el.atlasClearFormattingBtn.addEventListener("click", () => {
            state.atlasModal.bold = false;
            state.atlasModal.italic = false;
            state.atlasModal.underlined = false;
            state.atlasModal.strikethrough = false;
            state.atlasModal.colorStops = ["ffffff"];
            state.atlasModal.shadowStops = ["000000"];
            state.atlasModal.shadowOpacity = 100;
            AtlasParser.renderAtlasGradientStops("text");
            AtlasParser.renderAtlasGradientStops("shadow");
            AtlasParser.updateAtlasModalPreview();
        });

        el.atlasModalShadowOpacityInput.addEventListener("input", () => {
            state.atlasModal.shadowOpacity = Core.clamp(el.atlasModalShadowOpacityInput.value, 0, 100);
            state.atlasModal.shadowEnabled = true;
            AtlasParser.updateAtlasModalPreview();
        });

        el.insertAtlasBtn.addEventListener("click", () => {
            AtlasParser.insertOrUpdateAtlasFromModal();
        });

        el.deleteAtlasBtn.addEventListener("click", () => {
            AtlasParser.deleteAtlasFromModal();
        });
    }

    function init() {
        if (Core.el.cmdStorageMode) {
            Core.el.cmdStorageMode.addEventListener("change", () => {
                const mode = Core.el.cmdStorageMode.value;
                const isDirect = mode === "direct_cmd";

                if (Core.el.addCommandBtn) {
                    Core.el.addCommandBtn.style.display = isDirect ? "none" : "";
                }

                if (Core.el.addCommandTopBtn) {
                    Core.el.addCommandTopBtn.style.display = isDirect ? "none" : "";
                }

                if (mode === "direct_cmd") {
                    const firstNonEmpty =
                        Core.state.commands.find((cmd) => String(cmd || "").trim()) || "";

                    Core.state.commands = [firstNonEmpty];
                    Core.setError("");
                } else {
                    if (Core.state.commands.length === 0) {
                        Core.state.commands = ["", ""];
                    } else if (Core.state.commands.length === 1) {
                        Core.state.commands.push("");
                    }
                    Core.setError("");
                }

                AtlasParser.renderCommandRows();
            });
        }

        Editor.bindEditorTypingBehavior("name");
        Editor.bindEditorTypingBehavior("lore");

        bindSelectionToolbar("name", {
            boldBtn: Core.el.nameBoldBtn,
            italicBtn: Core.el.nameItalicBtn,
            underlineBtn: Core.el.nameUnderlineBtn,
            strikethroughBtn: Core.el.nameStrikethroughBtn,
            clearBtn: Core.el.nameClearStyleBtn,
            colorBtn: Core.el.openNameColorModalBtn,
            atlasBtn: Core.el.openNameAtlasModalBtn
        });

        bindSelectionToolbar("lore", {
            boldBtn: Core.el.loreBoldBtn,
            italicBtn: Core.el.loreItalicBtn,
            underlineBtn: Core.el.loreUnderlineBtn,
            strikethroughBtn: Core.el.loreStrikethroughBtn,
            clearBtn: Core.el.loreClearStyleBtn,
            colorBtn: Core.el.openLoreColorModalBtn,
            atlasBtn: Core.el.openLoreAtlasModalBtn
        });

        bindParserButtons();
        bindCommandButtons();

        if (Core.el.cmdStorageMode) {
            const isDirect = Core.el.cmdStorageMode.value === "direct_cmd";

            if (Core.el.addCommandBtn) {
                Core.el.addCommandBtn.style.display = isDirect ? "none" : "";
            }

            if (Core.el.addCommandTopBtn) {
                Core.el.addCommandTopBtn.style.display = isDirect ? "none" : "";
            }
        }

        bindGlobalModalClose();
        bindColorModal();
        bindAtlasModal();

        AtlasParser.populateAtlasGroupSelect();
        AtlasParser.resetAtlasModalState();
        Core.el.atlasCategorySelect.value =
            Core.state.atlasModal.selectedAtlasGroup || AtlasParser.getDefaultAtlasGroup();

        AtlasParser.renderCommandRows();
        Color.renderGradientStops("text");
        Color.renderGradientStops("shadow");
        AtlasParser.renderAtlasGradientStops("text");
        AtlasParser.renderAtlasGradientStops("shadow");
        AtlasParser.updateAtlasPickerList();
        AtlasParser.updateAtlasSelectedUi();
        AtlasParser.updateAtlasModalPreview();
    }

    init();
})();