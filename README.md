# Devoo Enterprise — v2 (Refactored)

Vanilla HTML / CSS / JavaScript. No build step. Open `index.html` in a modern browser (or serve with any static server).

## Folder structure

```
index.html
css/
  style.css        — original storefront styles
  addons.css       — invoice, uploads, whatsapp, social, mobile, print
js/
  core/
    helpers.js     — image compression, safe JSON, global img fallback
    settings.js    — persisted store settings (logo, contact, social, tax, prefixes)
    engine.js      — original Devoo engine (CONFIG, DB, EventBus, Products, Orders, Cart, Modal, Admin, …)
  services/
    pdf.js         — html2pdf wrapper (Arabic / RTL)
    whatsapp.js    — floating button + order sharing
    social.js      — configurable social icons (footer / menu)
  store/
    invoices.js    — auto-invoice on order:created, view / print / PDF / share
  ui/
    mobile-ux.js   — bottom-nav account, safe-area, keyboard handling, --vh var
    order-actions.js — injects 🧾 + 💬 buttons into order modals
  admin/
    uploads.js     — drag-and-drop image upload widget for the product form
    settings-panel.js — store settings modal
    invoices-tab.js — invoices list inside admin
  main.js          — boots all add-on modules
```

## What's new

* **Mobile UX**: bottom nav with Account button, safe-area padding, anti-zoom inputs, keyboard-aware focus scroll, kill horizontal scroll, `--vh` var, larger touch targets.
* **Admin image upload**: drag-and-drop with automatic canvas compression (≤ 400 KB / 1200 px), thumbnail grid with reorder + delete + "make primary".
* **Store settings**: name, logo, address, phone, email, tax #, footer note, WhatsApp #, Facebook / Instagram / TikTok URLs, invoice prefix.
* **Professional invoices**: auto-generated on every order, format `INV-{YEAR}-####`, RTL layout, status badge, customer block, items table, totals, store branding.
* **PDF export**: real `html2pdf.js` output with A4 / Cairo font, plus dedicated `@media print` CSS for clean printing.
* **WhatsApp**: floating animated FAB (RTL-safe, mobile-aware, never overlaps bottom nav), auto-generated order summary share.
* **Social**: footer + admin-configurable links, opens safely in new tabs.
* **Stability**: global image fallback, safe JSON, defensive try/catch wrappers, defer-loaded scripts, no double event listeners.

## Default admin password

`devoo2026` (unchanged from original — change `CONFIG.adminPassword` in `js/core/engine.js`).

