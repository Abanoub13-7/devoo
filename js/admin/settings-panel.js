/* Devoo · Admin Settings Panel — accessible via a global "Settings" button injected into admin shell */
'use strict';

const SettingsPanel = (() => {
  const openModal = () => {
    const s = Settings.get();
    const field = (name, label, value, type = 'text', extra = '') =>
      `<div class="form-row"><label>${esc(label)}</label><input name="${name}" type="${type}" value="${esc(value || '')}" ${extra}/></div>`;
    const checkboxField = (name, label, checked) =>
      `<div class="form-row form-row-checkbox"><label><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}/> ${esc(label)}</label></div>`;

    const body = `
      <form id="settingsForm" class="form-grid" novalidate>
        <h4 class="sp-heading">المتجر</h4>
        <div class="form-2col form-grid" style="gap:14px">
          ${field('storeName', 'اسم المتجر', s.storeName)}
          ${field('taxNumber', 'الرقم الضريبي', s.taxNumber)}
        </div>
        <div class="form-row">
          <label>شعار المتجر</label>
          <div class="logo-uploader">
            <img id="logoPreview" src="${esc(s.storeLogo || H.defaultLogo)}" data-logo alt=""/>
            <div>
              <input type="file" id="logoFile" accept="image/*" hidden/>
              <button type="button" class="btn btn-ghost" id="logoPick">اختر صورة</button>
              <button type="button" class="btn btn-ghost" id="logoClear">حذف</button>
              <small class="muted">يُفضّل PNG شفاف، مربع.</small>
            </div>
          </div>
          <input type="hidden" name="storeLogo" value="${esc(s.storeLogo)}"/>
        </div>
        <div class="form-2col form-grid" style="gap:14px">
          ${field('faviconUrl', 'رابط أيقونة الموقع (Favicon)', s.faviconUrl, 'url')}
          ${field('currencyName', 'اسم العملة', s.currencyName)}
        </div>
        <div class="form-2col form-grid" style="gap:14px">
          ${field('currencySymbol', 'رمز العملة', s.currencySymbol)}
          ${field('storePhone', 'هاتف المتجر', s.storePhone)}
        </div>
        <div class="form-2col form-grid" style="gap:14px">
          ${field('storeEmail', 'البريد الإلكتروني', s.storeEmail, 'email')}
        </div>
        <div class="form-row"><label>العنوان</label><textarea name="storeAddress" rows="2">${esc(s.storeAddress)}</textarea></div>

        <h4 class="sp-heading">واتساب</h4>
        <div class="form-2col form-grid" style="gap:14px">
          ${field('whatsappNumber', 'رقم واتساب (بصيغة دولية)', s.whatsappNumber)}
          ${field('whatsappMessage', 'الرسالة الافتراضية', s.whatsappMessage)}
        </div>

        <h4 class="sp-heading">الضريبة</h4>
        <div class="form-2col form-grid" style="gap:14px">
          ${checkboxField('taxEnabled', 'تفعيل الضريبة', s.taxEnabled)}
          ${field('taxRate', 'نسبة الضريبة (%)', s.taxRate, 'number', 'min="0" step="0.01"')}
        </div>

        <h4 class="sp-heading">الشحن</h4>
        <div class="form-2col form-grid" style="gap:14px">
          ${checkboxField('shippingEnabled', 'تفعيل الشحن', s.shippingEnabled)}
          ${field('shippingCost', 'تكلفة الشحن', s.shippingCost, 'number', 'min="0" step="0.01"')}
        </div>
        <div class="form-2col form-grid" style="gap:14px">
          ${checkboxField('freeShippingEnabled', 'تفعيل الشحن المجاني', s.freeShippingEnabled)}
          ${field('freeShippingThreshold', 'حد الشحن المجاني', s.freeShippingThreshold, 'number', 'min="0" step="0.01"')}
        </div>

        <h4 class="sp-heading">السوشيال ميديا</h4>
        <div class="form-2col form-grid" style="gap:14px">
          ${field('facebookUrl', 'رابط فيسبوك', s.facebookUrl, 'url')}
          ${field('instagramUrl', 'رابط إنستجرام', s.instagramUrl, 'url')}
        </div>
        <div class="form-2col form-grid" style="gap:14px">
          ${field('tiktokUrl', 'رابط تيك توك (اختياري)', s.tiktokUrl, 'url')}
          ${field('invoicePrefix', 'بادئة رقم الفاتورة', s.invoicePrefix)}
        </div>

        <h4 class="sp-heading">تكامل Google</h4>
        <div class="form-row">
          ${field('googleAppsScriptUrl', 'رابط Google Apps Script', s.googleAppsScriptUrl, 'url')}
        </div>

        <h4 class="sp-heading">الفاتورة</h4>
        <div class="form-row"><label>ملاحظة أسفل الفاتورة (Invoice Footer)</label><textarea name="footerNote" rows="2">${esc(s.footerNote)}</textarea></div>
        <div class="form-row"><label>ملاحظات الفاتورة (Invoice Notes)</label><textarea name="invoiceNotes" rows="2">${esc(s.invoiceNotes)}</textarea></div>
      </form>
    `;
    const footer = `
      <button class="btn btn-ghost" data-close>إلغاء</button>
      <button class="btn btn-primary" id="saveSettingsBtn">حفظ الإعدادات</button>
    `;
    const { close, root } = Modal.open({ title: 'إعدادات المتجر', body, footer, size: 'large' });

    const logoHidden = root.querySelector('input[name="storeLogo"]');
    const logoImg = root.querySelector('#logoPreview');
    const fileInput = root.querySelector('#logoFile');
    root.querySelector('#logoPick').addEventListener('click', () => fileInput.click());
    root.querySelector('#logoClear').addEventListener('click', () => { logoHidden.value = ''; logoImg.src = H.defaultLogo; });
    fileInput.addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      try {
        const dataUrl = await H.compressImage(f, { maxDim: 400, maxBytes: 80 * 1024 });
        logoHidden.value = dataUrl;
        logoImg.src = dataUrl;
      } catch { Toast.error('فشل تحميل الشعار'); }
    });

    root.querySelector('#saveSettingsBtn').addEventListener('click', () => {
      const form = root.querySelector('#settingsForm');
      const d = Object.fromEntries(new FormData(form).entries());
      d.storeLogo = logoHidden.value;
      d.taxEnabled = form.querySelector('[name="taxEnabled"]').checked;
      d.shippingEnabled = form.querySelector('[name="shippingEnabled"]').checked;
      d.freeShippingEnabled = form.querySelector('[name="freeShippingEnabled"]').checked;
      Settings.save(d);
      Toast.success('تم حفظ الإعدادات');
      close();
    });
  };

  /* ===== Store Identity — applies storeName / storeLogo / faviconUrl everywhere
     they appear on the public site (title, meta description, favicon, header
     logo, footer logo, footer copyright). Re-applied whenever settings change. */
  const applyIdentity = () => {
    const s = Settings.get();
    const name = s.storeName || '';
    const logo = s.storeLogo || '';
    const favicon = s.faviconUrl || s.storeLogo || '';

    document.title = name ? `${name} - للادوات المنزلية` : document.title;

    const metaDesc = document.getElementById('pageDescription');
    if (metaDesc && name) metaDesc.setAttribute('content', `${name} — إكسسوارات منزلية فاخرة، أدوات مطبخ، تنظيم وديكور ذكي.`);

    const faviconLink = document.getElementById('storeFavicon');
    if (faviconLink && favicon) faviconLink.setAttribute('href', favicon);

    const brandLink = document.querySelector('.brand');
    if (brandLink && name) brandLink.setAttribute('aria-label', `${name} - الرئيسية`);

    const brandLogo = document.getElementById('brandLogo');
    if (brandLogo) {
      brandLogo.src = H.logoSrc(s);
      H.bindLogoFallback(brandLogo);
      brandLogo.alt = `شعار ${name}`;
    }

    const footerLogo = document.getElementById('footerLogo');
    if (footerLogo) {
      footerLogo.src = H.logoSrc(s);
      H.bindLogoFallback(footerLogo);
      footerLogo.alt = name;
    }

    // const footerStoreName = document.querySelectorAll('footerStoreName');
    // if (footerStoreName && name) footerStoreName.textContent = name;
  const footerStoreNames = document.querySelectorAll('#footerStoreName');

footerStoreNames.forEach(el => {
    if (name) el.textContent = name;
});
  };

  const init = () => {
    applyIdentity();
    try { EventBus.on('settings:changed', applyIdentity); } catch {}
  };

  return { init, open: openModal, applyIdentity };
})();

window.SettingsPanel = SettingsPanel;
