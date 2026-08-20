/**
 * Devoo · Google Products API — المرحلة 8A
 * -----------------------------------------------------------------------
 * Google Apps Script قائم بذاته، مستقل عن الموقع تماماً في هذه المرحلة.
 * دوره: تهيئة Google Sheet باسم "Products" وتوفير عمليات CRUD أساسية
 * عبر Web App (doGet / doPost) بصيغة JSON فقط.
 *
 * ⚠ هذه المرحلة لا تربط الموقع بهذا السكربت. GoogleProductsService في
 *   الموقع (js/services/google-products.js) يبقى كما هو بدون أي تعديل،
 *   وسيتم الربط الفعلي في مرحلة لاحقة.
 *
 * طريقة النشر:
 *  1) افتح script.google.com وأنشئ مشروع جديد، الصق هذا الملف كاملاً.
 *  2) من "Deploy" → "New deployment" → اختر النوع "Web app".
 *  3) Execute as: Me | Who has access: Anyone (أو حسب الحاجة لاحقاً).
 *  4) انسخ رابط الـ Web App الناتج (سيُستخدم لاحقاً في مرحلة الربط).
 *  5) أول تشغيل لأي طلب سينشئ تلقائياً Sheet باسم "Products" مع الأعمدة
 *     المطلوبة إن لم تكن موجودة.
 * -----------------------------------------------------------------------
 */

'use strict';

/* ==========================================================================
 * الإعدادات العامة
 * ========================================================================== */

// اسم الشيت الذي يخزن المنتجات.
var SHEET_NAME = 'Products';

// رؤوس الأعمدة — مطابقة لحقول المنتج في المشروع (id/sku/name/... إلخ)
// مع إضافة Active / CreatedAt / UpdatedAt فقط، بدون أي أعمدة إضافية.
var HEADERS = [
  'ProductID',   // = product.id
  'SKU',         // = product.sku
  'Name',        // = product.name
  'Category',    // = product.category
  'Description', // = product.description
  'Features',    // = product.features (Array -> نص مفصول بـ |)
  'Images',      // = product.images   (Array -> نص مفصول بـ |)
  'Price',       // = product.price
  'OldPrice',    // = product.oldPrice
  'CostPrice',   // = product.costPrice
  'Rating',      // = product.rating
  'Stock',       // = product.stock
  'Reserved',    // = product.reserved
  'Active',      // إضافة هذه المرحلة
  'CreatedAt',   // إضافة هذه المرحلة
  'UpdatedAt',   // إضافة هذه المرحلة
];

// الفاصل المستخدم لتخزين المصفوفات (Features / Images) كنص داخل الخلية.
var ARRAY_SEPARATOR = '|';

// أعمدة يجب معاملتها كأرقام عند القراءة/الكتابة.
var NUMERIC_FIELDS = ['Price', 'OldPrice', 'CostPrice', 'Rating', 'Stock', 'Reserved', 'CreatedAt', 'UpdatedAt'];

// أعمدة يجب معاملتها كمصفوفات (Array) مفصولة بـ ARRAY_SEPARATOR.
var ARRAY_FIELDS = ['Features', 'Images'];

/* ==========================================================================
 * نقاط الدخول: doGet / doPost
 * ========================================================================== */

/**
 * doGet(e)
 * يدعم استدعاء العمليات القرائية عبر GET لأغراض الاختبار السريع:
 *   ?action=getProducts
 * وأي استدعاء بدون action يعيد رسالة تعريفية بالـ API.
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || '';

    if (!action) {
      return _jsonResponse({
        success: true,
        data: {
          service: 'Devoo Google Products API',
          stage: '8A',
          availableActions: ['getProducts', 'addProduct', 'updateProduct', 'deleteProduct'],
        },
      });
    }

    var payload = params.payload ? _safeParseJSON(params.payload) : params;
    return _jsonResponse(_route(action, payload));
  } catch (err) {
    return _jsonResponse(_errorResponse(err));
  }
}

/**
 * doPost(e)
 * نقطة الدخول الرئيسية. يتوقع جسم الطلب بصيغة JSON:
 *   { "action": "getProducts" | "addProduct" | "updateProduct" | "deleteProduct", "payload": {...} }
 */
function doPost(e) {
  try {
    var body = (e && e.postData && e.postData.contents) ? _safeParseJSON(e.postData.contents) : {};
    var action = (body && body.action) || (e && e.parameter && e.parameter.action) || '';
    var payload = (body && body.payload) || {};

    if (!action) {
      return _jsonResponse(_errorResponse('العملية (action) مطلوبة.'));
    }

    return _jsonResponse(_route(action, payload));
  } catch (err) {
    return _jsonResponse(_errorResponse(err));
  }
}

/**
 * موجّه العمليات — يربط اسم العملية بالدالة المسؤولة عنها.
 * أي خطأ يُلتقط هنا أيضاً حتى لا يتوقف تنفيذ السكربت أبداً.
 */
function _route(action, payload) {
  try {
    switch (action) {
      case 'getProducts':
        return { success: true, data: getProducts() };

      case 'addProduct':
        return { success: true, data: addProduct(payload) };

      case 'updateProduct':
        return { success: true, data: updateProduct(payload) };

      case 'deleteProduct':
        return { success: true, data: deleteProduct(payload) };

      default:
        return { success: false, message: 'عملية غير معروفة: ' + action };
    }
  } catch (err) {
    return _errorResponse(err);
  }
}

/* ==========================================================================
 * العمليات الأربع المطلوبة: getProducts / addProduct / updateProduct / deleteProduct
 * ========================================================================== */

/**
 * getProducts()
 * يعيد جميع المنتجات المخزّنة في الشيت كمصفوفة كائنات.
 */
function getProducts() {
  var sheet = _getOrCreateSheet();
  var rows = _readAllRows(sheet);
  return rows.map(_rowToProduct);
}

/**
 * addProduct(payload)
 * يضيف منتجاً جديداً. يولّد ProductID تلقائياً إن لم يُرسل، ويضبط
 * CreatedAt / UpdatedAt / Active تلقائياً.
 */
function addProduct(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('بيانات المنتج (payload) مطلوبة.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = _getOrCreateSheet();
    var now = Date.now();

    var id = String(payload.id || payload.ProductID || '').trim() || _generateProductId();

    // منع تكرار ProductID
    if (_findRowIndexById(sheet, id) !== -1) {
      throw new Error('يوجد منتج بنفس ProductID مسبقاً: ' + id);
    }

    var product = _normalizeProduct(payload, {
      ProductID: id,
      CreatedAt: now,
      UpdatedAt: now,
      Active: payload.active !== undefined ? payload.active : (payload.Active !== undefined ? payload.Active : true),
    });

    sheet.appendRow(_productToRow(product));
    return product;
  } finally {
    lock.releaseLock();
  }
}

/**
 * updateProduct(payload)
 * يتوقع { id, patch } (متوافق مع GoogleProductsService.updateProduct)
 * ويقوم بتحديث الحقول الموجودة في patch فقط، مع تحديث UpdatedAt تلقائياً.
 */
function updateProduct(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('بيانات التحديث (payload) مطلوبة.');
  }

  var id = String(payload.id || payload.ProductID || '').trim();
  var patch = payload.patch || payload;
  if (!id) throw new Error('ProductID مطلوب للتحديث.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = _getOrCreateSheet();
    var rowIndex = _findRowIndexById(sheet, id);
    if (rowIndex === -1) throw new Error('لا يوجد منتج بهذا الـ ProductID: ' + id);

    var existingRow = sheet.getRange(rowIndex + 1, 1, 1, HEADERS.length).getValues()[0];
    var existingProduct = _rowToProduct(existingRow);

    var merged = _normalizeProduct(patch, existingProduct, /*isUpdate*/ true);
    merged.ProductID = id; // لا يمكن تغيير المعرف
    merged.CreatedAt = existingProduct.CreatedAt; // لا يتغير عند التحديث
    merged.UpdatedAt = Date.now();

    sheet.getRange(rowIndex + 1, 1, 1, HEADERS.length).setValues([_productToRow(merged)]);
    return merged;
  } finally {
    lock.releaseLock();
  }
}

/**
 * deleteProduct(payload)
 * يتوقع { id }. يحذف الصف المطابق لـ ProductID.
 */
function deleteProduct(payload) {
  var id = String((payload && (payload.id || payload.ProductID)) || '').trim();
  if (!id) throw new Error('ProductID مطلوب للحذف.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = _getOrCreateSheet();
    var rowIndex = _findRowIndexById(sheet, id);
    if (rowIndex === -1) throw new Error('لا يوجد منتج بهذا الـ ProductID: ' + id);

    sheet.deleteRow(rowIndex + 1);
    return { id: id, deleted: true };
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
 * تهيئة الشيت
 * ========================================================================== */

/**
 * يحصل على شيت "Products"، وينشئه مع رؤوس الأعمدة إن لم يكن موجوداً.
 */
function _getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  _ensureHeaders(sheet);
  return sheet;
}

/**
 * يتأكد أن الصف الأول يحتوي رؤوس الأعمدة الصحيحة، وينشئها إذا كان الشيت فارغاً.
 */
function _ensureHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  var firstRow = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

  var hasHeaders = firstRow.length > 0 && String(firstRow[0]).trim() === HEADERS[0];
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

/* ==========================================================================
 * أدوات القراءة/الكتابة والتحويل بين صفوف الشيت وكائن المنتج
 * ========================================================================== */

/** يقرأ كل الصفوف (بدون رأس الجدول) كمصفوفة مصفوفات خام. */
function _readAllRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = HEADERS.length;
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

/** يبحث عن رقم صف (1-indexed) بحسب ProductID، ويعيد -1 إن لم يجده. */
function _findRowIndexById(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // +2: تعويض رأس الجدول + الفهرسة من 1
  }
  return -1;
}

/** يحوّل صف خام من الشيت إلى كائن منتج بصيغة JSON متوقعة. */
function _rowToProduct(row) {
  var obj = {};
  for (var i = 0; i < HEADERS.length; i++) {
    var key = HEADERS[i];
    var val = row[i];

    if (ARRAY_FIELDS.indexOf(key) !== -1) {
      obj[key] = _stringToArray(val);
    } else if (NUMERIC_FIELDS.indexOf(key) !== -1) {
      obj[key] = val === '' || val === null || val === undefined ? 0 : Number(val);
    } else if (key === 'Active') {
      obj[key] = _toBoolean(val);
    } else {
      obj[key] = val === null || val === undefined ? '' : String(val);
    }
  }
  return obj;
}

/** يحوّل كائن منتج (بصيغة الأعمدة) إلى صف خام جاهز للكتابة في الشيت. */
function _productToRow(product) {
  return HEADERS.map(function (key) {
    var val = product[key];

    if (ARRAY_FIELDS.indexOf(key) !== -1) {
      return _arrayToString(val);
    }
    if (NUMERIC_FIELDS.indexOf(key) !== -1) {
      return Number(val) || 0;
    }
    if (key === 'Active') {
      return _toBoolean(val);
    }
    return val === null || val === undefined ? '' : String(val);
  });
}

/**
 * يدمج بيانات واردة (payload بحقول Product الأصلية مثل name/price/images…)
 * مع كائن أساس (base) بصيغة أعمدة الشيت، وينتج كائن منتج كامل بصيغة الأعمدة.
 * يقبل أسماء الحقول بصيغتيْ المشروع (name, oldPrice, ...) وبصيغة الأعمدة
 * (Name, OldPrice, ...) لتفادي أي التباس في التسمية.
 */
function _normalizeProduct(input, base) {
  input = input || {};
  base = base || {};

  var fieldMap = {
    ProductID: ['ProductID', 'id'],
    SKU: ['SKU', 'sku'],
    Name: ['Name', 'name'],
    Category: ['Category', 'category'],
    Description: ['Description', 'description'],
    Features: ['Features', 'features'],
    Images: ['Images', 'images'],
    Price: ['Price', 'price'],
    OldPrice: ['OldPrice', 'oldPrice'],
    CostPrice: ['CostPrice', 'costPrice'],
    Rating: ['Rating', 'rating'],
    Stock: ['Stock', 'stock'],
    Reserved: ['Reserved', 'reserved'],
    Active: ['Active', 'active'],
    CreatedAt: ['CreatedAt', 'createdAt'],
    UpdatedAt: ['UpdatedAt', 'updatedAt'],
  };

  var result = {};
  HEADERS.forEach(function (key) {
    var aliases = fieldMap[key];
    var value;
    for (var i = 0; i < aliases.length; i++) {
      if (input[aliases[i]] !== undefined) { value = input[aliases[i]]; break; }
    }
    if (value === undefined) {
      value = base[key] !== undefined ? base[key] : (ARRAY_FIELDS.indexOf(key) !== -1 ? [] : '');
    }

    if (ARRAY_FIELDS.indexOf(key) !== -1 && !Array.isArray(value)) {
      value = _stringToArray(value);
    }
    result[key] = value;
  });

  return result;
}

/* ==========================================================================
 * أدوات مساعدة عامة
 * ========================================================================== */

function _generateProductId() {
  return 'p_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function _stringToArray(val) {
  if (Array.isArray(val)) return val.map(function (s) { return String(s).trim(); }).filter(Boolean);
  var str = String(val || '').trim();
  if (!str) return [];
  return str.split(ARRAY_SEPARATOR).map(function (s) { return s.trim(); }).filter(Boolean);
}

function _arrayToString(val) {
  if (Array.isArray(val)) return val.map(function (s) { return String(s).trim(); }).filter(Boolean).join(ARRAY_SEPARATOR);
  return String(val || '');
}

function _toBoolean(val) {
  if (typeof val === 'boolean') return val;
  var str = String(val).trim().toLowerCase();
  return str === 'true' || str === '1' || str === 'yes';
}

function _safeParseJSON(str) {
  try { return JSON.parse(str); } catch (e) { return {}; }
}

function _errorResponse(err) {
  var message = (err && err.message) ? err.message : String(err);
  return { success: false, message: message };
}

/** يبني استجابة JSON نصيّة صالحة كمخرجات لـ doGet/doPost. */
function _jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
