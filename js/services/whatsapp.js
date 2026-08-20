/* Devoo · WhatsApp — floating button + order sharing */
'use strict';

const WhatsAppService = (() => {
  const clean = (n) => String(n || '').replace(/[^\d]/g, '');

  const buildLink = (message, number) => {
    const n = clean(number || Settings.get().whatsappNumber);
    const m = encodeURIComponent(message || Settings.get().whatsappMessage || '');
    return `https://wa.me/${n}${m ? `?text=${m}` : ''}`;
  };

  const send = (message, number) => {
    if (!clean(number || Settings.get().whatsappNumber)) {
      try { Toast.error('رقم واتساب غير مهيأ من الإعدادات'); } catch {}
      return;
    }
    window.open(buildLink(message, number), '_blank', 'noopener');
  };

  const orderSummary = (order) => {
    const s = Settings.get();
    const lines = [];
    lines.push(`*${s.storeName}* — ملخص الطلب`);
    lines.push(`رقم الطلب: ${order.orderNumber || order.id}`);
    if (order.invoiceNumber) lines.push(`فاتورة: ${order.invoiceNumber}`);
    lines.push(`العميل: ${order.customerSnapshot?.name || ''}`);
    if (order.customerSnapshot?.phone) lines.push(`الجوال: ${order.customerSnapshot.phone}`);
    lines.push('—');
    order.items.forEach(i => lines.push(`• ${i.name} × ${i.qty} — ${money(i.price * i.qty)}`));
    lines.push('—');
    lines.push(`الإجمالي: ${money(order.total)}`);
    lines.push(`الحالة: ${STATUS_LABEL[order.status] || order.status}`);
    return lines.join('\n');
  };

  const shareOrder = (order, customNumber) => {
    const number = customNumber || order.customerSnapshot?.phone || Settings.get().whatsappNumber;
    send(orderSummary(order), number);
  };

  const mountFloatingButton = () => {
    if (document.getElementById('waFab')) return;
    const a = document.createElement('a');
    a.id = 'waFab';
    a.className = 'wa-fab';
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'تواصل عبر واتساب');
    a.innerHTML = `
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <path fill="currentColor" d="M20.52 3.48A11.94 11.94 0 0 0 12.05 0C5.5 0 .19 5.3.19 11.86c0 2.09.55 4.13 1.59 5.93L0 24l6.39-1.67a11.86 11.86 0 0 0 5.66 1.44h.01c6.55 0 11.86-5.3 11.86-11.85 0-3.17-1.23-6.15-3.4-8.44ZM12.05 21.3h-.01a9.43 9.43 0 0 1-4.81-1.32l-.34-.2-3.79.99 1.01-3.7-.22-.38a9.43 9.43 0 0 1-1.45-5.03c0-5.21 4.24-9.44 9.46-9.44 2.52 0 4.89.98 6.67 2.77a9.36 9.36 0 0 1 2.78 6.67c0 5.21-4.24 9.44-9.3 9.44Zm5.42-7.06c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.66.15-.2.3-.76.97-.93 1.17-.17.2-.34.22-.64.07-.3-.15-1.26-.47-2.39-1.48-.88-.78-1.48-1.75-1.65-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.34.45-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.66-1.6-.91-2.19-.24-.57-.49-.5-.66-.51l-.56-.01c-.2 0-.52.07-.79.37s-1.04 1.02-1.04 2.48 1.07 2.88 1.22 3.08c.15.2 2.1 3.22 5.1 4.52.71.31 1.27.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.34Z"/>
      </svg>
      <span class="wa-fab-pulse" aria-hidden="true"></span>
    `;
    document.body.appendChild(a);
    refresh();
  };

  const refresh = () => {
    const a = document.getElementById('waFab');
    if (!a) return;
    a.href = buildLink();
    a.style.display = Settings.get().whatsappNumber ? '' : 'none';
  };

  const init = () => {
    mountFloatingButton();
    try { EventBus.on('settings:changed', refresh); } catch {}
  };

  return { init, send, shareOrder, orderSummary, buildLink, refresh };
})();

window.WhatsAppService = WhatsAppService;
