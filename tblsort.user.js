// ==UserScript==
// @name         tblsort
// @namespace    https://gitlab.com/ajvant/userscripts
// @version      0.1
// @description  Make HTML tables sortable by clicking column headers.
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const host = location.hostname;
    const enabledKey = `enabled:${host}`;

    /**
     * Return whether tblsort is enabled for the current host.
     *
     * @returns {boolean}
     */
    function isEnabledForCurrentHost() {
        return Boolean(GM_getValue(enabledKey, false));
    }

    /**
     * Set whether tblsort is enabled for the current host.
     *
     * @param {boolean} enabled
     */
    function setEnabledForCurrentHost(enabled) {
        GM_setValue(enabledKey, enabled);
    }

    /**
     * Reload the page after changing site state.
     */
    function reloadPage() {
        location.reload();
    }

    /**
     * Register Tampermonkey menu commands.
     */
    function registerMenuCommands() {
        const enabled = isEnabledForCurrentHost();

        GM_registerMenuCommand(
            enabled
                ? `Disable tblsort on ${host}`
                : `Enable tblsort on ${host}`,
            () => {
                setEnabledForCurrentHost(!enabled);
                reloadPage();
            }
        );

        GM_registerMenuCommand('Enable tblsort on all sites', () => {
            GM_setValue('enabled:*', true);
            reloadPage();
        });

        GM_registerMenuCommand('Disable tblsort on all sites', () => {
            GM_setValue('enabled:*', false);
            reloadPage();
        });
    }

    /**
     * Return whether script should run on this host.
     *
     * @returns {boolean}
     */
    function shouldRun() {
        const globalEnabled = Boolean(GM_getValue('enabled:*', false));
        const hostEnabled = isEnabledForCurrentHost();
        return globalEnabled || hostEnabled;
    }

    /**
     * Ensure the sort indicator stylesheet exists.
     */
    function ensureStyle() {
        if (document.getElementById('tm-tblsort-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'tm-tblsort-style';
        style.textContent = `
            th[data-tblsort-dir] {
                cursor: pointer;
                user-select: none;
            }

            th[data-tblsort-dir]::after {
                content: " \\25B7";
                opacity: 0.4;
            }

            th[data-tblsort-dir="asc"]::after {
                content: " \\25B2";
                opacity: 0.7;
            }

            th[data-tblsort-dir="desc"]::after {
                content: " \\25BC";
                opacity: 0.7;
            }
        `;
        document.head.appendChild(style);
    }

    function getCellValue(row, colIndex) {
        const cell = row.cells[colIndex];
        if (!cell) {
            return '';
        }

        const key = cell.getAttribute('data-sort');
        return key !== null ? key : cell.textContent.trim();
    }

    function compareValues(a, b) {
        // Empty strings sort low (before any value)
        if (a === '' && b === '') {
            return 0;
        }

        if (a === '') {
            return -1;
        }

        if (b === '') {
            return 1;
        }

        // Numbers: strip $, commas, %
        const cleanA = a.replace(/[$,%]/g, '');
        const cleanB = b.replace(/[$,%]/g, '');
        const numRe = /^-?\d+(\.\d+)?$/;

        if (numRe.test(cleanA) && numRe.test(cleanB)) {
            return parseFloat(cleanA) - parseFloat(cleanB);
        }

        // Dates -- require a digit so bare words like "Mar"
        // don't get misdetected as valid dates
        if (/\d/.test(a) && /\d/.test(b)) {
            const dateA = new Date(a);
            const dateB = new Date(b);

            if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
                return dateA - dateB;
            }
        }

        // Fallback: locale-aware string compare
        return a.localeCompare(b);
    }

    function collectRows(table, headerRow) {
        const rows = [];
        const bodies = table.tBodies;

        for (let i = 0; i < bodies.length; i += 1) {
            const bodyRows = Array.from(bodies[i].rows);

            for (let j = 0; j < bodyRows.length; j += 1) {
                if (bodyRows[j] !== headerRow) {
                    rows.push(bodyRows[j]);
                }
            }
        }

        return rows;
    }

    function applyRows(table, rows) {
        const target = table.tBodies[0];
        const fragment = document.createDocumentFragment();

        rows.forEach((row) => {
            fragment.appendChild(row);
        });

        target.appendChild(fragment);
    }

    function sortByColumn(table, colIndex, th) {
        const current = th.getAttribute('data-tblsort-dir');
        const dirs = { none: 'asc', asc: 'desc', desc: 'none' };
        const dir = dirs[current] || 'asc';

        // Reset sibling headers
        const headers = th.parentElement.querySelectorAll(
            'th[data-tblsort-dir]'
        );

        headers.forEach((header) => {
            header.setAttribute('data-tblsort-dir', 'none');
            header.removeAttribute('aria-sort');
        });

        th.setAttribute('data-tblsort-dir', dir);

        if (dir !== 'none') {
            th.setAttribute(
                'aria-sort',
                dir === 'asc' ? 'ascending' : 'descending'
            );
        }

        const headerRow = th.parentElement;

        if (dir === 'none') {
            // Restore original order
            const rows = collectRows(table, headerRow);
            rows.sort((rowA, rowB) => {
                return (rowA._tblsortIdx || 0) - (rowB._tblsortIdx || 0);
            });
            applyRows(table, rows);
            return;
        }

        const rows = collectRows(table, headerRow);
        rows.sort((rowA, rowB) => {
            const valueA = getCellValue(rowA, colIndex);
            const valueB = getCellValue(rowB, colIndex);
            return compareValues(valueA, valueB);
        });

        if (dir === 'desc') {
            rows.reverse();
        }

        applyRows(table, rows);
    }

    function buildColumnMap(thead) {
        const rows = thead.querySelectorAll('tr');

        if (rows.length === 0) {
            return null;
        }

        // Grid tracks occupied cells from rowspan/colspan
        const grid = [];

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            if (!grid[rowIndex]) {
                grid[rowIndex] = [];
            }

            let colIndex = 0;
            const cells = rows[rowIndex].children;

            for (let cellIndex = 0; cellIndex < cells.length;
                cellIndex += 1) {
                while (grid[rowIndex][colIndex]) {
                    colIndex += 1;
                }

                const colSpan = cells[cellIndex].colSpan || 1;
                const rowSpan = cells[cellIndex].rowSpan || 1;

                // Mark this cell's grid position
                cells[cellIndex]._tblsortCol = colIndex;

                for (let rowOffset = 0; rowOffset < rowSpan;
                    rowOffset += 1) {
                    if (!grid[rowIndex + rowOffset]) {
                        grid[rowIndex + rowOffset] = [];
                    }

                    for (let colOffset = 0; colOffset < colSpan;
                        colOffset += 1) {
                        grid[rowIndex + rowOffset][colIndex + colOffset] =
                            true;
                    }
                }

                colIndex += colSpan;
            }
        }

        // Return map for last header row's ths
        const lastRow = rows[rows.length - 1];
        const map = [];
        const headers = lastRow.children;

        for (let i = 0; i < headers.length; i += 1) {
            map.push(headers[i]._tblsortCol);
        }

        return map;
    }

    function setupTable(table) {
        if (table.getAttribute('data-tblsort-initialized')) {
            return;
        }

        // Find header row
        let headerRow = null;
        const thead = table.querySelector('thead');

        if (thead) {
            const rows = thead.querySelectorAll('tr');

            if (rows.length > 0) {
                headerRow = rows[rows.length - 1];
            }
        }

        if (!headerRow) {
            const firstRow = table.querySelector('tr');

            if (firstRow) {
                const children = firstRow.children;
                let allTh = true;

                for (let i = 0; i < children.length; i += 1) {
                    if (children[i].tagName !== 'TH') {
                        allTh = false;
                        break;
                    }
                }

                if (allTh && children.length > 0) {
                    headerRow = firstRow;
                }
            }
        }

        if (!headerRow) {
            return;
        }

        // Find the tbody to sort (browsers create an implicit
        // tbody even without one in markup)
        if (!table.querySelector('tbody')) {
            return;
        }

        table.setAttribute('data-tblsort-initialized', 'true');

        // Store original row order for restore-on-unsort
        let idx = 0;

        for (let bodyIndex = 0; bodyIndex < table.tBodies.length;
            bodyIndex += 1) {
            const bodyRows = table.tBodies[bodyIndex].rows;

            for (let rowIndex = 0; rowIndex < bodyRows.length;
                rowIndex += 1) {
                if (bodyRows[rowIndex] !== headerRow) {
                    bodyRows[rowIndex]._tblsortIdx = idx;
                    idx += 1;
                }
            }
        }

        const colMap = thead ? buildColumnMap(thead) : null;
        const headers = headerRow.querySelectorAll('th');

        headers.forEach((th, i) => {
            // Skip colspan headers
            if (th.colSpan > 1) {
                return;
            }

            const colIdx = colMap ? colMap[i] : th.cellIndex;
            th.setAttribute('data-tblsort-dir', 'none');
            th.setAttribute('tabindex', '0');
            th.setAttribute('role', 'columnheader');

            function doSort() {
                sortByColumn(table, colIdx, th);
            }

            th.addEventListener('click', doSort);
            th.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    doSort();
                }
            });
        });
    }

    function initTblsort() {
        const tables = document.querySelectorAll('table');
        tables.forEach(setupTable);
    }

    registerMenuCommands();

    if (!shouldRun()) {
        console.log(`tblsort disabled for ${host}.`);
        return;
    }

    ensureStyle();

    // Run on existing content
    initTblsort();

    // Watch for dynamically added tables (debounced)
    let pending = null;
    const observer = new MutationObserver((mutations) => {
        const hasNew = mutations.some((mutation) => {
            return mutation.addedNodes.length > 0;
        });

        if (hasNew && pending === null) {
            pending = setTimeout(() => {
                pending = null;
                initTblsort();
            }, 100);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}());
