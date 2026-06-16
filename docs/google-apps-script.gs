const LOG_SHEET_NAME = "logs";
const SESSION_SHEET_NAME = "sessions";

const LOG_HEADERS = [
  "received_at",
  "id",
  "session_id",
  "user_id",
  "display_name",
  "team_id",
  "type",
  "latitude",
  "longitude",
  "accuracy",
  "status",
  "memo",
  "created_at",
];

const SESSION_HEADERS = [
  "session_id",
  "access_code",
  "label",
  "enabled",
  "created_at",
];

function setup() {
  setupSheet_(LOG_SHEET_NAME, LOG_HEADERS);
  setupSheet_(SESSION_SHEET_NAME, SESSION_HEADERS);
}

function doGet(e) {
  const action = e.parameter.action || "logs";

  if (action === "createSession") {
    return output_(createSession_(e), e.parameter.callback);
  }

  if (action === "logs") {
    return output_(readLogs_(e), e.parameter.callback);
  }

  return output_({ ok: false, error: "unknown action" }, e.parameter.callback);
}

function doPost(e) {
  const action = e.parameter.action || "append";

  if (action === "append") {
    return output_(appendLog_(e), "");
  }

  return output_({ ok: false, error: "unknown action" }, "");
}

function createSession_(e) {
  const sheet = getSheet_(SESSION_SHEET_NAME, SESSION_HEADERS);
  const now = new Date();
  const label = sanitizeText_(e.parameter.label || "training");
  const date = Utilities.formatDate(now, "Asia/Tokyo", "yyyyMMdd");
  const suffix = Utilities.getUuid().slice(0, 4);
  const sessionId = `${date}-nara-${label}-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const accessCode = `${randomDigits_(4)}-${Utilities.getUuid().slice(0, 2).toUpperCase()}`;

  sheet.appendRow([sessionId, accessCode, label, true, now]);

  return {
    ok: true,
    sessionId,
    accessCode,
  };
}

function appendLog_(e) {
  const sessionId = e.parameter.session_id || "";
  const code = e.parameter.code || "";

  if (!isValidSession_(sessionId, code)) {
    return { ok: false, error: "invalid session or access code" };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    const sheet = getSheet_(LOG_SHEET_NAME, LOG_HEADERS);
    sheet.appendRow([
      new Date(),
      e.parameter.id || Utilities.getUuid(),
      sessionId,
      e.parameter.user_id || "",
      e.parameter.display_name || "",
      e.parameter.team_id || "",
      e.parameter.type || "location",
      e.parameter.latitude || "",
      e.parameter.longitude || "",
      e.parameter.accuracy || "",
      e.parameter.status || "",
      e.parameter.memo || "",
      e.parameter.created_at || new Date().toISOString(),
    ]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function readLogs_(e) {
  const sessionId = e.parameter.session || "";
  const code = e.parameter.code || "";

  if (!isValidSession_(sessionId, code)) {
    return { ok: false, error: "invalid session or access code" };
  }

  const sheet = getSheet_(LOG_SHEET_NAME, LOG_HEADERS);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift() || [];

  const logs = values
    .map(row => Object.fromEntries(headers.map((key, index) => [key, row[index]])))
    .filter(row => row.session_id === sessionId)
    .slice(-2000);

  return {
    ok: true,
    sessionId,
    logs,
  };
}

function isValidSession_(sessionId, code) {
  if (!sessionId || !code) return false;

  const sheet = getSheet_(SESSION_SHEET_NAME, SESSION_HEADERS);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift() || [];

  return values.some(row => {
    const item = Object.fromEntries(headers.map((key, index) => [key, row[index]]));
    return item.session_id === sessionId && item.access_code === code && String(item.enabled).toUpperCase() !== "FALSE";
  });
}

function setupSheet_(name, headers) {
  const sheet = getSheet_(name, headers);
  sheet.clear();
  sheet.appendRow(headers);
  sheet.setFrozenRows(1);
}

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function output_(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizeText_(value) {
  return String(value || "").slice(0, 48);
}

function randomDigits_(length) {
  let text = "";
  for (let i = 0; i < length; i += 1) {
    text += Math.floor(Math.random() * 10);
  }
  return text;
}
