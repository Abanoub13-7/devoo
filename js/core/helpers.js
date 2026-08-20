/* Devoo · helpers — shared cross-module utilities (kept tiny; engine.js has the rest) */
'use strict';

const H = {
  safeJSON(str, fallback = null) {
    try { return JSON.parse(str); } catch { return fallback; }
  },
  on(el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts); return () => el && el.removeEventListener(ev, fn, opts); },
  /** Compress an image File via canvas. Resolves a base64 data url under target bytes. */
  compressImage(file, { maxDim = 1200, quality = 0.82, maxBytes = 350 * 1024 } = {}) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) return reject(new Error('ليس ملف صورة'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('تعذّر قراءة الملف'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('صورة غير صالحة'));
        img.onload = () => {
          let { width: w, height: h } = img;
          if (w > maxDim || h > maxDim) {
            const r = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          let q = quality;
          let dataUrl = canvas.toDataURL('image/jpeg', q);
          // Iteratively lower quality if oversized
          while (dataUrl.length * 0.75 > maxBytes && q > 0.4) {
            q -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', q);
          }
          resolve(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },
  /* ===== Brand logo =====
     Priority: Settings.storeLogo -> assets/logo.svg -> inlineLogo (emergency).
     All three are local to the project: no remote placeholder services. */
  defaultLogo: 'assets/logo.svg',
  inlineLogo: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="72" viewBox="0 0 240 72"><rect width="240" height="72" rx="14" fill="#0f172a"/><rect x="18" y="14" width="44" height="44" rx="12" fill="#b8895a"/><text x="40" y="45" font-size="24" font-weight="700" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif">D</text><text x="76" y="43" fill="#fff" font-size="24" font-weight="700" font-family="Arial,sans-serif">Devoo</text></svg>'
  ),
  /** Resolve the logo src to use for a given settings object. */
  logoSrc(settings) {
    const url = (settings && settings.storeLogo || '').trim();
    return url || H.defaultLogo;
  },
  /** Attach a non-recursive fallback chain to a logo <img>. */
  bindLogoFallback(img) {
    if (!img || img.dataset.logoBound === '1') return img;
    img.dataset.logoBound = '1';
    img.addEventListener('error', () => {
      const step = img.dataset.logoStep || '0';
      if (step === '0') { img.dataset.logoStep = '1'; img.src = H.defaultLogo; return; }
      if (step === '1') { img.dataset.logoStep = '2'; img.src = H.inlineLogo; return; }
      /* step 2 = inline SVG already applied: stop, never loop again. */
    });
    return img;
  },
  fallbackImg: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f1f3f5"/><text x="50%" y="50%" font-size="48" text-anchor="middle" dominant-baseline="central" fill="#adb5bd">📦</text></svg>'
  ),
};

window.H = H;

// Global image fallback (delegated, single listener — replaces inline onerror handlers safely)
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.dataset.logo === undefined && t.dataset.logoBound !== '1' && !t.dataset.fallback) {
    t.dataset.fallback = '1';
    t.src = H.fallbackImg;
  }
}, true);
