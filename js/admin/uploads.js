/* Devoo · Admin Uploads — drag-and-drop image upload widget for product form
   Strategy: a MutationObserver watches the modal root; when the product form
   appears it injects an upload widget that augments the existing hidden
   `images` textarea, keeping the engine's save logic untouched. */
'use strict';

const Uploads = (() => {
  const MAX_FILES = 8;
  const MAX_BYTES = 400 * 1024; // post-compress target

  const _wireForm = (form) => {
    if (!form || form.dataset.uploadsWired) return;
    form.dataset.uploadsWired = '1';

    const textarea = form.querySelector('[name="images"]');
    if (!textarea) return;
    textarea.classList.add('hidden-input');

    // Build widget
    const widget = document.createElement('div');
    widget.className = 'uploads-widget';
    widget.innerHTML = `
      <label class="uploads-label">صور المنتج (الصورة الأولى هي الرئيسية)</label>
      <div class="uploads-drop" tabindex="0" role="button" aria-label="إضافة صور">
        <input type="file" accept="image/*" multiple hidden id="uploadsInput"/>
        <div class="uploads-drop-inner">
          <span class="uploads-icon">🖼️</span>
          <strong>اسحب وأفلت الصور هنا</strong>
          <small>أو اضغط للاختيار · حتى ${MAX_FILES} صور · يتم الضغط تلقائياً</small>
        </div>
      </div>
      <div class="uploads-grid" id="uploadsGrid"></div>
    `;
    textarea.parentNode.insertBefore(widget, textarea);

    const drop = widget.querySelector('.uploads-drop');
    const input = widget.querySelector('#uploadsInput');
    const grid = widget.querySelector('#uploadsGrid');

    const getList = () => textarea.value.split('\n').map(s => s.trim()).filter(Boolean);
    const setList = (arr) => {
      textarea.value = arr.slice(0, MAX_FILES).join('\n');
      render();
      // Trigger engine's existing preview listener
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const render = () => {
      const items = getList();
      grid.innerHTML = items.map((src, i) => `
        <div class="up-card" draggable="true" data-idx="${i}">
          <img src="${esc(src)}" alt="" loading="lazy"/>
          ${i === 0 ? '<span class="up-main">رئيسية</span>' : ''}
          <div class="up-actions">
            ${i > 0 ? `<button type="button" class="up-btn" data-act="primary" data-idx="${i}" title="جعلها رئيسية">⭐</button>` : ''}
            <button type="button" class="up-btn" data-act="remove" data-idx="${i}" title="حذف">🗑️</button>
          </div>
        </div>
      `).join('');
    };

    const addFiles = async (files) => {
      const current = getList();
      const room = MAX_FILES - current.length;
      if (room <= 0) { Toast.error(`الحد الأقصى ${MAX_FILES} صور`); return; }
      const list = Array.from(files).slice(0, room);
      let added = 0;
      for (const f of list) {
        if (!f.type.startsWith('image/')) { Toast.error(`ملف غير صالح: ${f.name}`); continue; }
        if (f.size > 8 * 1024 * 1024) { Toast.error(`صورة كبيرة جداً: ${f.name}`); continue; }
        try {
          const dataUrl = await H.compressImage(f, { maxDim: 1200, maxBytes: MAX_BYTES });
          current.push(dataUrl);
          added++;
        } catch (e) { Toast.error(`فشل معالجة ${f.name}`); }
      }
      if (added) { setList(current); Toast.success(`تمت إضافة ${added} صورة`); }
    };

    // Click → open file picker
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', (e) => { addFiles(e.target.files); input.value = ''; });

    // Drag/drop
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('dragover'); }));
    drop.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

    // Grid actions
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.up-btn'); if (!btn) return;
      const idx = Number(btn.dataset.idx);
      const arr = getList();
      if (btn.dataset.act === 'remove') { arr.splice(idx, 1); setList(arr); }
      if (btn.dataset.act === 'primary') { const [it] = arr.splice(idx, 1); arr.unshift(it); setList(arr); }
    });

    render();
  };

  const init = () => {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    const obs = new MutationObserver(() => {
      const form = root.querySelector('#productForm');
      if (form) _wireForm(form);
    });
    obs.observe(root, { childList: true, subtree: true });
  };

  return { init };
})();

window.Uploads = Uploads;
