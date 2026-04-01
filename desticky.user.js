// ==UserScript==
// @name         Desticky
// @namespace    https://gitlab.com/ajvant/userscripts
// @version      1.6.0
// @description  Make sticky/fixed elements non-sticky, but only on sites you enable
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    const MARKER_ATTRIBUTE = 'data-tm-unstick';
    const STYLE_ID = 'tm-unstick-style';
    const host = location.hostname;
    const stickyKey = `desticky:${host}`;
    const fixedKey = `defixed:${host}`;

    function isStickyEnabled() {
        return Boolean(GM_getValue(stickyKey, false));
    }

    function isFixedEnabled() {
        return Boolean(GM_getValue(fixedKey, false));
    }

    /**
     * Reload the page after changing site state.
     */
    function reloadPage() {
        location.reload();
    }

    /**
     * Ensure the stylesheet used to neutralize sticky elements exists.
     */
    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            [${MARKER_ATTRIBUTE}="1"] {
                position: static !important;
                top: auto !important;
                right: auto !important;
                bottom: auto !important;
                left: auto !important;
                inset: auto !important;
            }
        `;

        (document.head || document.documentElement).appendChild(style);
    }

    /**
     * Mark one element if its position is among the targeted types.
     *
     * @param {Element} element
     * @returns {boolean} True if newly marked.
     */
    function markIfSticky(element) {
        if (!(element instanceof Element)
            || element.getAttribute(MARKER_ATTRIBUTE) === '1') {
            return false;
        }

        const pos = window.getComputedStyle(element).position;

        if (!targetPositions.includes(pos)) {
            return false;
        }

        element.setAttribute(MARKER_ATTRIBUTE, '1');
        return true;
    }

    /**
     * Process one root element and all descendants.
     *
     * @param {Element} root
     * @returns {number} Number of elements newly marked.
     */
    function processSubtree(root) {
        let changed = 0;

        if (markIfSticky(root)) {
            changed += 1;
        }

        for (const element of root.querySelectorAll('*')) {
            if (markIfSticky(element)) {
                changed += 1;
            }
        }

        return changed;
    }

    /**
     * Register Tampermonkey menu commands.
     */
    function registerMenuCommands() {
        const sticky = isStickyEnabled();
        const fixed = isFixedEnabled();

        GM_registerMenuCommand(
            `${sticky ? '◉' : '○'} Desticky ${host}`,
            () => {
                GM_setValue(stickyKey, !sticky);
                reloadPage();
            }
        );

        GM_registerMenuCommand(
            `${fixed ? '◉' : '○'} Defixed ${host}`,
            () => {
                GM_setValue(fixedKey, !fixed);
                reloadPage();
            }
        );
    }

    const targetPositions = [
        ...(isStickyEnabled() ? ['sticky'] : []),
        ...(isFixedEnabled() ? ['fixed'] : []),
    ];

    registerMenuCommands();

    if (targetPositions.length === 0) {
        console.log(`Unstick disabled for ${host}.`);
        return;
    }

    ensureStyle();

    let totalChanged = processSubtree(document.documentElement);
    console.log(
        `Initial pass unstuck ${totalChanged} sticky element(s) on ${host}.`
    );

    const pendingRoots = new Set();
    let scheduled = false;

    /**
     * Schedule one batched flush of pending roots.
     */
    function scheduleFlush() {
        if (scheduled) {
            return;
        }

        scheduled = true;

        queueMicrotask(() => {
            scheduled = false;

            let changedThisRound = 0;

            for (const root of pendingRoots) {
                if (root.isConnected) {
                    changedThisRound += processSubtree(root);
                }
            }

            pendingRoots.clear();

            if (changedThisRound > 0) {
                totalChanged += changedThisRound;
                console.log(
                    `Unstuck ${changedThisRound} more sticky element(s) on ` +
                    `${host}; total ${totalChanged}.`
                );
            }
        });
    }

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node instanceof Element) {
                        pendingRoots.add(node);
                    }
                }
            } else if (mutation.type === 'attributes') {
                if (mutation.target instanceof Element) {
                    pendingRoots.add(mutation.target);
                }
            }
        }

        if (pendingRoots.size > 0) {
            scheduleFlush();
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
    });
}());
