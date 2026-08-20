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
المشاكل
تعديلات عامة
1- وضع اعدادات المتجر والفواتير داخل "دخول الموظفين"
2-اسم المتجر اللي هو ديفو اللي موجود ف اي مكان في الموقع لازم يكون متغير ولو غيرته من اعدادت المتجر يتم تغييره بكل سهولة من كل الاماكن اللي بتحتوي فيها علي اسم المتجر وكذلك ايضا شعار المتجر
3-ال pdf اللي موجود في الفاتورة لا يعمل محتاج مراجعه
4- زر الواتساب اللي ف الفاتورة لا يعمل بشكل صحيح
5-الفواتير مينفعش تكون موجودة كلها في الموقع والعملاء يشوفوها كده لازم البحث يكون برقم الطلب او رقم الهاتف ولما يظهر تتبع الطلب لازم يظهر معاها زر لعرض فاتورة الطلب بتاريخ الطلب علشان لو العميل عنده اكتر من فاتورة بنفس الرقم كمان مينفعش العميل يشوف فاتورة عميل تاني 
6- تقييمات العملاء مش عايزها تظهر عند عرض المنتج خليها في الموقع من الخارج بس
7-لازم يكون فيه زر تتبع للطلب - وكمان يكون فيه عرض لفاتورة الطلب دا 
8- التنسيقات لازم تتظبط علي قد الهواتف بالاخص وتكون مرنة 

تعديلات في البنية
1- مسار الطلب اللي موجود الطلبات لما ندوس علي زر عرض الطلب لازم يتشال خالص ونتعامل علي مرحلة الطلب (Order Lifecycle)
2- الحالة والاجراءات اللي فيها اختيارات (مسودة - قيد الانتظار - مؤكد -وغيرها..) لازم تتشال برضوا ويتعمل مكانها مرحلة الطلب (Order Lifecycle) لان دا اللي هنمشي عبيه فيما بعد
3- الجزء الخاص بالفئات لازم يتم التحكم فيه من خلال الادارة ويتم اضافه او حذف او تعديل فيه 
4- الجزء الخاص بالبحث لا يعمل محتاج مراجعه
تعديلات في التخزين لسه ف المراحل القادمة
