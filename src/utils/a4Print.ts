export type A4Orientation = 'landscape' | 'portrait';
export type A4MarginMm = 5 | 8 | 12;
export type A4ScaleMode = 'auto' | 100 | 90 | 85 | 80 | 75 | 70;
export type A4ColorMode = 'color' | 'grayscale';
export type A4PeoplePerPage = 8 | 6 | 10 | 0;
export type A4RenderMode = 'print' | 'preview' | 'standalone';

export interface A4PrintOptions {
  title: string;
  orientation: A4Orientation;
  marginMm: A4MarginMm;
  scaleMode: A4ScaleMode;
  colorMode: A4ColorMode;
  peoplePerPage: A4PeoplePerPage;
}

export const DEFAULT_A4_PRINT_OPTIONS: A4PrintOptions = {
  title: 'เอกสารตารางเวร A4',
  orientation: 'landscape',
  marginMm: 8,
  scaleMode: 'auto',
  colorMode: 'color',
  peoplePerPage: 8,
};

const PX_PER_MM = 96 / 25.4; // Standard CSS pixel density (3.7795275591 px/mm)

/**
 * Returns the printable inner width in CSS pixels for A4 paper given orientation and margins.
 */
export function getA4PrintableWidthPx(orientation: A4Orientation, marginMm: A4MarginMm): number {
  const pageWidthMm = orientation === 'landscape' ? 297 : 210;
  const printableMm = Math.max(100, pageWidthMm - marginMm * 2);
  return Math.floor(printableMm * PX_PER_MM);
}

/**
 * Returns the printable inner height in CSS pixels for A4 paper given orientation and margins.
 */
export function getA4PrintableHeightPx(orientation: A4Orientation, marginMm: A4MarginMm): number {
  const pageHeightMm = orientation === 'landscape' ? 210 : 297;
  const printableMm = Math.max(100, pageHeightMm - marginMm * 2);
  return Math.floor(printableMm * PX_PER_MM);
}

/**
 * Deep-clones the target printable container and transforms interactive controls into crisp print nodes:
 * - Removes `.no-print` elements
 * - Unhides `.print-only` elements
 * - Replaces `<input>` fields (like the 16pt top-right header note) with clean static text divs
 * - Expands overflow containers and removes sticky positioning so nothing clips on paper
 */
export function preparePrintableCloneElement(sourceEl: HTMLElement): HTMLElement {
  const clone = sourceEl.cloneNode(true) as HTMLElement;

  // Sync live values of inputs/textareas into clean static text blocks
  const origInputs = Array.from(sourceEl.querySelectorAll('input, textarea'));
  const cloneInputs = Array.from(clone.querySelectorAll('input, textarea'));

  cloneInputs.forEach((cloneInput, idx) => {
    const orig = origInputs[idx] as HTMLInputElement | HTMLTextAreaElement | undefined;
    if (!orig) return;
    if (orig instanceof HTMLInputElement && (orig.type === 'checkbox' || orig.type === 'radio')) {
      cloneInput.remove();
      return;
    }

    const value = orig.value.trim();
    if (!value) {
      cloneInput.remove();
      return;
    }

    const staticText = document.createElement('div');
    staticText.textContent = value;
    // Preserve typographic classes (e.g. doc-corner-note, font-bold, text-right) while removing input chrome
    const cleanedClass = (cloneInput.getAttribute('class') || '')
      .split(/\s+/)
      .filter(
        (cls) =>
          cls &&
          !cls.startsWith('border') &&
          !cls.startsWith('bg-') &&
          !cls.startsWith('hover:') &&
          !cls.startsWith('focus:') &&
          !cls.startsWith('placeholder:') &&
          !cls.startsWith('ring'),
      )
      .join(' ');
    staticText.className = `${cleanedClass} whitespace-pre-wrap break-words`;
    cloneInput.replaceWith(staticText);
  });

  // Remove screen-only elements
  clone.querySelectorAll('.no-print').forEach((el) => el.remove());

  // Reveal print-only elements explicitly
  clone.querySelectorAll('.print-only').forEach((el) => {
    el.classList.remove('hidden');
    (el as HTMLElement).style.display = 'block';
  });

  // Ensure overflow containers expand completely without scrollbars or clipping
  clone.querySelectorAll('.overflow-x-auto, .overflow-hidden').forEach((el) => {
    (el as HTMLElement).style.overflow = 'visible';
  });

  // Remove sticky headers/cells inside tables so printed cells align accurately
  clone.querySelectorAll('.sticky').forEach((el) => {
    (el as HTMLElement).style.position = 'static';
  });

  // Remove manual Ctrl+P break classes inside paginated A4 pages so explicit .a4-sheet-page controls breaks
  clone.querySelectorAll('.print-page-break-before').forEach((el) => {
    el.classList.remove('print-page-break-before');
  });

  // Normalize outer card wrapper styling for crisp white A4 paper
  clone.style.border = 'none';
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  clone.style.padding = '0';
  clone.style.margin = '0';
  clone.style.background = '#ffffff';
  clone.style.overflow = 'visible';

  return clone;
}

export function preparePrintableCloneHtml(sourceEl: HTMLElement): string {
  return preparePrintableCloneElement(sourceEl).outerHTML;
}

export interface PaginatedA4PageItem {
  pageNumber: number;
  startPerson: number;
  endPerson: number;
  html: string;
}

export interface PaginatedA4Result {
  pages: PaginatedA4PageItem[];
  totalPages: number;
  totalPeople: number;
}

/**
 * Splits a printable table sheet into explicit A4 pages containing up to `peoplePerPage` people per sheet
 * (default 8 people per A4 page). Repeats the official document header and table `<thead>` on every page,
 * keeps each person's multi-row block together, and places grand totals (`[data-print-total-row]` / `<tfoot>`)
 * and signature blocks (`[data-print-footer]`) cleanly on the final page.
 */
export function buildPaginatedPrintablePages(
  sourceEl: HTMLElement,
  peoplePerPage: A4PeoplePerPage = 8,
): PaginatedA4Result {
  const baseClone = preparePrintableCloneElement(sourceEl);
  const table = baseClone.querySelector('table.doc-table');
  const tbody = table?.querySelector('tbody');

  if (!table || !tbody) {
    return {
      pages: [{ pageNumber: 1, startPerson: 0, endPerson: 0, html: baseClone.outerHTML }],
      totalPages: 1,
      totalPeople: 0,
    };
  }

  const groupIds: string[] = [];
  const seenGroups = new Set<string>();
  tbody.querySelectorAll('tr[data-person-group]').forEach((tr) => {
    const gid = tr.getAttribute('data-person-group');
    if (gid !== null && !seenGroups.has(gid)) {
      seenGroups.add(gid);
      groupIds.push(gid);
    }
  });

  const totalPeople = groupIds.length;

  // If pagination is disabled (0) or all staff already fit in a single chunk, return 1 page
  if (peoplePerPage <= 0 || totalPeople === 0 || totalPeople <= peoplePerPage) {
    return {
      pages: [
        {
          pageNumber: 1,
          startPerson: totalPeople > 0 ? 1 : 0,
          endPerson: totalPeople,
          html: baseClone.outerHTML,
        },
      ],
      totalPages: 1,
      totalPeople,
    };
  }

  const chunks: string[][] = [];
  for (let i = 0; i < groupIds.length; i += peoplePerPage) {
    chunks.push(groupIds.slice(i, i + peoplePerPage));
  }

  const totalPages = chunks.length;
  const pages: PaginatedA4PageItem[] = chunks.map((chunk, pageIdx) => {
    const isLastPage = pageIdx === totalPages - 1;
    const allowedSet = new Set(chunk);
    const pageClone = baseClone.cloneNode(true) as HTMLElement;
    const pageTable = pageClone.querySelector('table.doc-table');
    const pageTbody = pageTable?.querySelector('tbody');

    if (pageTbody) {
      Array.from(pageTbody.querySelectorAll('tr')).forEach((tr) => {
        const gid = tr.getAttribute('data-person-group');
        const isTotalRow = tr.getAttribute('data-print-total-row') === 'true';

        if (gid !== null) {
          if (!allowedSet.has(gid)) {
            tr.remove();
          }
        } else if (isTotalRow && !isLastPage) {
          tr.remove();
        }
      });
    }

    if (!isLastPage) {
      pageTable?.querySelectorAll('tfoot').forEach((tf) => tf.remove());
      pageClone.querySelectorAll('[data-print-footer="true"]').forEach((ft) => ft.remove());
    }

    const startPerson = pageIdx * peoplePerPage + 1;
    const endPerson = Math.min(totalPeople, startPerson + chunk.length - 1);

    return {
      pageNumber: pageIdx + 1,
      startPerson,
      endPerson,
      html: pageClone.outerHTML,
    };
  });

  return {
    pages,
    totalPages,
    totalPeople,
  };
}

/**
 * Measures BOTH horizontal width and vertical height of each paginated A4 page under actual
 * `.a4-print-root` 14pt/16pt TH Sarabun print CSS, returning the optimal zoom percentage (35% - 100%)
 * so that all `peoplePerPage` people (default 8) fit completely on 1 single A4 page with zero overflow.
 */
export function calculateAutoFitScalePercent(
  sourceEl: HTMLElement | null,
  orientation: A4Orientation,
  marginMm: A4MarginMm,
  peoplePerPage: A4PeoplePerPage = 8,
): number {
  if (!sourceEl) return 100;

  const printableWidth = getA4PrintableWidthPx(orientation, marginMm) - 6;
  const printableHeight = getA4PrintableHeightPx(orientation, marginMm) - 10;

  if (typeof document === 'undefined' || !document.body) {
    const widest = sourceEl.scrollWidth;
    if (widest <= 0 || widest <= printableWidth) return 100;
    return Math.max(35, Math.min(100, Math.floor((printableWidth / widest) * 100)));
  }

  const paginated = buildPaginatedPrintablePages(sourceEl, peoplePerPage);
  const measureHost = document.createElement('div');
  measureHost.className = 'a4-print-root';
  measureHost.style.position = 'fixed';
  measureHost.style.left = '-99999px';
  measureHost.style.top = '0';
  measureHost.style.width = `${printableWidth}px`;
  measureHost.style.visibility = 'hidden';
  measureHost.style.pointerEvents = 'none';
  measureHost.innerHTML = paginated.pages
    .map((p) => `<section class="a4-measure-page">${p.html}</section>`)
    .join('');

  document.body.appendChild(measureHost);
  try {
    // Pass 1: measure widest content (tables or page wrappers)
    let widestContent = printableWidth;
    measureHost.querySelectorAll('.a4-measure-page').forEach((pageEl) => {
      if (pageEl.scrollWidth > widestContent) {
        widestContent = pageEl.scrollWidth;
      }
    });
    measureHost.querySelectorAll('table').forEach((tbl) => {
      if (tbl.scrollWidth > widestContent) {
        widestContent = tbl.scrollWidth;
      }
    });

    const widthRatio = widestContent > 0 ? Math.min(1, printableWidth / widestContent) : 1;

    // If pagination is explicitly disabled (peoplePerPage === 0), scale by width only
    if (peoplePerPage <= 0) {
      return Math.max(35, Math.min(100, Math.floor(widthRatio * 100)));
    }

    // Pass 2: set host width to the effective zoomed layout width so multi-line cells
    // wrap identically to actual printed layout, then measure the tallest page height
    const effectiveLayoutWidth = Math.ceil(printableWidth / widthRatio);
    measureHost.style.width = `${effectiveLayoutWidth}px`;

    let tallestPageHeight = 0;
    measureHost.querySelectorAll('.a4-measure-page').forEach((pageEl) => {
      const h = (pageEl as HTMLElement).scrollHeight;
      if (h > tallestPageHeight) {
        tallestPageHeight = h;
      }
    });

    const heightRatio =
      tallestPageHeight > 0 ? Math.min(1, printableHeight / tallestPageHeight) : 1;

    const finalRatio = Math.min(widthRatio, heightRatio);
    const percent = Math.floor(finalRatio * 100);
    return Math.max(35, Math.min(100, percent));
  } finally {
    document.body.removeChild(measureHost);
  }
}

/**
 * Collects stylesheet links and inline styles from the current document so Tailwind v4
 * utility classes and Google Fonts (Sarabun / IBM Plex Sans Thai) render identically when printing.
 */
function collectDocumentHeadStyles(): string {
  const headNodes: string[] = [];

  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    if (node.tagName === 'LINK') {
      const link = node as HTMLLinkElement;
      if (link.href) {
        headNodes.push(`<link rel="stylesheet" href="${escapeHtmlAttr(link.href)}" />`);
      }
    } else if (node.tagName === 'STYLE') {
      headNodes.push(`<style>${node.textContent || ''}</style>`);
    }
  });

  return headNodes.join('\n');
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface BuiltA4DocumentResult {
  html: string;
  effectiveScalePercent: number;
  totalPages: number;
  totalPeople: number;
}

/**
 * Builds a complete A4 HTML document ready for direct iframe printing, live modal preview, or standalone download.
 */
export function buildA4PrintDocumentHtml(
  sourceEl: HTMLElement,
  options: A4PrintOptions,
  mode: A4RenderMode = 'print',
): BuiltA4DocumentResult {
  const peoplePerPage = options.peoplePerPage ?? 8;
  const effectiveScalePercent =
    options.scaleMode === 'auto'
      ? calculateAutoFitScalePercent(sourceEl, options.orientation, options.marginMm, peoplePerPage)
      : options.scaleMode;

  const paginated = buildPaginatedPrintablePages(sourceEl, peoplePerPage);
  const headStyles = collectDocumentHeadStyles();
  const safeTitle = escapeHtmlText(options.title || DEFAULT_A4_PRINT_OPTIONS.title);
  const scaleFactor = effectiveScalePercent / 100;
  const pageWidthMm = options.orientation === 'landscape' ? 297 : 210;
  const pageHeightMm = options.orientation === 'landscape' ? 210 : 297;
  const showSheetChrome = mode === 'preview' || mode === 'standalone';
  const previewDeskZoom =
    mode === 'preview' ? (options.orientation === 'landscape' ? 0.68 : 0.62) : 1;

  const toolbarHtml =
    mode === 'standalone'
      ? `
      <div class="standalone-print-bar">
        <div class="standalone-print-bar-title">
          <strong>${safeTitle}</strong>
          <span>ขนาดกระดาษ A4 (${options.orientation === 'landscape' ? 'แนวนอน' : 'แนวตั้ง'}) · ${
            paginated.totalPages
          } หน้า${
            peoplePerPage > 0 && paginated.totalPeople > 0 ? ` · หน้าละไม่เกิน ${peoplePerPage} คน` : ''
          } · มาตราส่วน ${effectiveScalePercent}%</span>
        </div>
        <button type="button" onclick="window.print()" class="standalone-print-btn">
          สั่งพิมพ์ออกเครื่องพิมพ์ (A4)
        </button>
      </div>
    `
      : '';

  const pagesHtml = paginated.pages
    .map((page) => {
      const pageLabelHtml =
        showSheetChrome && paginated.totalPages > 1
          ? `<div class="a4-page-badge">หน้า ${page.pageNumber} / ${paginated.totalPages}${
              page.startPerson > 0 ? ` · คนที่ ${page.startPerson}–${page.endPerson}` : ''
            }</div>`
          : '';
      return `
        ${pageLabelHtml}
        <section class="a4-sheet-page" data-page-index="${page.pageNumber}">
          <div class="a4-scale-container">
            ${page.html}
          </div>
        </section>
      `;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Sarabun:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    ${headStyles}
    <style>
      @page {
        size: A4 ${options.orientation};
        margin: ${options.marginMm}mm;
      }

      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        font-family: "TH Sarabun New", "TH SarabunPSK", "Sarabun", sans-serif !important;
        font-size: 14pt;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .a4-print-root {
        width: 100%;
        background: transparent;
        ${options.colorMode === 'grayscale' ? 'filter: grayscale(100%);' : ''}
      }

      .a4-sheet-page {
        width: 100%;
        background: #ffffff;
        box-sizing: border-box;
        page-break-after: always;
        break-after: page;
      }

      .a4-sheet-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }

      .a4-scale-container {
        width: 100%;
        zoom: ${scaleFactor};
      }

      @supports not (zoom: 1) {
        .a4-scale-container {
          transform: scale(${scaleFactor});
          transform-origin: top left;
          width: ${(100 / scaleFactor).toFixed(2)}%;
        }
      }

      .a4-print-root table {
        border-collapse: collapse !important;
        page-break-inside: auto;
      }

      .a4-print-root thead {
        display: table-header-group;
      }

      .a4-print-root tfoot {
        display: table-row-group;
      }

      .a4-print-root tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .a4-print-root .print-avoid-break {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .no-print {
        display: none !important;
      }

      .a4-page-badge {
        display: none;
      }

      /* Screen-only styling for downloaded standalone HTML file */
      .standalone-print-bar {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px 20px;
        background: #0f172a;
        color: #ffffff;
        font-family: "IBM Plex Sans Thai", "Sarabun", sans-serif;
      }

      .standalone-print-bar-title {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 13px;
      }

      .standalone-print-bar-title span {
        font-size: 11px;
        color: #cbd5e1;
      }

      .standalone-print-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 8px;
        background: #0f766e;
        color: #ffffff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }

      .standalone-print-btn:hover {
        background: #115e59;
      }

      @media screen {
        body.sheet-desk {
          background: #cbd5e1 !important;
          padding: ${mode === 'preview' ? '14px 10px 24px' : '0 0 28px'} !important;
        }

        body.sheet-desk .a4-print-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          ${mode === 'preview' ? `zoom: ${previewDeskZoom};` : ''}
        }

        body.sheet-desk .a4-page-badge {
          display: block;
          width: ${pageWidthMm}mm;
          margin: 14px auto 6px;
          font-family: "IBM Plex Sans Thai", "Sarabun", sans-serif;
          font-size: 15px;
          font-weight: 600;
          color: #334155;
        }

        body.sheet-desk .a4-page-badge:first-child {
          margin-top: 4px;
        }

        body.sheet-desk .a4-sheet-page {
          width: ${pageWidthMm}mm;
          min-height: ${pageHeightMm}mm;
          ${peoplePerPage > 0 ? `height: ${pageHeightMm}mm; overflow: hidden;` : ''}
          margin: ${paginated.totalPages > 1 ? '0 auto 12px' : '12px auto'};
          padding: ${options.marginMm}mm;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.22);
          border: 1px solid #94a3b8;
        }
      }

      @media print {
        .standalone-print-bar,
        .a4-page-badge {
          display: none !important;
        }
        body.sheet-desk {
          background: #ffffff !important;
          padding: 0 !important;
        }
        body.sheet-desk .a4-print-root {
          display: block !important;
          zoom: 1 !important;
        }
        body.sheet-desk .a4-sheet-page {
          width: 100% !important;
          min-height: auto !important;
          height: auto !important;
          overflow: visible !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          border: none !important;
        }
      }
    </style>
  </head>
  <body class="${showSheetChrome ? 'sheet-desk' : ''}">
    ${toolbarHtml}
    <div class="a4-print-root">
      ${pagesHtml}
    </div>
  </body>
</html>`;

  return {
    html,
    effectiveScalePercent,
    totalPages: paginated.totalPages,
    totalPeople: paginated.totalPeople,
  };
}

/**
 * Connects directly to the system/browser Printer Dialog via a clean hidden A4 print iframe,
 * ensuring exact A4 margins, orientation, colors, 8-people-per-page pagination, and auto-fit scale.
 */
export async function printElementAsA4(
  sourceEl: HTMLElement,
  options: A4PrintOptions,
): Promise<{ effectiveScalePercent: number; totalPages: number }> {
  const { html, effectiveScalePercent, totalPages } = buildA4PrintDocumentHtml(
    sourceEl,
    options,
    'print',
  );

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      resolve({ effectiveScalePercent, totalPages });
    };

    const triggerPrint = () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }

      const waitFonts =
        win.document.fonts && typeof win.document.fonts.ready?.then === 'function'
          ? Promise.race([
              win.document.fonts.ready,
              new Promise<void>((r) => setTimeout(r, 700)),
            ])
          : new Promise<void>((r) => setTimeout(r, 250));

      void waitFonts.then(() => {
        win.addEventListener('afterprint', () => {
          setTimeout(cleanup, 150);
        });

        try {
          win.focus();
          win.print();
        } catch {
          // Fallback to native window.print if child frame print throws
          try {
            window.print();
          } catch {
            // Ignore
          }
        }

        // Safety cleanup if browser does not fire afterprint
        setTimeout(cleanup, 60000);
      });
    };

    iframe.onload = triggerPrint;
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    if (frameDoc) {
      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();
    } else {
      cleanup();
    }
  });
}

/**
 * Downloads a self-contained A4 printable HTML sheet for computers/environments
 * where an embedded preview blocks direct printer dialogs or for offline printing.
 */
export function downloadPrintableA4File(sourceEl: HTMLElement, options: A4PrintOptions): void {
  const { html } = buildA4PrintDocumentHtml(sourceEl, options, 'standalone');
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeFileName = (options.title || 'เอกสารตารางเวร_A4')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_');

  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFileName}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
