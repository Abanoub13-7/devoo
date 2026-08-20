/* Devoo · Mobile UX — bottom nav, keyboard handling, safe-area, viewport polish */
'use strict';

const MobileUX = (() => {
  const _injectAccountBtn = () => {
    const nav = document.getElementById('bottomNav');
    if (!nav || nav.querySelector('[data-bn="account"]')) return;
    const a = document.createElement('a');
    a.href = '#'; a.dataset.bn = 'account'; a.id = 'bottomAccountBtn';
    a.innerHTML = '<span class="bn-ic">👤</span><span>حسابي</span>';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      try { UI.openMyOrders(); } catch { location.hash = '#orders'; }
    });
    nav.appendChild(a);
  };

  const _scrollFocusIntoView = () => {
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (!t || !t.matches('input, textarea, select')) return;
      // Wait for keyboard to open
      setTimeout(() => { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} }, 250);
    });
  };

  const _setViewportVar = () => {
    const set = () => document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    set();
    window.addEventListener('resize', set, { passive: true });
    window.addEventListener('orientationchange', set);
  };

  const _killHorizontalScroll = () => {
    // Body level: stop unintended horizontal overflow caused by inline RTL artifacts
    document.documentElement.style.overflowX = 'hidden';
    document.body.style.overflowX = 'hidden';
  };

  const init = () => {
    _injectAccountBtn();
    _scrollFocusIntoView();
    _setViewportVar();
    _killHorizontalScroll();
  };

  return { init };
})();

window.MobileUX = MobileUX;
