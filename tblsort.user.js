// ==UserScript==
// @name         tblsort
// @namespace    https://github.com/andrew-vant/userscripts
// @version      0.0
// @description  Make HTML tables sortable by clicking column headers.
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  var s = document.createElement("style");
  s.textContent =
    "th[data-tblsort-dir] {\n" +
    "  cursor: pointer;\n" +
    "  user-select: none;\n" +
    "}\n" +
    "\n" +
    "th[data-tblsort-dir]::after {\n" +
    "  content: \" \\25B7\";\n" +
    "  opacity: 0.4;\n" +
    "}\n" +
    "\n" +
    "th[data-tblsort-dir=\"asc\"]::after {\n" +
    "  content: \" \\25B2\";\n" +
    "  opacity: 0.7;\n" +
    "}\n" +
    "\n" +
    "th[data-tblsort-dir=\"desc\"]::after {\n" +
    "  content: \" \\25BC\";\n" +
    "  opacity: 0.7;\n" +
    "}\n";
  document.head.appendChild(s);
})();

(function () {
  "use strict";

  function getCellValue(row, colIndex) {
    const cell = row.cells[colIndex];
    if (!cell) return "";
    const key = cell.getAttribute("data-sort");
    return key !== null ? key : cell.textContent.trim();
  }

  function compareValues(a, b) {
    // Empty strings sort low (before any value)
    if (a === "" && b === "") return 0;
    if (a === "") return -1;
    if (b === "") return 1;

    // Numbers: strip $, commas, %
    const cleanA = a.replace(/[$,%]/g, "");
    const cleanB = b.replace(/[$,%]/g, "");
    const numRe = /^-?\d+(\.\d+)?$/;
    if (numRe.test(cleanA) && numRe.test(cleanB)) {
      return parseFloat(cleanA) - parseFloat(cleanB);
    }

    // Dates -- require a digit so bare words like "Mar"
    // don't get misdetected as valid dates
    if (/\d/.test(a) && /\d/.test(b)) {
      const dateA = new Date(a);
      const dateB = new Date(b);
      if (!isNaN(dateA.getTime()) &&
          !isNaN(dateB.getTime())) {
        return dateA - dateB;
      }
    }

    // Fallback: locale-aware string compare
    return a.localeCompare(b);
  }

  function collectRows(table, headerRow) {
    const rows = [];
    const bodies = table.tBodies;
    for (let i = 0; i < bodies.length; i++) {
      const bRows = Array.from(bodies[i].rows);
      for (let j = 0; j < bRows.length; j++) {
        if (bRows[j] !== headerRow) {
          rows.push(bRows[j]);
        }
      }
    }
    return rows;
  }

  function applyRows(table, rows) {
    const target = table.tBodies[0];
    const frag = document.createDocumentFragment();
    rows.forEach(function (row) {
      frag.appendChild(row);
    });
    target.appendChild(frag);
  }

  function sortByColumn(table, tbody, colIndex, th) {
    const current = th.getAttribute("data-tblsort-dir");
    const dirs = { none: "asc", asc: "desc", desc: "none" };
    const dir = dirs[current] || "asc";

    // Reset sibling headers
    const headers = th.parentElement.querySelectorAll(
      "th[data-tblsort-dir]"
    );
    headers.forEach(function (h) {
      h.setAttribute("data-tblsort-dir", "none");
      h.removeAttribute("aria-sort");
    });
    th.setAttribute("data-tblsort-dir", dir);
    if (dir !== "none") {
      th.setAttribute(
        "aria-sort",
        dir === "asc" ? "ascending" : "descending"
      );
    }

    const headerRow = th.parentElement;
    if (dir === "none") {
      // Restore original order
      const rows = collectRows(table, headerRow);
      rows.sort(function (a, b) {
        return (a._tblsortIdx || 0) - (b._tblsortIdx || 0);
      });
      applyRows(table, rows);
      return;
    }

    const rows = collectRows(table, headerRow);
    rows.sort(function (rowA, rowB) {
      const a = getCellValue(rowA, colIndex);
      const b = getCellValue(rowB, colIndex);
      return compareValues(a, b);
    });
    if (dir === "desc") rows.reverse();
    applyRows(table, rows);
  }

  function buildColumnMap(thead) {
    const rows = thead.querySelectorAll("tr");
    if (rows.length === 0) return null;
    // Grid tracks occupied cells from rowspan/colspan
    const grid = [];
    for (let r = 0; r < rows.length; r++) {
      if (!grid[r]) grid[r] = [];
      let col = 0;
      const cells = rows[r].children;
      for (let c = 0; c < cells.length; c++) {
        while (grid[r][col]) col++;
        const cs = cells[c].colSpan || 1;
        const rs = cells[c].rowSpan || 1;
        // Mark this cell's grid position
        cells[c]._tblsortCol = col;
        for (let dr = 0; dr < rs; dr++) {
          if (!grid[r + dr]) grid[r + dr] = [];
          for (let dc = 0; dc < cs; dc++) {
            grid[r + dr][col + dc] = true;
          }
        }
        col += cs;
      }
    }
    // Return map for last header row's ths
    const lastRow = rows[rows.length - 1];
    const map = [];
    const ths = lastRow.children;
    for (let i = 0; i < ths.length; i++) {
      map.push(ths[i]._tblsortCol);
    }
    return map;
  }

  function setupTable(table) {
    if (table.getAttribute("data-tblsort-initialized")) {
      return;
    }

    // Find header row
    let headerRow = null;
    const thead = table.querySelector("thead");
    if (thead) {
      const rows = thead.querySelectorAll("tr");
      if (rows.length > 0) {
        headerRow = rows[rows.length - 1];
      }
    }

    if (!headerRow) {
      const firstRow = table.querySelector("tr");
      if (firstRow) {
        const children = firstRow.children;
        let allTh = true;
        for (let i = 0; i < children.length; i++) {
          if (children[i].tagName !== "TH") {
            allTh = false;
            break;
          }
        }
        if (allTh && children.length > 0) {
          headerRow = firstRow;
        }
      }
    }

    if (!headerRow) return;

    // Find the tbody to sort (browsers create an implicit
    // tbody even without one in markup)
    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    table.setAttribute("data-tblsort-initialized", "true");

    // Store original row order for restore-on-unsort
    let idx = 0;
    for (let b = 0; b < table.tBodies.length; b++) {
      const bRows = table.tBodies[b].rows;
      for (let r = 0; r < bRows.length; r++) {
        if (bRows[r] !== headerRow) {
          bRows[r]._tblsortIdx = idx++;
        }
      }
    }

    const colMap = thead ? buildColumnMap(thead) : null;
    const ths = headerRow.querySelectorAll("th");
    ths.forEach(function (th, i) {
      // Skip colspan headers
      if (th.colSpan > 1) return;

      const colIdx = colMap ? colMap[i] : th.cellIndex;
      th.setAttribute("data-tblsort-dir", "none");
      th.setAttribute("tabindex", "0");
      th.setAttribute("role", "columnheader");
      function doSort() {
        sortByColumn(table, tbody, colIdx, th);
      }
      th.addEventListener("click", doSort);
      th.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          doSort();
        }
      });
    });
  }

  function initTblsort() {
    const tables = document.querySelectorAll("table");
    tables.forEach(setupTable);
  }

  // Run on existing content
  initTblsort();

  // Watch for dynamically added tables (debounced)
  let pending = null;
  const observer = new MutationObserver(function (mutations) {
    const hasNew = mutations.some(function (m) {
      return m.addedNodes.length > 0;
    });
    if (hasNew && pending === null) {
      pending = setTimeout(function () {
        pending = null;
        initTblsort();
      }, 100);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
