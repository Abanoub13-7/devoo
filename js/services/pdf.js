/* Devoo · PDF — html2pdf wrapper (Arabic / RTL friendly) */
'use strict';

const PDFService = (() => {
  const ready = () => typeof window.html2pdf === 'function';

  // A4 width @ 96dpi ≈ 794px — fixed so the PDF layout never depends on
  // viewport size or the on-screen Modal's box (View Template vs PDF Template
  // are fully decoupled).
  const A4_PX_WIDTH = 794;

  const _isDataUrl = (src) => /^data:/i.test(src || '');

  /** Root cause of the "blank/white PDF" bug: html2canvas is configured with
   *  useCORS:true + allowTaint:false. A single <img> that isn't a local
   *  data: URL (store logo or a manually-pasted product image URL) and that
   *  fails to load with CORS, or taints the canvas, makes canvas.toDataURL()
   *  throw for the WHOLE page — not just that image — which is what produces
   *  an empty PDF. This secures each image *before* html2canvas ever runs:
   *  data: URLs are inherently safe and are just awaited; remote URLs are
   *  re-verified via a CORS-enabled probe within a bounded timeout, and
   *  swapped for the local fallback image on any failure/timeout so one bad
   *  image can never blank out the whole invoice. */
  const _secureImage = (img) => new Promise((resolve) => {
    const src = img.getAttribute('src') || '';
    if (!src || _isDataUrl(src)) {
      if (img.complete) return resolve();
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => { img.src = H.fallbackImg; resolve(); }, { once: true });
      return;
    }
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (!ok) img.src = H.fallbackImg;
      resolve();
    };
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => { img.src = probe.src; finish(true); };
    probe.onerror = () => finish(false);
    probe.src = src;
    setTimeout(() => finish(false), 6000);
  });

  /** Waits for web fonts (Cairo) to finish loading — required so Arabic
   *  glyph shaping/ligatures are correct before html2canvas rasterizes the
   *  DOM — and for every <img> in the host to settle (loaded, or safely
   *  replaced with a local fallback so it can never taint/blank the PDF). */
  const _waitForAssets = async (host) => {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* noop */ }
    const imgs = Array.from(host.querySelectorAll('img'));
    await Promise.all(imgs.map(img => _secureImage(img).catch(() => { img.src = H.fallbackImg; })));
    // Let layout settle (fonts/images just swapped can shift table sizing)
    // before html2canvas rasterizes — avoids intermittent blank captures.
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  };

  /**
   * Exports a standalone HTML string — a dedicated PDF Template, never the
   * on-screen Modal markup — to a PDF file. The caller is responsible for
   * building print-safe markup (see Invoices.renderPDFHTML): no transform /
   * animation / transition / backdrop-filter / sticky / fixed / complex
   * flex-grid, since those are known to break html2canvas captures.
   */
  const exportHTML = async (html, filename = 'document.pdf') => {
    if (!html) return false;
    if (!ready()) {
      Toast.error('مكتبة PDF غير محمّلة. تحقق من الاتصال بالإنترنت.');
      return false;
    }
    // Root cause (verified): the Invoice Modal stays open while the PDF host
    // is rendered off-screen (left:-99999px / z-index:-1). Some browsers
    // (esp. mobile Safari/Chrome) throttle or skip layout/paint for content
    // that is positioned off-screen or stacked behind the page while another
    // fixed/overlay element (the open Modal) covers the viewport — html2canvas
    // then rasterizes an unpainted host, producing a blank PDF. The fix is to
    // keep the host fully on-screen/paintable (absolute, top:0/left:0,
    // z-index:1 — never negative, never off-screen) and to temporarily hide
    // the open Modal (visibility, not display:none/removal) only for the
    // duration of the capture, always restoring it in `finally`.
    const modalRoot = document.getElementById('modalRoot');
    const wasModalOpen = !!(modalRoot && modalRoot.classList.contains('open'));
    const previousVisibility = modalRoot ? modalRoot.style.visibility || '' : '';
    if (wasModalOpen) {
      modalRoot.style.visibility = 'hidden';
    }

    // Root cause (measured): html2pdf clones the element passed to .from()
    // into its own `.html2pdf__container` (height:auto). An absolutely
    // positioned root is out of normal flow there, so the container measures
    // 0px tall, html2canvas rasterizes a <width>x0 canvas and jsPDF writes an
    // empty page — the blank PDF. The host stays positioned (so it never
    // disturbs the page), but the element handed to html2pdf is a STATICALLY
    // positioned inner page that is in normal flow and therefore measurable.
    const host = document.createElement('div');
    host.style.cssText = `position:absolute;top:0;left:0;width:${A4_PX_WIDTH}px;min-height:100px;background:#fff;pointer-events:none;z-index:1;`;
    const page = document.createElement('div');
    // 794px == 210mm @96dpi == html2pdf's container width when jsPDF margin is
    // 0, so nothing overflows/clips. Page margins are applied as padding here
    // instead of via the jsPDF margin option.
    page.style.cssText = `position:static;width:${A4_PX_WIDTH}px;padding:30px;box-sizing:border-box;background:#fff;`;
    page.innerHTML = html;
    host.appendChild(page);
    document.body.appendChild(host);
    try {
      Toast.success('جاري تحضير ملف PDF…');
      await _waitForAssets(host);
      await window.html2pdf().set({
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#ffffff',
          letterRendering: true,
          // No width/windowWidth override: html2pdf sizes its own container
          // (~733px of printable A4). Forcing 794px there clipped the right
          // edge of the invoice table.
          scrollX: 0,
          scrollY: 0,
          logging: true,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', putOnlyUsedFonts: true, compress: true },
        // 'avoid-all' + explicit avoid selectors stop rows/blocks being sliced across pages;
        // 'css' still respects any page-break-* rules the template sets.
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'], avoid: ['tr', '.pdf-avoid-break'] },
      }).from(page).save();
      return true;
    } catch (e) {
      console.error('[PDF]', e);
      console.error(e && e.stack ? e.stack : '(no stack available)');
      Toast.error('تعذّر إنشاء ملف PDF');
      return false;
    } finally {
      host.remove();
      if (wasModalOpen && modalRoot) {
        modalRoot.style.visibility = previousVisibility;
      }
    }
  };

  // Back-compat wrapper for any caller that still hands over a DOM node.
  const exportElement = async (el, filename = 'document.pdf') => {
    if (!el) return false;
    return exportHTML(el.outerHTML, filename);
  };

  const printElement = (el) => {
    if (!el) return;
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) { Toast.error('السماح بالنوافذ المنبثقة مطلوب للطباعة'); return; }
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(s => s.outerHTML).join('\n');
    win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head>
      <meta charset="utf-8"/>
      <title>طباعة فاتورة</title>
      ${styles}
      <style>body{padding:20px;background:#fff}.no-print{display:none!important}</style>
    </head><body>${el.outerHTML}<script>window.onload=()=>{setTimeout(()=>{window.print();window.close();},300)}<\/script></body></html>`);
    win.document.close();
  };

  return { exportElement, exportHTML, printElement, ready };
})();

window.PDFService = PDFService;
