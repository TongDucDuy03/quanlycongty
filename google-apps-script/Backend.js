/**
 * Bound Google Sheets web app, execute as owner, access Anyone.
 * The spreadsheet stays private. Every data request requires the installation
 * bearer token or a signed manager session. Both grant full access to payroll.
 * POST text/plain JSON: {action:'load'|'save', token, expectedRevision?, data?}.
 * login uses username/password. configureLogin creates the account ONCE using
 * the installation token. exchange migrates an existing trusted browser.
 * Never put the token in a URL, source code, build environment or repository.
 * No GET data API / JSONP. Follow ContentService's redirect; do not use no-cors.
 * Manual snapshot sync, 2 MiB UTF-8 JSON maximum; no real-time merge or RBAC.
 * Both reads and writes hold the script lock. Two chunk buffers preserve the
 * previous commit if writing fails. One ScriptProperty commits the new manifest
 * LAST, after flushing and checking persisted contents. Projection tabs are
 * reports only: editing them does NOT update the app.
 */
var QLCT = { prefix: 'QLCT_', maxBytes: 2 * 1024 * 1024, publicMaxBytes: 256 * 1024, chunkSize: 40000 };

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

function doGet(e) {
  if (!e || !e.parameter || e.parameter.action !== 'catalog') return json_({ ok: false, code: 'UNAUTHORIZED', message: 'Use the application to connect.' });
  var lock;
  try {
    var config = config_();
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) fail_('BUSY', 'Another operation is running. Try again shortly.');
    // Public reads NEVER open the private snapshot, even for validation/fallback.
    var catalog = readPublic_(SpreadsheetApp.openById(config.spreadsheetId), config);
    return json_({ ok: true, catalog: catalog });
  } catch (error) { return errorResponse_(error); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function doPost(e) {
  var lock;
  try {
    var config = config_();
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > QLCT.maxBytes + 10000) fail_('LIMIT', 'Request exceeds the pilot storage limit.');
    var request;
    try { request = JSON.parse(raw); } catch (_) { fail_('INVALID_DATA', 'Invalid JSON request.'); }
    if (!object_(request)) fail_('INVALID_DATA', 'Invalid request.');
    if (request.action === 'publishCatalog') {
      if (raw.length > 2000) fail_('LIMIT', 'Publication request is too large.');
      authorize_(request.token, config, true);
      if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) fail_('INVALID_DATA', 'A loaded revision is required.');
      lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) fail_('BUSY', 'Another operation is running. Try again shortly.');
      config = config_();
      authorize_(request.token, config, true);
      var publicSourceSheet = SpreadsheetApp.openById(config.spreadsheetId);
      var publicSource = readCommitted_(publicSourceSheet, config);
      if (request.expectedRevision !== publicSource.revision) fail_('CONFLICT', 'Reload the current saved draft before publishing.');
      if (!publicSource.data) fail_('INVALID_DATA', 'Save the company profile before publishing.');
      var publicCatalog;
      try { publicCatalog = QLCTValidation.buildPublicCatalog(publicSource.data, new Date().toISOString()); }
      catch (_) { fail_('INVALID_DATA', 'Check the public profile and product catalog before publishing.'); }
      writePublic_(publicSourceSheet, config, publicCatalog);
      return json_({ ok: true, publishedAt: publicCatalog.publishedAt });
    }
    if (['login', 'configureLogin', 'exchange', 'changePassword'].indexOf(request.action) !== -1) {
      if (raw.length > 2000) fail_('LIMIT', 'Login request is too large.');
      if (request.action === 'changePassword') authorize_(request.token, config, true);
      else if (request.action !== 'login' && !sameToken_(request.token, config.token)) fail_('AUTH_FAILED', 'Invalid credentials.');
      lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) fail_('BUSY', 'Another operation is running. Try again shortly.');
      if (request.action === 'changePassword') {
        authorize_(request.token, config_(), true);
        return json_(changePassword_(request));
      }
      return json_(accountRequest_(request, config));
    }
    authorize_(request.token, config);
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
    // An account update may revoke this session while this request waits.
    config = config_();
    authorize_(request.token, config);
    var ss = SpreadsheetApp.openById(config.spreadsheetId);
    var current = readCommitted_(ss, config);
    if (request.action === 'load') return json_({ ok: true, revision: current.revision, data: current.data, spreadsheetUrl: ss.getUrl() });
    if (request.expectedRevision !== current.revision) fail_('CONFLICT', 'Another device has saved newer data. Download your local backup, then load the latest version.');
    if (!QLCTValidation.validateCommerceTransition(current.data, request.data)) fail_('IMMUTABLE_HISTORY', 'Issued documents and opening balances cannot be removed or rewritten. Void an issued document with a reason instead.');
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
  } catch (error) { return errorResponse_(error); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function publicManifest_() {
  var raw = PropertiesService.getScriptProperties().getProperty('QLCT_PUBLIC_COMMIT');
  if (!raw) return null;
  var manifest;
  try { manifest = JSON.parse(raw); } catch (_) { fail_('CONFIG', 'Published catalog is invalid.'); }
  if (!object_(manifest) || ['PA', 'PB'].indexOf(manifest.slot) < 0 || !Number.isInteger(manifest.chunks) || manifest.chunks < 1 || manifest.chunks > 10 || typeof manifest.checksum !== 'string') fail_('CONFIG', 'Published catalog is invalid.');
  return manifest;
}
function readPublic_(ss, config) {
  var manifest = publicManifest_();
  if (!manifest) return null;
  var serialized = readBuffer_(ss, config, manifest);
  if (Utilities.newBlob(serialized).getBytes().length > QLCT.publicMaxBytes) fail_('CONFIG', 'Published catalog exceeds its limit.');
  var catalog;
  try { catalog = JSON.parse(serialized); } catch (_) { fail_('CONFIG', 'Published catalog is invalid.'); }
  // Strict public keys also defend against manually modified projection tabs.
  if (!QLCTValidation.validatePublicCatalog(catalog)) fail_('CONFIG', 'Published catalog has invalid fields.');
  return catalog;
}
function writePublic_(ss, config, catalog) {
  var serialized = JSON.stringify(catalog);
  if (Utilities.newBlob(serialized).getBytes().length > QLCT.publicMaxBytes) fail_('LIMIT', 'Public catalog exceeds 256 KiB. Shorten text or publish fewer products.');
  var current = publicManifest_();
  var slot = current && current.slot === 'PA' ? 'PB' : 'PA';
  var encoded = Utilities.base64Encode(serialized, Utilities.Charset.UTF_8), chunks = [];
  for (var offset = 0; offset < encoded.length; offset += QLCT.chunkSize) chunks.push(['b64:' + encoded.slice(offset, offset + QLCT.chunkSize)]);
  var sheet = buffer_(ss, config, slot, true);
  if (sheet.getMaxRows() < chunks.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), chunks.length + 1 - sheet.getMaxRows());
  sheet.getRange(2, 1, chunks.length, 1).setValues(chunks);
  SpreadsheetApp.flush();
  var manifest = { slot: slot, chunks: chunks.length, checksum: checksum_(serialized) };
  if (readBuffer_(ss, config, manifest) !== serialized) fail_('INTERNAL', 'Published catalog verification failed.');
  PropertiesService.getScriptProperties().setProperty('QLCT_PUBLIC_COMMIT', JSON.stringify(manifest));
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

// All password KDF inputs are byte arrays. Apps Script V8 has no TextEncoder;
// Utilities performs UTF-8 conversion; noble supplies the cryptographic functions.
function authBytes_(value) { return new Uint8Array(Utilities.newBlob(value).getBytes().map(function (byte) { return byte & 255; })); }
function authHex_(bytes) { return Array.from(bytes).map(function (byte) { return ('0' + byte.toString(16)).slice(-2); }).join(''); }
function passwordHash_(password, salt) {
  return authHex_(QLCTCrypto.pbkdf2(QLCTCrypto.sha256, authBytes_(password), authBytes_(salt), { c: 600000, dkLen: 32 }));
}
function account_() {
  var raw = PropertiesService.getScriptProperties().getProperty('QLCT_LOGIN');
  if (!raw) return null;
  var account;
  try { account = JSON.parse(raw); } catch (_) { fail_('CONFIG', 'Login configuration is invalid.'); }
  if (!object_(account) || !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(account.username || '') || !/^[a-f0-9]{32}$/.test(account.salt || '') || !/^[a-f0-9]{64}$/.test(account.hash || '') || !/^[a-f0-9]{16}$/.test(account.version || '')) fail_('CONFIG', 'Login configuration is invalid.');
  return account;
}
function accountRequest_(request, config) {
  // Caller holds ScriptLock: account creation and attempt accounting are atomic.
  var props = PropertiesService.getScriptProperties();
  var account = account_();
  if (request.action === 'configureLogin') {
    if (account) fail_('LOGIN_ALREADY_CONFIGURED', 'The manager account is already configured.');
    var username = typeof request.username === 'string' ? request.username.trim().toLowerCase() : '';
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || typeof request.password !== 'string' || request.password.length < 12 || request.password.length > 128) fail_('INVALID_DATA', 'Use a username of 3–32 letters/numbers and a password of 12–128 characters.');
    var salt = Utilities.getUuid().replace(/-/g, '');
    account = { username: username, salt: salt, hash: passwordHash_(request.password, salt), version: Utilities.getUuid().replace(/-/g, '').slice(0, 16) };
    props.setProperty('QLCT_LOGIN', JSON.stringify(account));
    return issueSession_(account, config);
  }
  if (!account) fail_('LOGIN_NOT_CONFIGURED', 'The manager account has not been configured yet.');
  if (request.action === 'exchange') return issueSession_(account, config);
  var suppliedUsername = typeof request.username === 'string' ? request.username.trim().toLowerCase() : '';
  verifyCredentials_(request.password, suppliedUsername, account);
  return issueSession_(account, config);
}
function verifyCredentials_(password, username, account, failureCode) {
  // Login and password changes share one atomic rate limit under ScriptLock.
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  var attempts;
  try { attempts = JSON.parse(props.getProperty('QLCT_LOGIN_ATTEMPTS') || 'null'); } catch (_) { attempts = null; }
  if (!object_(attempts) || !Number.isSafeInteger(attempts.until) || !Number.isSafeInteger(attempts.count) || attempts.until <= now) attempts = { count: 0, until: now + 15 * 60 * 1000 };
  if (attempts.count >= 5) fail_('RATE_LIMITED', 'Too many login attempts. Try again after 15 minutes.');
  // Record first, so an interrupted/aborted KDF cannot bypass the attempt limit.
  attempts.count++;
  props.setProperty('QLCT_LOGIN_ATTEMPTS', JSON.stringify(attempts));
  var validPassword = typeof password === 'string' && password.length >= 12 && password.length <= 128;
  var hash = validPassword ? passwordHash_(password, account.salt) : '';
  var validHash = sameToken_(hash, account.hash);
  if (!validHash || !sameToken_(username, account.username)) fail_(failureCode || 'AUTH_FAILED', 'Invalid username or password.');
  props.setProperty('QLCT_LOGIN_ATTEMPTS', JSON.stringify({ count: 0, until: now + 15 * 60 * 1000 }));
}
function changePassword_(request) {
  // Caller holds ScriptLock and has freshly verified a signed session.
  if (typeof request.newPassword !== 'string' || request.newPassword.length < 12 || request.newPassword.length > 128 || request.newPassword === request.currentPassword) fail_('INVALID_DATA', 'Use a different password of 12-128 characters.');
  var account = account_();
  if (!account) fail_('LOGIN_NOT_CONFIGURED', 'The manager account has not been configured yet.');
  verifyCredentials_(request.currentPassword, account.username, account, 'CURRENT_PASSWORD_INVALID');
  var salt = Utilities.getUuid().replace(/-/g, '');
  var replacement = { username: account.username, salt: salt, hash: passwordHash_(request.newPassword, salt), version: Utilities.getUuid().replace(/-/g, '').slice(0, 16) };
  // One property write changes the verifier and invalidates ALL old sessions.
  PropertiesService.getScriptProperties().setProperty('QLCT_LOGIN', JSON.stringify(replacement));
  return { ok: true };
}
function sessionMac_(payload, config) {
  return authHex_(QLCTCrypto.hmac(QLCTCrypto.sha256, authBytes_(config.token), authBytes_('QLCT session v1:' + payload)));
}
function issueSession_(account, config) {
  var expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  var payload = Utilities.base64Encode(JSON.stringify({ u: account.username, v: account.version, e: expiresAt, n: Utilities.getUuid().replace(/-/g, '').slice(0, 16) }), Utilities.Charset.UTF_8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { ok: true, token: 'qlct1.' + payload + '.' + sessionMac_(payload, config), expiresAt: expiresAt, username: account.username };
}
function authorize_(token, config, sessionOnly) {
  if (sameToken_(token, config.token)) {
    if (sessionOnly) fail_('UNAUTHORIZED', 'A signed-in manager session is required.');
    return;
  }
  if (typeof token !== 'string' || token.length > 256 || !/^qlct1\.[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token)) fail_('UNAUTHORIZED', 'Invalid connection key or session.');
  var pieces = token.split('.');
  if (!sameToken_(pieces[2], sessionMac_(pieces[1], config))) fail_('AUTH_FAILED', 'Invalid session. Please sign in again.');
  var payload;
  try {
    var encoded = pieces[1].replace(/-/g, '+').replace(/_/g, '/');
    while (encoded.length % 4) encoded += '=';
    payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8'));
  } catch (_) { fail_('AUTH_FAILED', 'Invalid session. Please sign in again.'); }
  var account = account_();
  if (!object_(payload) || !Number.isSafeInteger(payload.e) || !/^[a-f0-9]{16}$/.test(payload.n || '')) fail_('AUTH_FAILED', 'Invalid session. Please sign in again.');
  if (!account || payload.u !== account.username || payload.v !== account.version || payload.e <= Date.now() || payload.e > Date.now() + 30 * 24 * 60 * 60 * 1000) fail_('SESSION_EXPIRED', 'Session expired. Please sign in again.');
}
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function errorResponse_(error) {
  var codes = ['UNAUTHORIZED', 'CONFLICT', 'INVALID_DATA', 'LIMIT', 'BUSY', 'CONFIG', 'INTERNAL', 'AUTH_FAILED', 'RATE_LIMITED', 'LOGIN_NOT_CONFIGURED', 'LOGIN_ALREADY_CONFIGURED', 'SESSION_EXPIRED', 'CURRENT_PASSWORD_INVALID', 'IMMUTABLE_HISTORY'];
  var known = error && codes.indexOf(error.code) !== -1;
  return json_({ ok: false, code: known ? error.code : 'INTERNAL', message: known ? error.message : 'Google Sheets operation failed. Check the deployment and try loading before saving again.' });
}
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
  if (data.commerce) {
    sections.HoSoCongTy = [data.commerce.company];
    sections.ChungTu = data.commerce.documents;
    sections.SoDuThuDauKy = data.commerce.openingPaid;
    sections.DanhMucGioiThieu = data.commerce.products;
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
