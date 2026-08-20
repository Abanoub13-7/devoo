# المرحلة 8A — Google Products API (Apps Script + Google Sheet)

هذا المجلد يحتوي سكربت Google Apps Script مستقل، **غير مربوط بالموقع حالياً**.

## الملفات
- `google-products.gs` — الكود الكامل (doGet / doPost + عمليات CRUD).

## خطوات التجربة
1. أنشئ Google Sheet جديد (فارغ، أي اسم للملف نفسه).
2. من القائمة: Extensions → Apps Script.
3. احذف محتوى `Code.gs` الافتراضي، والصق محتوى `google-products.gs` كاملاً.
4. Deploy → New deployment → Web app:
   - Execute as: **Me**
   - Who has access: حسب الحاجة (Anyone لتجربة سريعة، يمكن تقييدها لاحقاً)
5. انسخ رابط الـ Web App الناتج (سيُستخدم لاحقاً في مرحلة الربط بالموقع، وليس الآن).
6. أول طلب (GET بدون action، أو أي عملية) سينشئ تلقائياً شيت باسم **Products** مع رؤوس الأعمدة.

## العمليات المتاحة
أرسل POST بصيغة:
```json
{ "action": "getProducts" }
```
```json
{ "action": "addProduct", "payload": { "name": "منتج تجريبي", "price": 100 } }
```
```json
{ "action": "updateProduct", "payload": { "id": "p_xxxxxxxxxxxx", "patch": { "price": 120 } } }
```
```json
{ "action": "deleteProduct", "payload": { "id": "p_xxxxxxxxxxxx" } }
```

جميع الاستجابات JSON بصيغة:
- نجاح: `{ "success": true, "data": ... }`
- خطأ: `{ "success": false, "message": "..." }`

## أعمدة Google Sheet ("Products")
```
ProductID | SKU | Name | Category | Description | Features | Images |
Price | OldPrice | CostPrice | Rating | Stock | Reserved | Active | CreatedAt | UpdatedAt
```
- `Features` و `Images` تُخزَّن كنص مفصول بالرمز `|` وتُعاد كمصفوفة عند القراءة.
- التمييز بين المنتجات يتم عبر `ProductID` فقط.

## ملاحظات مهمة
- لا مصادقة (Authentication) في هذه المرحلة — ستُضاف لاحقاً.
- لا رفع صور إلى Drive، ولا مزامنة تلقائية مع الموقع.
- `js/services/google-products.js` في المشروع لم يُعدَّل ولم يُربط بهذا السكربت بعد.
