/* Devoo · Admin Invoices Tab — adds a "Invoices" entry-point + dedicated list view
   Rendered as a floating button inside the admin shell once it appears. */
'use strict';

const InvoicesTab = (() => {
  const _rowsHTML = (all) => all.length ? all.map(inv => `
      <tr data-inv="${esc(inv.id)}">
        <td>${esc(inv.number)}</td>
        <td>${esc(inv.snapshot?.customer?.name || '—')}</td>
        <td>${money(inv.snapshot?.total || 0)}</td>
        <td>${esc(fmtDate(inv.createdAt))}</td>
        <td style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" data-act="open">عرض / PDF</button>
          <button class="btn btn-danger btn-sm" data-act="delete">حذف</button>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="5" class="empty-row">لا توجد فواتير بعد</td></tr>`;

  const open = () => {
    const body = `
      <div class="inv-list-wrap">
        <table class="inv-list-table">
          <thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>الإجمالي</th><th>التاريخ</th><th></th></tr></thead>
          <tbody id="invListBody">${_rowsHTML(Invoices.list())}</tbody>
        </table>
      </div>`;
    const footer = `<button class="btn btn-ghost" data-close>إغلاق</button>`;
    const { close, root } = Modal.open({ title: 'الفواتير', body, footer, size: 'large' });

    root.addEventListener('click', async (e) => {
      const openBtn = e.target.closest('button[data-act="open"]');
      if (openBtn) {
        const row = openBtn.closest('tr'); if (!row) return;
        Invoices.open(row.dataset.inv);
        return;
      }
      const delBtn = e.target.closest('button[data-act="delete"]');
      if (delBtn) {
        const row = delBtn.closest('tr'); if (!row) return;
        const ok = await Modal.confirm({
          title: 'حذف الفاتورة',
          message: 'سيتم حذف هذه الفاتورة فقط، ولن يتأثر الطلب المرتبط بها. هذا الإجراء لا يمكن التراجع عنه.',
          confirmLabel: 'حذف', danger: true,
        });
        if (!ok) return;
        Invoices.remove(row.dataset.inv);
        Toast.success('تم حذف الفاتورة.');
        root.querySelector('#invListBody').innerHTML = _rowsHTML(Invoices.list());
      }
    });
  };

  // Entry point is now a nav link inside the authenticated admin sidebar
  // (see Admin._renderShell in engine.js) instead of a public footer button.
  const init = () => {};

  return { init, open };
})();

window.InvoicesTab = InvoicesTab;
