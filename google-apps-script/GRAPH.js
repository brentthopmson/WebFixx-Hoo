// GRAPH control-plane helpers (Apps Script). Auto-included by GAS project.

var GRAPH_SHEET_NAME = "GRAPH";
var GRAPH_COLUMNS = [
  "deviceId","userId","projectId","templateId","platform","agentType","agentVersion",
  "pairedAt","status","approvedRoots","graphIndexFileId","graphIndexUrl",
  "graphIndexSize","lastIndexedAt","lastSeenAt","tokenHash","server","audit"
];

function getGraphSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GRAPH_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(GRAPH_SHEET_NAME);
    sheet.appendRow(GRAPH_COLUMNS);
  }
  // ensure headers
  var headers = sheet.getRange(1,1,1,sheet.getLastColumn() || 1).getValues()[0];
  if (!headers || headers[0] !== "deviceId") {
    sheet.getRange(1,1,1,GRAPH_COLUMNS.length).setValues([GRAPH_COLUMNS]);
  }
  return sheet;
}

function graphSheetToObjects() {
  var sheet = getGraphSheet();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { headers: values[0] || GRAPH_COLUMNS, rows: [] };
  var headers = values[0];
  var rows = values.slice(1);
  return { headers: headers, rows: rows };
}

function rowToObject(headers, row) {
  var o = {};
  for (var i = 0; i < headers.length; i++) o[headers[i]] = row[i];
  return o;
}

function getBestServerlessEndpoint() { return String(CONFIG ? CONFIG.EXTERNAL_API : ""); }
function resolveEngineUrl() { return String(CONFIG ? CONFIG.EXTERNAL_API : ""); }
function getServerForBrowserId(browserId) { return resolveEngineUrl(); }

function listGraphDevices(params) {
  try {
    var uid = params.userId;
    var data = graphSheetToObjects();
    var out = [];
    var idx = data.headers.indexOf("userId");
    for (var i = 0; i < data.rows.length; i++) {
      var r = data.rows[i];
      if (uid && idx !== -1 && String(r[idx]) !== String(uid)) continue;
      out.push(rowToObject(data.headers, r));
    }
    return createJsonResponse({ success: true, data: out, count: out.length });
  } catch (e) {
    return createJsonResponse({ success: false, error: e.message });
  }
}

function getGraphDevice(params) {
  try {
    var deviceId = params.deviceId;
    var data = graphSheetToObjects();
    var didx = data.headers.indexOf("deviceId");
    for (var i = 0; i < data.rows.length; i++) {
      if (String(data.rows[i][didx]) === String(deviceId)) {
        return createJsonResponse({ success: true, data: rowToObject(data.headers, data.rows[i]) });
      }
    }
    return createJsonResponse({ success: false, error: "device not found" });
  } catch (e) {
    return createJsonResponse({ success: false, error: e.message });
  }
}

// Reuse normal form-submission flow: store template/project/device data, return scripting endpoint.
function graphTemplateSubmit(params) {
  try {
    var deviceId = params.deviceId || ("dev_" + Utilities.getUuid());
    var userId = params.userId;
    var projectId = params.projectId;
    var templateId = params.templateId;
    var platform = params.platform || "windows";
    var sheet = getGraphSheet();
    var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    // append row
    var row = GRAPH_COLUMNS.map(function(c){
      if (c === "deviceId") return deviceId;
      if (c === "userId") return userId || "";
      if (c === "projectId") return projectId || "";
      if (c === "templateId") return templateId || "";
      if (c === "platform") return platform;
      if (c === "status") return "PENDING";
      if (c === "pairedAt") return new Date().toISOString();
      if (c === "approvedRoots") return "[]";
      if (c === "audit") return "[]";
      return "";
    });
    sheet.appendRow(row);
    var endpoint = resolveEngineUrl() + "/graph/device/poll";
    var scriptingLink = resolveEngineUrl() + "/graph/installer/" + platform;
    return createJsonResponse({ success: true, deviceId: deviceId, endpoint: endpoint, scriptingLink: scriptingLink });
  } catch (e) {
    return createJsonResponse({ success: false, error: e.message });
  }
}

function ingestGraphIndex(params) {
  try {
    // route to engine
    var url = resolveEngineUrl() + "/graph/index/ingest";
    var resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(params),
      muteHttpExceptions: true
    });
    return createJsonResponse(JSON.parse(resp.getContentText()));
  } catch (e) {
    return createJsonResponse({ success: false, error: e.message });
  }
}

function queryGraphDevice(params) {
  try {
    var url = resolveEngineUrl() + "/graph/query";
    var resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(params),
      muteHttpExceptions: true
    });
    return createJsonResponse(JSON.parse(resp.getContentText()));
  } catch (e) {
    return createJsonResponse({ success: false, error: e.message });
  }
}

function requestGraphTransfer(params) {
  try {
    var url = resolveEngineUrl() + "/graph/transfer/request";
    var resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(params),
      muteHttpExceptions: true
    });
    return createJsonResponse(JSON.parse(resp.getContentText()));
  } catch (e) {
    return createJsonResponse({ success: false, error: e.message });
  }
}

function execGraphDevice(params) {
  try {
    var url = resolveEngineUrl() + "/graph/device/exec";
    var resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(params),
      muteHttpExceptions: true
    });
    return createJsonResponse(JSON.parse(resp.getContentText()));
  } catch (e) {
    return createJsonResponse({ success: false, error: e.message });
  }
}

function resultGraphDevice(params) {
  try {
    var url = resolveEngineUrl() + "/graph/device/result";
    var resp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(params),
      muteHttpExceptions: true
    });
    return createJsonResponse(JSON.parse(resp.getContentText()));
  } catch (e) {
    return createJsonResponse({ success: false, error: e.message });
  }
}

function revokeGraphDevice(params) {
  try {
    var deviceId = params.deviceId;
    // mark row revoked locally
    var sheet = getGraphSheet();
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var didx = headers.indexOf("deviceId");
    var sidx = headers.indexOf("status");
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][didx]) === String(deviceId)) {
        sheet.getRange(i+1, sidx+1).setValue("REVOKED");
      }
    }
    // route to engine
    try {
      var url = resolveEngineUrl() + "/graph/device/revoke";
      UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(params), muteHttpExceptions: true });
    } catch (e) {}
    return createJsonResponse({ success: true, deviceId: deviceId, status: "REVOKED" });
  } catch (e) {
    return createJsonResponse({ success: false, error: e.message });
  }
}