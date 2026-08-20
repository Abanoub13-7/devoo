/* Devoo · Social — injects configurable social icons into footer + mobile menu */
'use strict';

const SocialService = (() => {
  const ICONS = {
    facebook: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 1.62c-3.15 0-3.5.01-4.74.07-1.07.05-1.65.23-2.04.38-.51.2-.88.44-1.27.83-.39.39-.63.76-.83 1.27-.15.39-.33.97-.38 2.04-.06 1.24-.07 1.6-.07 4.74s.01 3.5.07 4.74c.05 1.07.23 1.65.38 2.04.2.51.44.88.83 1.27.39.39.76.63 1.27.83.39.15.97.33 2.04.38 1.24.06 1.6.07 4.74.07s3.5-.01 4.74-.07c1.07-.05 1.65-.23 2.04-.38.51-.2.88-.44 1.27-.83.39-.39.63-.76.83-1.27.15-.39.33-.97.38-2.04.06-1.24.07-1.6.07-4.74s-.01-3.5-.07-4.74c-.05-1.07-.23-1.65-.38-2.04a3.4 3.4 0 0 0-.83-1.27 3.4 3.4 0 0 0-1.27-.83c-.39-.15-.97-.33-2.04-.38C15.5 3.79 15.15 3.78 12 3.78Zm0 2.76a5.46 5.46 0 1 1 0 10.92 5.46 5.46 0 0 1 0-10.92Zm0 9a3.54 3.54 0 1 0 0-7.08 3.54 3.54 0 0 0 0 7.08Zm5.68-9.18a1.27 1.27 0 1 1-2.54 0 1.27 1.27 0 0 1 2.54 0Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M21 8.5a6.5 6.5 0 0 1-4.5-1.8V15a6 6 0 1 1-6-6c.34 0 .68.03 1 .09v2.6a3.5 3.5 0 1 0 2.5 3.35V2h2.5a4.5 4.5 0 0 0 4.5 4Z"/></svg>',
    email: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v.4l8 5 8-5V6H4Zm16 2.6-7.45 4.65a1 1 0 0 1-1.1 0L4 8.6V18h16V8.6Z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M20.52 3.48A11.94 11.94 0 0 0 12.05 0C5.5 0 .19 5.3.19 11.86c0 2.09.55 4.13 1.59 5.93L0 24l6.39-1.67a11.86 11.86 0 0 0 5.66 1.44c6.55 0 11.86-5.3 11.86-11.85 0-3.17-1.23-6.15-3.4-8.44Z"/></svg>',
  };

  const buildLinks = () => {
    const s = Settings.get();
    const out = [];
    if (s.facebookUrl)  out.push({ k: 'facebook',  href: s.facebookUrl,  label: 'فيسبوك' });
    if (s.instagramUrl) out.push({ k: 'instagram', href: s.instagramUrl, label: 'إنستجرام' });
    if (s.tiktokUrl)    out.push({ k: 'tiktok',    href: s.tiktokUrl,    label: 'تيك توك' });
    if (s.whatsappNumber) out.push({ k: 'whatsapp', href: WhatsAppService.buildLink(), label: 'واتساب' });
    if (s.storeEmail)   out.push({ k: 'email',     href: `mailto:${s.storeEmail}`, label: 'البريد' });
    return out;
  };

  const renderInto = (host, size = 'md') => {
    if (!host) return;
    host.innerHTML = '';
    buildLinks().forEach(l => {
      const a = document.createElement('a');
      a.className = `social-ic social-${size}`;
      a.href = l.href; a.target = '_blank'; a.rel = 'noopener';
      a.setAttribute('aria-label', l.label);
      a.innerHTML = ICONS[l.k] || '';
      host.appendChild(a);
    });
  };

  const refreshAll = () => {
    document.querySelectorAll('[data-social-host]').forEach(el => renderInto(el, el.dataset.socialHost || 'md'));
  };

  const init = () => {
    // Inject footer social bar
    const footerCol = document.querySelector('.site-footer .footer-inner > div:first-child');
    if (footerCol && !footerCol.querySelector('[data-social-host]')) {
      const bar = document.createElement('div');
      bar.className = 'social-row';
      bar.setAttribute('data-social-host', 'md');
      footerCol.appendChild(bar);
    }
    refreshAll();
    try { EventBus.on('settings:changed', refreshAll); } catch {}
  };

  return { init, refreshAll, renderInto };
})();

window.SocialService = SocialService;
