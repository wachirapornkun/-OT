export type A4Orientation = 'landscape' | 'portrait';
export type A4MarginMm = 5 | 8 | 12;
export type A4ScaleMode = 'auto' | 100 | 90 | 85 | 80 | 75;
export type A4ColorMode = 'color' | 'grayscale';

export interface A4PrintOptions {
  title: string;
  orientation: A4Orientation;
  marginMm: A4MarginMm;
  scaleMode: A4ScaleMode;
  colorMode: A4ColorMode;
}

export const DEFAULT_A4_PRINT_OPTIONS: A4PrintOptions = {
  title: 'เอกสารตารางเวร A4',
  orientation: 'landscape',
  marginMm: 8,
  scaleMode: 'auto',
  colorMode: 'color',
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
 * Measures the widest content (such as a 31-day roster table) under actual A4 print styling
 * (including 14pt/16pt TH Sarabun print rules inside `.a4-print-root`) and calculates
 * the optimal zoom percentage (40% - 100%) to fit A4 width with zero clipping.
 */
export function calculateAutoFitScalePercent(
  sourceEl: HTMLElement | null,
  orientation: A4Orientation,
  marginMm: A4MarginMm,
): number {
  if (!sourceEl) return 100;

  const printableWidth = getA4PrintableWidthPx(orientation, marginMm) - 8;
  let widestContent = sourceEl.scrollWidth;

  // Measure inside a temporary off-screen `.a4-print-root` so 14pt/16pt print CSS is reflected accurately
  if (typeof document !== 'undefined' && document.body) {
    const measureHost = document.createElement('div');
    measureHost.className = 'a4-print-root';
    measureHost.style.position = 'fixed';
    measureHost.style.left = '-99999px';
    measureHost.style.top = '0';
    measureHost.style.width = `${printableWidth}px`;
    measureHost.style.visibility = 'hidden';
    measureHost.style.pointerEvents = 'none';
    measureHost.innerHTML = preparePrintableCloneHtml(sourceEl);
    document.body.appendChild(measureHost);
    try {
      widestContent = measureHost.scrollWidth;
      measureHost.querySelectorAll('table').forEach((tbl) => {
        if (tbl.scrollWidth > widestContent) {
          widestContent = tbl.scrollWidth;
        }
      });
    } finally {
      document.body.removeChild(measureHost);
    }
  } else {
    sourceEl.querySelectorAll('table').forEach((tbl) => {
      if (tbl.scrollWidth > widestContent) {
        widestContent = tbl.scrollWidth;
      }
    });
  }

  if (widestContent <= 0 || widestContent <= printableWidth) {
    return 100;
  }

  const ratio = printableWidth / widestContent;
  const percent = Math.floor(ratio * 100);
  return Math.max(40, Math.min(100, percent));
}

/**
 * Deep-clones the target printable container and transforms interactive controls into crisp print nodes:
 * - Removes `.no-print` elements
 * - Unhides `.print-only` elements
 * - Replaces `<input>` fields (like the 16pt top-right header note) with clean static text divs
 * - Expands overflow containers and removes sticky positioning so nothing clips on paper
 */
export function preparePrintableCloneHtml(sourceEl: HTMLElement): string {
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
    // Preserve typographic classes (e.g. text-[16pt], font-bold, text-right) while removing input chrome
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

  // Normalize outer card wrapper styling for crisp white A4 paper
  clone.style.border = 'none';
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  clone.style.padding = '0';
  clone.style.margin = '0';
  clone.style.background = '#ffffff';
  clone.style.overflow = 'visible';

  return clone.outerHTML;
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

/**
 * Builds a complete standalone A4 HTML document ready for direct iframe printing or standalone download.
 */
export function buildA4PrintDocumentHtml(
  sourceEl: HTMLElement,
  options: A4PrintOptions,
  includeStandaloneToolbar = false,
): { html: string; effectiveScalePercent: number } {
  const effectiveScalePercent =
    options.scaleMode === 'auto'
      ? calculateAutoFitScalePercent(sourceEl, options.orientation, options.marginMm)
      : options.scaleMode;

  const contentHtml = preparePrintableCloneHtml(sourceEl);
  const headStyles = collectDocumentHeadStyles();
  const safeTitle = escapeHtmlText(options.title || DEFAULT_A4_PRINT_OPTIONS.title);
  const scaleFactor = effectiveScalePercent / 100;
  const pageWidthMm = options.orientation === 'landscape' ? 297 : 210;
  const pageHeightMm = options.orientation === 'landscape' ? 210 : 297;

  const toolbarHtml = includeStandaloneToolbar
    ? `
      <div class="standalone-print-bar">
        <div class="standalone-print-bar-title">
          <strong>${safeTitle}</strong>
          <span>ขนาดกระดาษ A4 (${options.orientation === 'landscape' ? 'แนวนอน' : 'แนวตั้ง'}) · มาตราส่วน ${effectiveScalePercent}%</span>
        </div>
        <button type="button" onclick="window.print()" class="standalone-print-btn">
          สั่งพิมพ์ออกเครื่องพิมพ์ (A4)
        </button>
      </div>
    `
    : '';

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
        background: #ffffff;
        ${options.colorMode === 'grayscale' ? 'filter: grayscale(100%);' : ''}
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
        body.standalone-sheet {
          background: #e2e8f0 !important;
        }
        body.standalone-sheet .a4-print-root {
          width: ${pageWidthMm}mm;
          min-height: ${pageHeightMm}mm;
          margin: 18px auto;
          padding: ${options.marginMm}mm;
          box-shadow: 0 8px 30px rgba(15, 23, 42, 0.15);
          box-sizing: border-box;
        }
      }

      @media print {
        .standalone-print-bar {
          display: none !important;
        }
        body.standalone-sheet {
          background: #ffffff !important;
        }
        body.standalone-sheet .a4-print-root {
          width: 100% !important;
          min-height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
      }
    </style>
  </head>
  <body class="${includeStandaloneToolbar ? 'standalone-sheet' : ''}">
    ${toolbarHtml}
    <div class="a4-print-root">
      <div class="a4-scale-container">
        ${contentHtml}
      </div>
    </div>
  </body>
</html>`;

  return { html, effectiveScalePercent };
}

/**
 * Connects directly to the system/browser Printer Dialog via a clean hidden A4 print iframe,
 * ensuring exact A4 margins, orientation, colors, and auto-fit table width.
 */
export async function printElementAsA4(
  sourceEl: HTMLElement,
  options: A4PrintOptions,
): Promise<{ effectiveScalePercent: number }> {
  const { html, effectiveScalePercent } = buildA4PrintDocumentHtml(sourceEl, options, false);

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
      resolve({ effectiveScalePercent });
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
  const { html } = buildA4PrintDocumentHtml(sourceEl, options, true);
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
