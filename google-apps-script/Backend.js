/**
 * Bound Google Sheets web app, execute as owner, access Anyone.
 * The spreadsheet stays private. Every data request requires the installation
 * bearer token; anyone holding it has FULL access, including payroll.
 * POST text/plain JSON: {action:'load'|'save', token, expectedRevision?, data?}.
 * Never put the token in a URL, source code, build environment or repository.
 * No GET data API / JSONP. Follow ContentService's redirect; do not use no-cors.
 * Manual snapshot sync, 2 MiB UTF-8 JSON maximum; no real-time merge or RBAC.
 * Both reads and writes hold the script lock. Two chunk buffers preserve the
 * previous commit if writing fails. One ScriptProperty commits the new manifest
 * LAST, after flushing and checking persisted contents. Projection tabs are
 * reports only: editing them does NOT update the app.
 */
var QLCT = { prefix: 'QLCT_', maxBytes: 2 * 1024 * 1024, chunkSize: 40000 };

/** Run manually in the bound spreadsheet once. Re-running preserves data/key. */
function setup() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Open Apps Script from the target Google Sheet first.');
    var storedId = props.getProperty('QLCT_SPREADSHEET_ID');
    if (storedId && storedId !== ss.getId()) throw new Error('Installation already belongs to another spreadsheet.');
    if (!storedId) props.setProperty('QLCT_SPREADSHEET_ID', ss.getId());
    if (!props.getProperty('QLCT_NAMESPACE')) props.setProperty('QLCT_NAMESPACE', Utilities.getUuid().replace(/-/g, '').slice(0, 12));
    if (!props.getProperty('QLCT_TOKEN')) props.setProperty('QLCT_TOKEN', [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid()].join('').replace(/-/g, ''));
    var config = config_();
    buffer_(ss, config, 'A', true);
    buffer_(ss, config, 'B', true);
    SpreadsheetApp.flush();
    // These logs are only produced by this MANUAL setup function, never requests.
    console.log('Spreadsheet: ' + ss.getUrl());
    console.log('Connection key (keep private): ' + config.token);
  } finally { lock.releaseLock(); }
}

function doGet() {
  return json_({ ok: false, code: 'UNAUTHORIZED', message: 'Use the application to connect.' });
}

function doPost(e) {
  var lock;
  try {
    var config = config_();
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > QLCT.maxBytes + 10000) fail_('LIMIT', 'Request exceeds the pilot storage limit.');
    var request;
    try { request = JSON.parse(raw); } catch (_) { fail_('INVALID_DATA', 'Invalid JSON request.'); }
    if (!object_(request) || !sameToken_(request.token, config.token)) fail_('UNAUTHORIZED', 'Invalid connection key.');
    if (request.action !== 'load' && request.action !== 'save') fail_('INVALID_DATA', 'Unknown action.');
    var serialized;
    if (request.action === 'save') {
      if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) fail_('INVALID_DATA', 'A loaded revision is required.');
      validateSnapshot_(request.data);
      serialized = JSON.stringify(request.data);
      if (Utilities.newBlob(serialized).getBytes().length > QLCT.maxBytes) fail_('LIMIT', 'Snapshot exceeds 2 MiB. Export and archive older data first.');
    }
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) fail_('BUSY', 'Another operation is running. Try again shortly.');
    var ss = SpreadsheetApp.openById(config.spreadsheetId);
    var current = readCommitted_(ss, config);
    if (request.action === 'load') return json_({ ok: true, revision: current.revision, data: current.data, spreadsheetUrl: ss.getUrl() });
    if (request.expectedRevision !== current.revision) fail_('CONFLICT', 'Another device has saved newer data. Download your local backup, then load the latest version.');
    if (current.revision >= Number.MAX_SAFE_INTEGER) fail_('LIMIT', 'Revision limit reached.');
    var slot = current.slot === 'A' ? 'B' : 'A';
    var encoded = Utilities.base64Encode(serialized, Utilities.Charset.UTF_8);
    var chunks = [];
    for (var offset = 0; offset < encoded.length; offset += QLCT.chunkSize) chunks.push(['b64:' + encoded.slice(offset, offset + QLCT.chunkSize)]);
    var sheet = buffer_(ss, config, slot, false);
    if (sheet.getMaxRows() < chunks.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), chunks.length + 1 - sheet.getMaxRows());
    // Stale trailing chunks are ignored through manifest.chunks. Never clear the
    // committed buffer, so an interrupted write cannot destroy the current data.
    sheet.getRange(2, 1, chunks.length, 1).setValues(chunks);
    SpreadsheetApp.flush();
    var manifest = { revision: current.revision + 1, slot: slot, chunks: chunks.length, checksum: checksum_(serialized) };
    var verified = readBuffer_(ss, config, manifest);
    if (verified !== serialized) fail_('INTERNAL', 'Storage verification failed; previous version remains active.');
    PropertiesService.getScriptProperties().setProperty('QLCT_COMMIT', JSON.stringify(manifest));
    var result = { ok: true, revision: manifest.revision, spreadsheetUrl: ss.getUrl() };
    try { project_(ss, config, request.data, manifest.revision); }
    catch (_) { result.warning = 'Data saved. Some report tabs could not be refreshed; load from the app remains authoritative.'; }
    return json_(result);
  } catch (error) {
    var codes = ['UNAUTHORIZED', 'CONFLICT', 'INVALID_DATA', 'LIMIT', 'BUSY', 'CONFIG', 'INTERNAL'];
    var known = error && codes.indexOf(error.code) !== -1;
    return json_({ ok: false, code: known ? error.code : 'INTERNAL', message: known ? error.message : 'Google Sheets operation failed. Check the deployment and try loading before saving again.' });
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function config_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('QLCT_TOKEN');
  var spreadsheetId = props.getProperty('QLCT_SPREADSHEET_ID');
  var namespace = props.getProperty('QLCT_NAMESPACE');
  if (!token || token.length < 32 || token.length > 256 || !spreadsheetId || !/^[a-f0-9]{12}$/.test(namespace || '')) fail_('CONFIG', 'Run setup() in the bound spreadsheet first.');
  return { token: token, spreadsheetId: spreadsheetId, namespace: namespace };
}
function buffer_(ss, config, slot, create) {
  var name = QLCT.prefix + config.namespace + '_' + slot;
  var marker = 'QLCT snapshot v1 / ' + config.namespace + ' / ' + slot;
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    if (!create) fail_('CONFIG', 'A storage tab is missing. Restore it before saving.');
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1).setValue(marker);
  }
  if (sheet.getRange(1, 1).getValue() !== marker) fail_('CONFIG', 'Storage tab identity does not match. No data was overwritten.');
  return sheet;
}
function readCommitted_(ss, config) {
  var raw = PropertiesService.getScriptProperties().getProperty('QLCT_COMMIT');
  if (!raw) return { revision: 0, data: null, slot: null };
  var manifest;
  try { manifest = JSON.parse(raw); } catch (_) { fail_('CONFIG', 'Invalid commit manifest. Restore a backup.'); }
  if (!object_(manifest) || !Number.isSafeInteger(manifest.revision) || manifest.revision < 1 || ['A', 'B'].indexOf(manifest.slot) < 0 || !Number.isInteger(manifest.chunks) || manifest.chunks < 1 || manifest.chunks > 75 || typeof manifest.checksum !== 'string') fail_('CONFIG', 'Invalid commit manifest. Restore a backup.');
  var data;
  try { data = JSON.parse(readBuffer_(ss, config, manifest)); } catch (error) { if (error.code) throw error; fail_('CONFIG', 'Stored JSON is invalid. Restore a backup.'); }
  validateSnapshot_(data);
  return { revision: manifest.revision, data: data, slot: manifest.slot };
}
function readBuffer_(ss, config, manifest) {
  var rows = buffer_(ss, config, manifest.slot, false).getRange(2, 1, manifest.chunks, 1).getValues();
  var encoded = rows.map(function (row) {
    if (typeof row[0] !== 'string' || !/^b64:[A-Za-z0-9+/=]+$/.test(row[0])) fail_('CONFIG', 'Snapshot chunks have been changed. Restore a backup.');
    return row[0].slice(4);
  }).join('');
  var value = Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8');
  if (checksum_(value) !== manifest.checksum) fail_('CONFIG', 'Snapshot checksum mismatch. Restore a backup.');
  return value;
}
function checksum_(text) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}
function sameToken_(input, expected) {
  if (typeof input !== 'string' || input.length !== expected.length) return false;
  var difference = 0;
  for (var i = 0; i < expected.length; i++) difference |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code, message) { var error = new Error(message); error.code = code; throw error; }
function object_(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

/** Resource bounds plus the exact validator bundled from the frontend source. */
function validateSnapshot_(data) {
  function invalid() { fail_('INVALID_DATA', 'Snapshot does not match the application data format.'); }
  var nodes = 0;
  function tree(value, depth) {
    if (++nodes > 400000 || depth > 16) invalid();
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') { if (value.length > 10000) invalid(); return; }
    if (typeof value === 'number') { if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) invalid(); return; }
    if (Array.isArray(value)) { if (value.length > 50000) invalid(); value.forEach(function (v) { tree(v, depth + 1); }); return; }
    if (!object_(value)) invalid();
    Object.keys(value).forEach(function (key) { if (key.length > 100 || ['__proto__', 'prototype', 'constructor'].indexOf(key) >= 0) invalid(); tree(value[key], depth + 1); });
  }
  tree(data, 0);
  if (!QLCTValidation.validateData(data)) invalid();
}

/** All strings (including nested JSON) are literal cells, never formulas. */
function cell_(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  var text = typeof value === 'string' ? value : JSON.stringify(value);
  // Projection cells have a smaller limit; full data stays in the snapshot.
  return "'" + (text.length > 45000 ? text.slice(0, 44900) + ' [see app for full value]' : text);
}
function project_(ss, config, data, revision) {
  var sections = { DonHang: data.orders, KhachHang: data.customers, VatTu: data.materials, NhapXuat: data.movements };
  if (data.payroll) {
    sections.NhanVien = data.payroll.employees;
    sections.ChamCong = data.payroll.attendance;
    sections.PhuCap = data.payroll.allowanceTypes;
    sections.DieuChinhLuong = data.payroll.adjustments;
    sections.KyLuong = data.payroll.periods;
    sections.CauHinhLuong = [data.payroll.settings];
  }
  // Also clear obsolete payroll projections when loading an old non-payroll backup.
  ['NhanVien', 'ChamCong', 'PhuCap', 'DieuChinhLuong', 'KyLuong', 'CauHinhLuong'].forEach(function (name) { if (!sections[name]) sections[name] = []; });
  Object.keys(sections).forEach(function (section) {
    var name = QLCT.prefix + config.namespace + '_' + section;
    var marker = 'QLCT report / ' + config.namespace + ' / ' + section;
    var sheet = ss.getSheetByName(name);
    if (!sheet) { sheet = ss.insertSheet(name); sheet.getRange(1, 1).setValue(marker); }
    if (sheet.getRange(1, 1).getValue() !== marker) throw new Error('Report identity mismatch.');
    var records = sections[section];
    var headers = [];
    records.forEach(function (record) { Object.keys(record).forEach(function (key) { if (headers.indexOf(key) < 0) headers.push(key); }); });
    if (!headers.length) headers = ['(empty)'];
    var values = [headers.map(cell_)].concat(records.map(function (record) { return headers.map(function (key) { return cell_(record[key]); }); }));
    if (sheet.getMaxRows() < values.length + 2) sheet.insertRowsAfter(sheet.getMaxRows(), values.length + 2 - sheet.getMaxRows());
    if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getMaxColumns()).clearContent();
    sheet.getRange(2, 1).setValue('Report revision ' + revision + ' — edit data in the application');
    sheet.getRange(3, 1, values.length, headers.length).setValues(values);
    sheet.setFrozenRows(3);
  });
  SpreadsheetApp.flush();
}
