/* Devoo · Settings — store-wide configurable settings (logo, contact, social, tax, footer note) */
'use strict';

const Settings = (() => {
  const KEY = 'devoo_settings';
  const DEFAULTS = {
    // --- Store Identity ---
    storeName: 'ديفو',
    storeLogo: '', // base64 data url or http url (Logo URL)
    faviconUrl: '',
    currencyName: 'جنيه مصري',
    currencySymbol: 'ج.م',

    // --- Contact Information ---
    storeAddress: 'القاهرة، مصر',
    storePhone: '+20 100 000 0000',
    storeEmail: 'hello@devoo.example',
    whatsappNumber: '201000000000',
    whatsappMessage: 'مرحباً، أرغب بالاستفسار عن منتجاتكم.',

    // --- Tax Settings ---
    taxNumber: '',
    taxEnabled: true,
    taxRate: 14, // percentage

    // --- Shipping Settings ---
    shippingEnabled: true,
    shippingCost: 50,
    freeShippingEnabled: true,
    freeShippingThreshold: 1000,

    // --- Invoice Settings ---
    invoicePrefix: 'INV',
    footerNote: 'شكراً لتسوّقك من ديفو 💛', // Invoice Footer
    invoiceNotes: '',

    // --- Social ---
    facebookUrl: 'https://facebook.com/',
    instagramUrl: 'https://instagram.com/',
    tiktokUrl: '',

    // --- Google Integration ---
    googleAppsScriptUrl: '',
  };

  const get = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
    } catch { return { ...DEFAULTS }; }
  };

  const save = (patch) => {
    const next = { ...get(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { console.warn('[Settings] save failed', e); }
    try { EventBus.emit('settings:changed', next); } catch {}
    return next;
  };

  const reset = () => { try { localStorage.removeItem(KEY); } catch {} EventBus.emit('settings:changed', get()); };

  return { get, save, reset, DEFAULTS };
})();

window.Settings = Settings;
