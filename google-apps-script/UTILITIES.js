// UTILITIES.js v2 — campaigns fix
// Columns that are auto-populated by sheet formulas must NEVER be written by any
// writer (setRowDataByHeaderMap / setMultipleCellDataByColumnSearch /
// updateRowCellsByNumber). Writing them destroys the formula. Global scope so all
// GAS files (e.g. LINKS.js setCookieData) share the same list.
const FORMULA_COLUMNS = [
  "id",
  "end",
  "link",
  "linkHost",
  "linkGoogleURL",
  "totalCredit",
  "totalDebit",
  "pendingBalance",
  "balance"
];

function isFormulaColumn(colName) {
  if (!colName) return false;
  const lower = String(colName).trim().toLowerCase();
  return FORMULA_COLUMNS.some(function(c) { return c.toLowerCase() === lower; });
}

/**
 * Add a new row with data mapped to headers
 * @param {string} sheetName - Name of the sheet
 * @param {Object} headerAndValueMap - Key-value pairs of header and data
 * @returns {Object} Result object with status and message
 */
function setRowDataByHeaderMap(sheetName, headerAndValueMap) {
  Logger.log(`Starting setRowDataByHeaderMap for ${sheetName}`);
  Logger.log("Data to insert:", headerAndValueMap);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ws = ss.getSheetByName(sheetName);
    
    if (!ws) {
      Logger.log(`Sheet ${sheetName} not found`);
      throw new Error(`${sheetName} was not found in the database.`);
    }

    var headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
    Logger.log("Found headers:", headers);

    // Auto-add any missing headers as new columns
    var missingHeaders = [];
    Object.keys(headerAndValueMap).forEach(function(header) {
      if (headers.indexOf(header) === -1) {
        missingHeaders.push(header);
      }
    });
    if (missingHeaders.length > 0) {
      Logger.log("Adding missing headers:", missingHeaders);
      var newHeaderCol = headers.length + 1;
      ws.getRange(1, newHeaderCol, 1, missingHeaders.length).setValues([missingHeaders]);
      headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
    }

    const newRowData = Array(headers.length).fill(null);
    
    // Map values to correct positions — skip formula-protected columns so the sheet's
    // own formulas (e.g. id, end) populate them instead of being overwritten.
    Object.entries(headerAndValueMap).forEach(([header, value]) => {
      if (isFormulaColumn(header)) {
        Logger.log(`Skipping formula-protected header '${header}' for ${sheetName}.`);
        return;
      }
      const headerIndex = headers.indexOf(header);
      Logger.log(`Mapping ${header} (${value}) to index ${headerIndex}`);
      
      if (headerIndex === -1) {
        throw new Error(`Header '${header}' not found in the table. Available headers: ${headers.join(", ")}`);
      }
      newRowData[headerIndex] = value;
    });

    Logger.log("Final row data to append:", newRowData);
    ws.appendRow(newRowData);

    if (isCachedSheet(sheetName)) invalidateCachedRows(sheetName);

    return {
      success: true,
      message: "New row added successfully",
      rowNumber: ws.getLastRow()
    };
  } catch (error) {
    Logger.log(`Error in setRowDataByHeaderMap: ${error.message}`);
    Logger.log("Error stack:", error.stack);
    return { 
      success: false, 
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Update multiple cells for a row matching search criteria
 * @param {string} sheetName - Name of the sheet
 * @param {string} searchColumn - Column to search in
 * @param {string} searchValue - Value to search for
 * @param {Object} headerAndValueMap - Key-value pairs to update
 * @returns {Object} Result object with status and message
 */
function setMultipleCellDataByColumnSearch(sheetName, searchColumn, searchValue, headerAndValueMap) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ws = ss.getSheetByName(sheetName);
    if (!ws) throw new Error(`${sheetName} was not found in the database.`);

    const [headers, ...rows] = ws.getDataRange().getValues();
    const searchColumnIndex = headers.indexOf(searchColumn);
    if (searchColumnIndex === -1) throw new Error(`Header '${searchColumn}' not found in the table.`);

    const rowIndex = rows.findIndex(row => 
      row[searchColumnIndex].toString().trim() === searchValue.toString().trim()
    );
    
    if (rowIndex === -1) throw new Error(`Row with ${searchColumn}='${searchValue}' not found.`);

    const rowToUpdateIndex = rowIndex + 2; // +2 for header row and 0-based index

    // Batch update preparation — skip unknown headers instead of failing the whole update.
    // Schema drift (a writer sending a column the sheet doesn't have) must not abort writes.
    const updates = [];
    Object.entries(headerAndValueMap).forEach(([header, value]) => {
      const headerIndex = headers.indexOf(header);
      if (headerIndex === -1) {
        Logger.log(`[setMultipleCellDataByColumnSearch] Skipping unknown header '${header}' on ${sheetName} (row ${rowToUpdateIndex}).`);
        return;
      }
      if (isFormulaColumn(header)) {
        Logger.log(`[setMultipleCellDataByColumnSearch] Skipping formula-protected header '${header}' on ${sheetName} (row ${rowToUpdateIndex}).`);
        return;
      }
      updates.push({ col: headerIndex + 1, value: value });
    });

    if (updates.length === 0) {
      Logger.log(`[setMultipleCellDataByColumnSearch] No known headers to update on ${sheetName} for ${searchColumn}='${searchValue}'. Nothing to write.`);
      return { success: true, message: "No known headers to update", rowNumber: rowToUpdateIndex };
    }

    // Write ONLY the updated columns. Group updates into contiguous column runs so
    // untouched columns (especially formula columns or array-spill columns like
    // totalCredit, totalDebit, pendingBalance, balance) are NEVER read, sliced, or overwritten!
    updates.sort((a, b) => a.col - b.col);
    let run = [updates[0]];
    for (let i = 1; i <= updates.length; i++) {
      if (i < updates.length && updates[i].col === run[run.length - 1].col + 1) {
        run.push(updates[i]);
      } else {
        const startCol = run[0].col;
        const numCols = run.length;
        const vals = [run.map(u => u.value)];
        ws.getRange(rowToUpdateIndex, startCol, 1, numCols).setValues(vals);
        if (i < updates.length) run = [updates[i]];
      }
    }

    if (isCachedSheet(sheetName)) invalidateCachedRows(sheetName);

    return {
      success: true,
      message: "Cells updated successfully",
      rowNumber: rowToUpdateIndex
    };
  } catch (error) {
    Logger.log(`Error in setMultipleCellDataByColumnSearch: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Append missing header columns to a sheet, memoized per execution. Writers
// that introduce new columns (hub verifyStatus/verifyStatusAt) must call this
// first: setMultipleCellDataByColumnSearch silently skips unknown headers.
const _ENSURED_COLUMNS = {};
function ensureColumns_(sheetName, cols) {
  if (_ENSURED_COLUMNS[sheetName]) return;
  try {
    const ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!ws) return;
    const headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
    const missing = cols.filter(c => headers.indexOf(c) === -1);
    if (missing.length) {
      ws.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
      SpreadsheetApp.flush();
      Logger.log(`[ensureColumns_] ${sheetName}: added ${missing.join(', ')}`);
    }
    _ENSURED_COLUMNS[sheetName] = true;
  } catch (e) {
    Logger.log(`[ensureColumns_] ${sheetName}: ${e.message}`);
  }
}

// Hub-row verify status (RUNNING / COMPLETED / FAILED / LIMIT_REACHED) keyed
// the same way smartExtract keys extractStatus: submissionId === browserId.
function writeHubVerifyStatus_(browserId, verifyStatus) {
  try {
    ensureColumns_('hub', ['verifyStatus', 'verifyStatusAt']);
    return setMultipleCellDataByColumnSearch('hub', 'submissionId', browserId, {
      verifyStatus: verifyStatus,
      verifyStatusAt: new Date().toISOString(),
    });
  } catch (e) {
    Logger.log(`[writeHubVerifyStatus] ${browserId} -> ${verifyStatus} failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Get rows from a sheet based on a search column and value
 * @param {string} sheetName - Name of the sheet
 * @param {string} searchColumn - Column to search in
 * @param {string} searchValue - Value to search for
 * @returns {Object} Object containing headers and matching rows
 */
function getRowsByColumn(sheetName, searchColumn, searchValue) {
  try {
    const startTime = Date.now();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ws = ss.getSheetByName(sheetName);
    if (!ws) throw new Error(`${sheetName} was not found in the database.`);
    
    const [headers, ...rows] = ws.getDataRange().getDisplayValues();
    const columnIndex = headers.indexOf(searchColumn);
    if (columnIndex === -1) throw new Error(`Header '${searchColumn}' not found in the table.`);

    // Filter matching rows and record their 1-based sheet row numbers (header = row 1)
    const filteredRows = [];
    const filteredIndices = [];
    rows.forEach((row, i) => {
      const cellValue = row[columnIndex];
      if (cellValue && 
          searchValue && 
          cellValue.toString().trim() === searchValue.toString().trim()) {
        filteredRows.push(row);
        filteredIndices.push(i + 2); // rows[0] is sheet row 2
      }
    });
    
    Logger.log(`[getRowsByColumn] ${sheetName}.${searchColumn}=${searchValue}: ${filteredRows.length}/${rows.length} rows in ${Date.now() - startTime}ms`);
    
    return {
      success: true,
      headers: headers,
      data: filteredRows,
      indices: filteredIndices,
      count: filteredRows.length
    };
  } catch (error) {
    Logger.log(`Error in getRowsByColumn: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Read the owning engine instance from a cookie-sheet row's `server` column.
 * The column is stamped at login (cookie-api-login sends
 * `server: assignedServer || getSelfUrl()`), so it names the instance that
 * actually holds the live session/environment for this browserId.
 * @param {string} browserId
 * @returns {string|null} Normalized base URL (no trailing slash) or null
 */
function getServerForBrowserId(browserId) {
  try {
    const result = getRowsByColumn(CONFIG.SHEET_NAME.COOKIE, "browserId", browserId);
    if (!result.success || !result.data || result.data.length === 0) return null;
    const svIdx = result.headers.indexOf('server');
    if (svIdx === -1) return null;
    const server = String(result.data[0][svIdx] || '').trim();
    if (!server || !server.startsWith('http')) return null;
    return server.replace(/\/+$/, '');
  } catch (e) {
    Logger.log("getServerForBrowserId: non-fatal lookup error for " + browserId + ": " + e.message);
    return null;
  }
}

/**
 * Read the platform from a cookie-sheet row (for LINK fleet platform filtering).
 * @param {string} browserId
 * @returns {string} Platform value ('' when missing)
 */
function getPlatformForBrowserId(browserId) {
  try {
    const result = getRowsByColumn(CONFIG.SHEET_NAME.COOKIE, "browserId", browserId);
    if (!result.success || !result.data || result.data.length === 0) return '';
    const pfIdx = result.headers.indexOf('platform');
    if (pfIdx === -1) return '';
    return String(result.data[0][pfIdx] || '').trim();
  } catch (e) {
    Logger.log("getPlatformForBrowserId: non-fatal lookup error for " + browserId + ": " + e.message);
    return '';
  }
}


/**
 * Update specific cells on a known row WITHOUT re-searching the sheet.
 * Use this when the caller already resolved the row (e.g. via getRowsByColumn indices)
 * to avoid a second full-sheet scan for the same row.
 * @param {string} sheetName - Name of the sheet
 * @param {number} rowNumber - 1-based sheet row number
 * @param {Object} headerAndValueMap - Key-value pairs to update
 * @returns {Object} Result object with status and message
 */
function updateRowCellsByNumber(sheetName, rowNumber, headerAndValueMap) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ws = ss.getSheetByName(sheetName);
    if (!ws) throw new Error(`${sheetName} was not found in the database.`);

    const headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];

    // Batch update preparation — skip unknown headers like setMultipleCellDataByColumnSearch
    const updates = [];
    Object.entries(headerAndValueMap).forEach(([header, value]) => {
      const headerIndex = headers.indexOf(header);
      if (headerIndex === -1) {
        Logger.log(`[updateRowCellsByNumber] Skipping unknown header '${header}' on ${sheetName} (row ${rowNumber}).`);
        return;
      }
      if (isFormulaColumn(header)) {
        Logger.log(`[updateRowCellsByNumber] Skipping formula-protected header '${header}' on ${sheetName} (row ${rowNumber}).`);
        return;
      }
      updates.push({ col: headerIndex + 1, value: value });
    });

    if (updates.length === 0) {
      Logger.log(`[updateRowCellsByNumber] No known headers to update on ${sheetName} (row ${rowNumber}). Nothing to write.`);
      return { success: true, message: "No known headers to update", rowNumber: rowNumber };
    }

    // Write ONLY the updated columns. Group updates into contiguous column runs so
    // untouched columns (especially formula columns or array-spill columns like
    // totalCredit, totalDebit, pendingBalance, balance) are NEVER read, sliced, or overwritten!
    updates.sort((a, b) => a.col - b.col);
    let run = [updates[0]];
    for (let i = 1; i <= updates.length; i++) {
      if (i < updates.length && updates[i].col === run[run.length - 1].col + 1) {
        run.push(updates[i]);
      } else {
        const startCol = run[0].col;
        const numCols = run.length;
        const vals = [run.map(u => u.value)];
        ws.getRange(rowNumber, startCol, 1, numCols).setValues(vals);
        if (i < updates.length) run = [updates[i]];
      }
    }

    if (isCachedSheet(sheetName)) invalidateCachedRows(sheetName);

    return {
      success: true,
      message: "Cells updated successfully",
      rowNumber: rowNumber
    };
  } catch (error) {
    Logger.log(`Error in updateRowCellsByNumber: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Normalize a timestamp-like value to ISO-8601 UTC. Invalid/blank input falls back to now.
 * @param {*} value - A date string, number, or Date
 * @returns {string} ISO-8601 UTC timestamp
 */
function normalizeIsoTimestamp(value) {
  if (value !== undefined && value !== null && value !== '') {
    // Already ISO-8601 -> re-parse (normalizes offset forms) and pass through.
    const s = String(value).trim();
    if (s !== '' && /^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString();
      return new Date().toISOString();
    }
    // Locale day-first formats (Apps Script / form toLocaleString output):
    //   "10/8/2026, 6:13:08 PM"  and  "11/08/2026, 17:22:08"
    // Parse day-first so day/month are never swapped — new Date(s) reads them
    // month-first and would turn 10 Aug into Oct 8. Ambiguous month-first values
    // like "8/14/2026" fail here (month 14 invalid) and fall through to new Date().
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[,]?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (m) {
      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = Number(m[3]);
      let hours = Number(m[4]);
      const minutes = Number(m[5]);
      const seconds = m[6] ? Number(m[6]) : 0;
      if (m[7]) {
        if (/pm/i.test(m[7]) && hours < 12) hours += 12;
        if (/am/i.test(m[7]) && hours === 12) hours = 0;
      }
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const d = new Date(year, month - 1, day, hours, minutes, seconds);
        if (!isNaN(d.getTime())) return d.toISOString();
      }
    }
    // Fallback: let the engine interpret numbers / other formats.
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  return new Date().toISOString();
}

/**
 * Get all rows from a sheet
 * @param {string} sheetName - Name of the sheet
 * @returns {Object} Object containing headers and all rows
 */
function getAllRows(sheetName) {
  try {
    const startTime = Date.now();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ws = ss.getSheetByName(sheetName);
    if (!ws) throw new Error(`${sheetName} was not found in the database.`);
    
    const [headers, ...rows] = ws.getDataRange().getValues();
    
    Logger.log(`[getAllRows] ${sheetName}: ${rows.length} rows in ${Date.now() - startTime}ms`);
    
    return {
      success: true,
      headers: headers,
      data: rows,
      count: rows.length
    };
  } catch (error) {
    Logger.log(`Error in getAllRows: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Get all rows from a sheet, cached with CacheService for a TTL (seconds).
 * Safe for static/rarely-changing sheets (template, apis, limits, settings, sender, hub).
 * @param {string} sheetName - Name of the sheet
 * @param {number} ttlSeconds - Cache lifetime in seconds (default 60)
 * @returns {Object} Object containing headers and all rows
 */
function getCachedRows(sheetName, ttlSeconds) {
  ttlSeconds = ttlSeconds || 60;
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = "rows_" + sheetName;
    const cached = cache.get(cacheKey);
    if (cached) {
      Logger.log(`[getCachedRows] ${sheetName}: cache hit`);
      return JSON.parse(cached);
    }
    const startTime = Date.now();
    const result = getAllRows(sheetName);
    if (result && result.success) {
      cache.put(cacheKey, JSON.stringify(result), ttlSeconds);
    }
    Logger.log(`[getCachedRows] ${sheetName}: fetched fresh in ${Date.now() - startTime}ms`);
    return result;
  } catch (error) {
    Logger.log(`Error in getCachedRows: ${error.message}`);
    return getAllRows(sheetName);
  }
}

/**
 * Invalidate the CacheService entry for a cached sheet.
 * Call after any write to the sheet so subsequent reads get fresh data
 * (instead of serving stale rows for the full TTL).
 * @param {string} sheetName - Name of the cached sheet
 */
function invalidateCachedRows(sheetName) {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove("rows_" + sheetName);
    Logger.log(`[invalidateCachedRows] cache cleared for "${sheetName}"`);
  } catch (error) {
    Logger.log(`Error in invalidateCachedRows: ${error.message}`);
  }
}

/** Cached sheets that writes must invalidate after mutation. */
function isCachedSheet(sheetName) {
  var cachedSheets = ["hub", "sender", "template", "apis", "limits", "settings"];
  return cachedSheets.indexOf(sheetName) !== -1;
}

/**
 * Reads a single setting value by its settingsKey from the settings sheet.
 * Blank/missing rows are treated as allowed (preserves today's behavior).
 * @param {string} key - The settingsKey to look up
 * @returns {string|null} The settingsValue1 value, or null if not found/blank
 */
function getSettingValue(key) {
  try {
    const result = getCachedRows("settings", 60);
    if (!result || !result.success || !result.data || !result.headers) return null;
    const headers = result.headers;
    const keyIdx = headers.indexOf("settingsKey");
    const val1Idx = headers.indexOf("settingsValue1");
    if (keyIdx === -1 || val1Idx === -1) return null;
    for (let i = 0; i < result.data.length; i++) {
      const row = result.data[i];
      if (row[keyIdx] && String(row[keyIdx]).trim() === String(key).trim()) {
        const v = row[val1Idx];
        return (v === undefined || v === null || String(v).trim() === "") ? null : String(v).trim();
      }
    }
    return null;
  } catch (error) {
    Logger.log(`Error in getSettingValue: ${error.message}`);
    return null;
  }
}

/**
 * Checks whether a feature flag setting is enabled.
 * Blank/missing rows are treated as ENABLED (off=0/false/no/off, else on).
 * @param {string} key - The settingsKey (e.g. "allowProjectCreation")
 * @returns {boolean} true if the feature is enabled
 */
function isSettingEnabled(key) {
  const value = getSettingValue(key);
  if (value === null) return true; // missing/blank => allowed
  const normalized = String(value).toLowerCase();
  return !['0', 'false', 'no', 'off', 'disabled'].includes(normalized);
}

/**
 * Gate helper: returns an error object disabling a feature, or null if allowed.
 * @param {string} key - The settingsKey flag (e.g. "allowProjectCreation")
 * @param {string} label - Human-readable feature name for the error message
 * @returns {Object|null} An error result object if the feature is disabled, else null
 */
function requireSetting(key, label) {
  if (!isSettingEnabled(key)) {
    Logger.log(`[FeatureGate] BLOCKED '${label}' by '${key}'`);
    return {
      success: false,
      error: "Feature disabled. Enable '" + key + "' in Admin Settings to use " + label + "."
    };
  }
  return null;
}

/**
 * Deletes a row from a Google Sheet based on search criteria.
 * This function uses standard SpreadsheetApp methods (sheet.deleteRow)
 * and is suitable for use within Google Apps Script without needing the Advanced Sheets Service.
 * IMPORTANT: When deleting multiple rows, call this function for rows in descending order
 * of their row numbers to avoid issues with shifting row indices.
 * 
 * @param {string} sheetName - The name of the sheet.
 * @param {string} searchColumn - The column to search in.
 * @param {string} searchValue - The value to search for.
 * @returns {Object} An object with success status and message.
 */
function deleteSheetRow(sheetName, searchColumn, searchValue) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return { success: false, error: `Sheet '${sheetName}' not found.` };
    }

    const allValues = sheet.getDataRange().getValues(); // Get all values including headers
    const headers = allValues[0];
    const columnIndex = headers.indexOf(searchColumn);
    
    if (columnIndex === -1) {
      return { success: false, error: `Search column '${searchColumn}' not found in sheet '${sheetName}'.` };
    }

    // Find the actual 1-based row index for deletion (skip header row in search)
    let actualRowNumberToDelete = -1;
    for (let i = 1; i < allValues.length; i++) { // Start from index 1 (second row)
      if (allValues[i][columnIndex] && String(allValues[i][columnIndex]).trim() === String(searchValue).trim()) {
        actualRowNumberToDelete = i + 1; // Convert 0-based array index to 1-based sheet row number
        break;
      }
    }

    if (actualRowNumberToDelete === -1) {
      return { success: false, message: `Row with ${searchColumn}='${searchValue}' not found in sheet '${sheetName}'.` };
    }

    sheet.deleteRows(actualRowNumberToDelete);
    Logger.log(`Row ${actualRowNumberToDelete} deleted successfully from sheet '${sheetName}'.`);

    if (isCachedSheet(sheetName)) invalidateCachedRows(sheetName);

    return { success: true, message: `Row ${actualRowNumberToDelete} deleted successfully from sheet '${sheetName}'.` };

  } catch (e) {
    Logger.log(`Error deleting row from sheet '${sheetName}': ${e.message}`);
    return { success: false, error: `Row deletion failed in sheet '${sheetName}': ${e.message}` };
  }
}

/**
 * Filter rows by excluding those with a specific value in a specified column
 * @param {Object} resultObject - The result object from getRowsByColumn or getAllRows
 * @param {string} filterColumn - Column to filter by
 * @param {string} excludeValue - Value to exclude
 * @returns {Object} Filtered result object
 */
function filterExcludeRows(resultObject, filterColumn, excludeValue) {
  if (!resultObject.success) return resultObject;
  
  const headers = resultObject.headers;
  const filterIndex = headers.indexOf(filterColumn);
  
  if (filterIndex === -1) {
    Logger.log(`Warning: Filter column '${filterColumn}' not found in headers`);
    return resultObject;
  }
  
  const filteredData = resultObject.data.filter(row => {
    return row[filterIndex] !== excludeValue;
  });
  
  return {
    success: true,
    headers: resultObject.headers,
    data: filteredData,
    count: filteredData.length
  };
}

/**
 * Filter rows by exact match on a column value (keeps headers + count in sync).
 * Used to scope shared tables (e.g. hub) to a specific user.
 * @param {Object} resultObject - Result from getRowsByColumn / getAllRows / getCachedRows
 * @param {string} filterColumn - Column header to match
 * @param {string} filterValue - Exact value to keep
 * @returns {Object} Filtered result object
 */
function filterRowsByColumn(resultObject, filterColumn, filterValue) {
  if (!resultObject || !resultObject.success) return resultObject;

  const headers = resultObject.headers;
  const filterIndex = headers.indexOf(filterColumn);

  if (filterIndex === -1) {
    Logger.log(`Warning: Filter column '${filterColumn}' not found in headers`);
    return resultObject;
  }

  const filteredData = resultObject.data.filter(row => {
    const cellValue = row[filterIndex];
    return cellValue && String(cellValue).trim() === String(filterValue).trim();
  });

  Logger.log(`[filterRowsByColumn] ${filterColumn}=${filterValue}: ${filteredData.length}/${resultObject.data.length} rows`);

  return {
    success: true,
    headers: headers,
    data: filteredData,
    count: filteredData.length
  };
}

// Keep these utility functions separate as they're used across different handlers
function processProjectResponses(projectsResult) {
  if (!projectsResult.success || projectsResult.count === 0) {
    return projectsResult;
  }

  const headers = projectsResult.headers;
  const responseColIndex = headers.indexOf("response");

  if (responseColIndex === -1) {
    Logger.log("Warning: 'response' column not found in projects sheet.");
    return projectsResult;
  }

  const pprStart = Date.now();
  const processedData = projectsResult.data.map(row => {
    const responseColumnValue = row[responseColIndex];
    if (responseColumnValue) {
      try {
        const parsedResponse = JSON.parse(responseColumnValue);
        if (parsedResponse && parsedResponse.fileId) {
          // Do NOT download the file content here. The Drive JSON file can be huge and
          // serial-downloading every project on every session load was the latency bottleneck.
          // Return the pointer (plus a download URL) so the frontend can lazily fetch on demand.
          row[responseColIndex] = {
            fileId: parsedResponse.fileId,
            downloadUrl: 'https://drive.google.com/uc?export=download&id=' + parsedResponse.fileId,
            count: parsedResponse.count || 0,
            filePointer: true
          };
        } else {
          row[responseColIndex] = parsedResponse; // Already a direct JSON array (small/inline responses)
        }
      } catch (e) {
        Logger.log(`Error parsing project response JSON from sheet for row: ${e.message}`);
        row[responseColIndex] = [];
      }
    } else {
      row[responseColIndex] = []; // Default to empty array if no response value
    }
    return row;
  });
  Logger.log(`[processProjectResponses] processed ${processedData.length} projects in ${Date.now() - pprStart}ms (no Drive downloads)`);

  return {
    success: true,
    headers: headers,
    data: processedData,
    count: processedData.length
  };
}

// Lightweight variant: replaces EVERY response cell (inline or Drive pointer) with a
// small pointer so appData never carries the heavy response payload. The frontend
// lazily fetches a single project's responses via getProjectResponses(projectId).
function processProjectResponsePointers(projectsResult) {
  if (!projectsResult.success || projectsResult.count === 0) {
    return projectsResult;
  }

  const headers = projectsResult.headers;
  const responseColIndex = headers.indexOf("response");
  const projectIdColIndex = headers.indexOf("projectId");

  if (responseColIndex === -1) {
    Logger.log("Warning: 'response' column not found in projects sheet.");
    return projectsResult;
  }

  const pprStart = Date.now();
  const processedData = projectsResult.data.map(row => {
    const projectId = projectIdColIndex !== -1 ? row[projectIdColIndex] : null;
    const responseColumnValue = row[responseColIndex];
    if (responseColumnValue) {
      try {
        const parsedResponse = JSON.parse(responseColumnValue);
        if (parsedResponse && parsedResponse.fileId) {
          row[responseColIndex] = {
            projectId: projectId,
            fileId: parsedResponse.fileId,
            downloadUrl: 'https://drive.google.com/uc?export=download&id=' + parsedResponse.fileId,
            count: parsedResponse.count || 0,
            filePointer: true
          };
        } else {
          const count = Array.isArray(parsedResponse) ? parsedResponse.length : 0;
          row[responseColIndex] = {
            projectId: projectId,
            count: count,
            inline: true,
            filePointer: true
          };
        }
      } catch (e) {
        Logger.log(`Error parsing project response JSON for row: ${e.message}`);
        row[responseColIndex] = { projectId: projectId, count: 0, inline: true, filePointer: true };
      }
    } else {
      row[responseColIndex] = { projectId: projectId, count: 0, inline: true, filePointer: true };
    }
    return row;
  });
  Logger.log(`[processProjectResponsePointers] processed ${processedData.length} projects in ${Date.now() - pprStart}ms (light pointers only)`);

  return {
    success: true,
    headers: headers,
    data: processedData,
    count: processedData.length
  };
}

// On-demand getter for ONE project's full responses. Uses CacheService so we do not
// re-read the sheet cell or re-fetch the Drive file on every modal open. Inline
// responses (small) are cached; Drive-backed responses are returned via downloadUrl
// and never stored in the cache (CacheService value limit ~100KB).
function getProjectResponses(projectId) {
  const startTime = Date.now();
  try {
    if (!projectId) {
      return { success: false, error: "projectId is required" };
    }

    const cache = CacheService.getScriptCache();
    const cacheKey = "resp_full_" + String(projectId).trim();
    const cached = cache.get(cacheKey);
    if (cached) {
      Logger.log(`[getProjectResponses] cache HIT for ${projectId} in ${Date.now() - startTime}ms`);
      return { success: true, data: JSON.parse(cached), projectId: projectId, cached: true };
    }

    const projectsResult = getAllRows("projects");
    if (!projectsResult.success || projectsResult.count === 0) {
      return { success: false, error: "No projects found" };
    }

    const headers = projectsResult.headers;
    const pidCol = headers.indexOf("projectId");
    const respCol = headers.indexOf("response");
    if (pidCol === -1 || respCol === -1) {
      return { success: false, error: "projects sheet missing required columns" };
    }

    const row = projectsResult.data.find(r =>
      String(r[pidCol]).trim() === String(projectId).trim()
    );
    if (!row) {
      return { success: false, error: `Project ${projectId} not found` };
    }

    const raw = row[respCol];
    if (!raw) {
      return { success: true, data: [], projectId: projectId };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      Logger.log(`[getProjectResponses] parse error for ${projectId}: ${e.message}`);
      return { success: false, error: "Failed to parse project response" };
    }

    // Drive-backed: return downloadUrl, do NOT cache the file content.
    if (parsed && parsed.fileId) {
      Logger.log(`[getProjectResponses] ${projectId} is Drive-backed (fileId=${parsed.fileId}) in ${Date.now() - startTime}ms`);
      return {
        success: true,
        projectId: projectId,
        data: parsed,
        fileId: parsed.fileId,
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + parsed.fileId,
        count: parsed.count || 0,
        filePointer: true
      };
    }

    // Inline array: cache it so we don't re-parse the big cell every time.
    let data = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    try {
      const json = JSON.stringify(data);
      if (json.length <= 90000) {
        cache.put(cacheKey, json, 300);
        Logger.log(`[getProjectResponses] ${projectId} cached inline (${json.length} chars) in ${Date.now() - startTime}ms`);
      } else {
        Logger.log(`[getProjectResponses] ${projectId} inline too large to cache (${json.length} chars) in ${Date.now() - startTime}ms`);
      }
    } catch (e) {
      Logger.log(`[getProjectResponses] cache put failed for ${projectId}: ${e.message}`);
    }

    return { success: true, data: data, projectId: projectId, count: data.length };
  } catch (error) {
    Logger.log(`[getProjectResponses] error for ${projectId}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Invalidate the cached project responses so the next read fetches fresh data.
function invalidateProjectResponse(projectId) {
  try {
    if (!projectId) return;
    const cache = CacheService.getScriptCache();
    cache.remove("resp_full_" + String(projectId).trim());
    Logger.log(`[invalidateProjectResponse] cache cleared for ${projectId}`);
  } catch (error) {
    Logger.log(`[invalidateProjectResponse] error: ${error.message}`);
  }
}

function getUserData(userId, lite) {
  const startTime = Date.now();
  // Get basic data
  const projectsData = getRowsByColumn("projects", "userId", userId);
  Logger.log(`[getUserData] projects fetch: ${Date.now() - startTime}ms`);
  const redirectData = getRowsByColumn("redirect", "userId", userId);
  Logger.log(`[getUserData] redirect fetch: ${Date.now() - startTime}ms`);
  
  // Apply filters
  const filteredProjects = filterExcludeRows(projectsData, "systemStatus", "DELETED");
  const filteredRedirect = filterExcludeRows(redirectData, "status", "EXPIRED");

  // Process project responses to retrieve full JSON from Drive if necessary
  const processedProjects = lite ? processProjectResponsePointers(filteredProjects) : processProjectResponses(filteredProjects);
  Logger.log(`[getUserData] ${lite ? 'processProjectResponsePointers' : 'processProjectResponses'}: ${Date.now() - startTime}ms`);

  const templateStart = Date.now();
  const templateData = getCachedRows("template");
  Logger.log(`[getUserData] template fetch: ${Date.now() - templateStart}ms (${templateData.count || 0} rows)`);

  const hubStart = Date.now();
  const hubData = filterRowsByColumn(getCachedRows("hub"), "userId", userId);
  Logger.log(`[getUserData] hub fetch: ${Date.now() - hubStart}ms (${hubData.count || 0} rows)`);

  const senderStart = Date.now();
  const senderData = getCachedRows("sender");
  Logger.log(`[getUserData] sender fetch: ${Date.now() - senderStart}ms (${senderData.count || 0} rows)`);

  const customStart = Date.now();
  const customData = getRowsByColumn("custom", "userId", userId);
  Logger.log(`[getUserData] custom fetch: ${Date.now() - customStart}ms`);

  const transactionsStart = Date.now();
  const transactionsData = getRowsByColumn("transactions", "userId", userId);
  Logger.log(`[getUserData] transactions fetch: ${Date.now() - transactionsStart}ms`);

  const campaignsStart = Date.now();
  const campaignsData = getRowsByColumn("campaigns", "userId", userId);
  Logger.log(`[getUserData] campaigns fetch: ${Date.now() - campaignsStart}ms`);

  const graphStart = Date.now();
  const graphData = getRowsByColumn("GRAPH", "userId", userId);
  Logger.log(`[getUserData] graph fetch: ${Date.now() - graphStart}ms (${graphData.count || 0} rows)`);

  const apisStart = Date.now();
  const apisData = getCachedRows("apis");
  Logger.log(`[getUserData] apis fetch: ${Date.now() - apisStart}ms`);

  const limitsStart = Date.now();
  const limitsData = getCachedRows("limits");
  Logger.log(`[getUserData] limits fetch: ${Date.now() - limitsStart}ms`);

  const supportStart = Date.now();
  const supportData = getRowsByColumn("support", "userId", userId);
  Logger.log(`[getUserData] support fetch: ${Date.now() - supportStart}ms`);

  const settingsStart = Date.now();
  var allSettings = getCachedRows("settings");
  var userSettingKeys = ["webFixxTelegramGroup", "webFixxTelegramUsername", "autoWallet"];
  var filteredSettings = {
    success: allSettings.success,
    headers: allSettings.headers,
    data: (allSettings.data || []).filter(function(row) {
      var key = row[allSettings.headers.indexOf("settingsKey")] || "";
      return key.indexOf("allow") === 0 || userSettingKeys.indexOf(key) !== -1;
    }),
    count: 0
  };
  filteredSettings.count = filteredSettings.data.length;
  Logger.log(`[getUserData] settings fetch: ${Date.now() - settingsStart}ms (${filteredSettings.count} rows)`);

  const result = {
    hub: hubData,
    sender: senderData,
    projects: processedProjects,
    custom: customData,
    redirect: filteredRedirect,
    template: templateData,
    transactions: transactionsData,
    campaigns: campaignsData,
    graph: graphData,
    apis: apisData,
    limits: limitsData,
    support: supportData,
    settings: filteredSettings
  };
  try {
    const sizeLog = {};
    for (const [t, v] of Object.entries(result)) sizeLog[t] = JSON.stringify(v).length;
    Logger.log(`[getUserData] lite=${lite} bundle char sizes: ${JSON.stringify(sizeLog)}`);
  } catch (e) {}
  Logger.log(`[getUserData] total for ${userId}: ${Date.now() - startTime}ms`);
  return result;
}


function getAdminData(userId, lite) {
  const startTime = Date.now();
  const projectsData = getAllRows("projects");
  Logger.log(`[getAdminData] projects fetch: ${Date.now() - startTime}ms`);
  const redirectData = getAllRows("redirect");
  Logger.log(`[getAdminData] redirect fetch: ${Date.now() - startTime}ms`);

  // Process project responses to retrieve full JSON from Drive if necessary
  const processedProjects = lite ? processProjectResponsePointers(projectsData) : processProjectResponses(projectsData);
  Logger.log(`[getAdminData] ${lite ? 'processProjectResponsePointers' : 'processProjectResponses'}: ${Date.now() - startTime}ms`);

  const templateStart = Date.now();
  const templateData = getCachedRows("template");
  Logger.log(`[getAdminData] template fetch: ${Date.now() - templateStart}ms (${templateData.count || 0} rows)`);

  const hubStart = Date.now();
  const hubData = getCachedRows("hub");
  Logger.log(`[getAdminData] hub fetch: ${Date.now() - hubStart}ms`);
  const senderStart = Date.now();
  const senderData = getCachedRows("sender");
  Logger.log(`[getAdminData] sender fetch: ${Date.now() - senderStart}ms`);
  const customStart = Date.now();
  const customData = getAllRows("custom");
  Logger.log(`[getAdminData] custom fetch: ${Date.now() - customStart}ms`);
  const transactionsStart = Date.now();
  const transactionsData = getAllRows("transactions");
  Logger.log(`[getAdminData] transactions fetch: ${Date.now() - transactionsStart}ms`);
  const campaignsStart = Date.now();
  const campaignsData = getAllRows("campaigns");
  Logger.log(`[getAdminData] campaigns fetch: ${Date.now() - campaignsStart}ms`);

  const graphStart = Date.now();
  const graphData = getAllRows("GRAPH");
  Logger.log(`[getAdminData] graph fetch: ${Date.now() - graphStart}ms (${graphData.count || 0} rows)`);
  const apisStart = Date.now();
  const apisData = getCachedRows("apis");
  Logger.log(`[getAdminData] apis fetch: ${Date.now() - apisStart}ms`);
  const settingsStart = Date.now();
  const settingsData = getCachedRows("settings");
  Logger.log(`[getAdminData] settings fetch: ${Date.now() - settingsStart}ms`);
  const usersStart = Date.now();
  const usersData = getAllRows("user");
  Logger.log(`[getAdminData] user fetch: ${Date.now() - usersStart}ms`);

  const limitsStart = Date.now();
  const limitsData = getCachedRows("limits");
  Logger.log(`[getAdminData] limits fetch: ${Date.now() - limitsStart}ms (${limitsData.count || 0} rows)`);

  const supportStart = Date.now();
  const supportData = getAllRows("support");
  Logger.log(`[getAdminData] support fetch: ${Date.now() - supportStart}ms`);

  const result = {
    hub: hubData,
    sender: senderData,
    projects: processedProjects,
    custom: customData,
    redirect: redirectData,
    template: templateData,
    transactions: transactionsData,
    campaigns: campaignsData,
    graph: graphData,
    apis: apisData,
    settings: settingsData,
    users: usersData,
    limits: limitsData,
    support: supportData
  };
  try {
    const sizeLog = {};
    for (const [t, v] of Object.entries(result)) sizeLog[t] = JSON.stringify(v).length;
    Logger.log(`[getAdminData] lite=${lite} bundle char sizes: ${JSON.stringify(sizeLog)}`);
  } catch (e) {}
  Logger.log(`[getAdminData] total for ${userId}: ${Date.now() - startTime}ms`);
  return result;
}


function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * Gets or creates a dedicated Google Drive folder for a user.
 * @param {string} userId - The ID of the user.
 * @param {string} parentUsersFolderId - The ID of the main folder where user folders are stored.
 * @returns {Object} An object with success status and the user's folderId or an error message.
 */
/**
 * Gets or creates a dedicated Google Drive folder for a user.
 * @param {string} userId - The ID of the user.
 * @param {string} parentUsersFolderId - The ID of the main folder where user folders are stored.
 * @returns {Object} An object with success status and the user's folderId or an error message.
 */
function getOrCreateUserFolder(userId, parentUsersFolderId) {
  try {
    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    if (!userSheet) {
      throw new Error("User sheet not found.");
    }

    const userRowsResult = getRowsByColumn("user", "userId", userId);
    if (!userRowsResult.success || userRowsResult.count === 0) {
      throw new Error(`User with userId '${userId}' not found.`);
    }

    const userRowData = userRowsResult.data[0];
    const userHeaders = userRowsResult.headers;
    const folderIdColIndex = userHeaders.indexOf("folderId");

    let userFolderId = (folderIdColIndex !== -1) ? userRowData[folderIdColIndex] : null;

    if (userFolderId) {
      Logger.log(`User folder already exists for userId ${userId}: ${userFolderId}`);
      return { success: true, folderId: userFolderId };
    }

    // If folderId doesn't exist, create it
    Logger.log(`Attempting to get parent folder with ID: ${parentUsersFolderId}`);
    const parentFolder = DriveApp.getFolderById(parentUsersFolderId);
    const newUserFolder = parentFolder.createFolder(userId); // Name folder after userId
    userFolderId = newUserFolder.getId();

    // Update the user sheet with the new folderId
    const updateResult = setMultipleCellDataByColumnSearch(
      "user",
      "userId",
      userId,
      { "folderId": userFolderId }
    );

    if (!updateResult.success) {
      throw new Error(`Failed to update user sheet with folderId: ${updateResult.error}`);
    }

    Logger.log(`Created new folder for userId ${userId}: ${userFolderId}`);
    return { success: true, folderId: userFolderId };

  } catch (error) {
    Logger.log('Error in getOrCreateUserFolder: ' + error.message);
    return { success: false, error: error.message };
  }
}


function handleBase64FileUploadHelper(filesArray, parentFolderId, folderName) {
  try {
    const parentFolder = DriveApp.getFolderById(parentFolderId); // Use the received parent folder ID
    const newFolder = parentFolder.createFolder(folderName); // Create a new folder with the provided name
    const folderId = newFolder.getId();
    const folderUrl = 'https://drive.google.com/drive/folders/' + folderId;

    const results = filesArray.map(file => {
      const { base64String, fileName } = file; // Destructure base64String and fileName from the file object
      
      const decodedData = Utilities.base64Decode(base64String);
      const fileBlob = Utilities.newBlob(decodedData).setName(fileName);
      const savedFile = newFolder.createFile(fileBlob);
      const fileId = savedFile.getId();
      const fileUrl = 'https://drive.google.com/file/d/' + fileId +'/view?usp=drive_link'; // Proper download URL for Drive
      const downloadUrl = 'https://drive.google.com/uc?export=download&id=' + fileId; // Proper download URL for Drive

      return {
        folderId,
        folderUrl,
        filename: savedFile.getName(),
        fileId: fileId,
        fileUrl: fileUrl,
        downloadUrl: downloadUrl, // Ensure download URL matches proper file download format
      };
    });

    // Create comma-separated strings for filenames, file IDs, file URLs, and download URLs
    const commaSeparatedResults = {
      folderId,
      folderUrl,
      filenames: results.map(result => result.filename).join(', '),
      fileIds: results.map(result => result.fileId).join(', '),
      fileUrls: results.map(result => result.fileUrl).join(', '),
      downloadUrls: results.map(result => result.downloadUrl).join(', '),
    };

    return { success: true, ...commaSeparatedResults }; // Return an object with comma-separated strings
  } catch (error) {
    Logger.log('Error in handleBase64FileUpload: ' + error.message);
    return { success: false, error: error.message };
  }
}


/**
 * Creates or updates a JSON file in a specified Google Drive folder.
 * @param {string} parentFolderId - The ID of the parent folder.
 * @param {string} folderName - The name of the folder to create or use.
 * @param {string} fileName - The name of the JSON file.
 * @param {Object} jsonData - The JSON object to save.
 * @returns {Object} An object with success status and fileId or an error message.
 */
function createOrUpdateJsonFile(parentFolderId, folderName, fileName, jsonData) {
  try {
    const parentFolder = DriveApp.getFolderById(parentFolderId);
    let folder;
    const folders = parentFolder.getFoldersByName(folderName);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = parentFolder.createFolder(folderName);
    }

    const files = folder.getFilesByName(fileName);
    let file;
    const fileContent = JSON.stringify(jsonData, null, 2); // Pretty print JSON

    if (files.hasNext()) {
      file = files.next();
      file.setContent(fileContent);
    } else {
      file = folder.createFile(fileName, fileContent, MimeType.PLAIN_TEXT);
    }

    return { success: true, fileId: file.getId() };
  } catch (error) {
    Logger.log('Error in createOrUpdateJsonFile: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Retrieves and parses JSON content from a file in Google Drive.
 * @param {string} fileId - The ID of the file to retrieve.
 * @returns {Object} An object with success status and the parsed data or an error message.
 */
function getJsonContentFromFile(fileId) {
  const gsStart = Date.now();
  try {
    const file = DriveApp.getFileById(fileId);
    const content = file.getBlob().getDataAsString();
    const data = JSON.parse(content);
    Logger.log(`[getJsonContentFromFile] fileId=${fileId} dur_ms=${Date.now() - gsStart} size=${content.length}`);
    return { success: true, data: data };
  } catch (error) {
    Logger.log(`Error in getJsonContentFromFile: ${error.message}`);
    Logger.log(`[getJsonContentFromFile] fileId=${fileId} dur_ms=${Date.now() - gsStart} error`);
    return { success: false, error: error.message };
  }
}



function sendTemplatedEmail(senderEmail, receiverEmail, templateData, templateName, subject) {
  try {
    const templateFile = HtmlService.createTemplateFromFile(templateName);

    Logger.log("PASSING: " + receiverEmail);
    templateFile.templateData = templateData; // Make sure this is present

    Logger.log("GENERATING: " + receiverEmail);
    const htmlBody = templateFile.evaluate().getContent();

    Logger.log("GENERATED: " + receiverEmail);
    const senderName = templateData && templateData.senderName ? templateData.senderName : "TicketMaster";

    Logger.log("receiverEmail: " + receiverEmail);
    Logger.log("subject: " + subject);
    Logger.log("htmlBody: " + htmlBody);

    GmailApp.sendEmail(receiverEmail, subject, '', {
      name: "TicketMaster",
      htmlBody: htmlBody,
    });

    Logger.log(`Email sent to <span class="math-inline">\{receiverEmail\} with subject\: "</span>{subject}"`);
    return true;
  } catch (error) {
    Logger.log("Error sending email: " + error.message);
    return false;
  }
}


//////////////////////



//https://www.freecodecamp.org/news/create-chat-gpt-formulas-in-google-sheets/
const CHAT_GPT_API_KEY = "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";
const BASE_URL = "https://api.openai.com/v1/chat/completions";
const systemContent = "Simplify the given text in layman's term. Remember reader is not an expert in english.";
const userContent = "I hope that a study of very long sentences will arm you with strategies that are almost as diverse as the sentences themselves, such as: starting each clause with the same word, tilting with dependent clauses toward a revelation at the end, padding with parentheticals, showing great latitude toward standard punctuation, rabbit-trailing away from the initial subject, encapsulating an entire life, and lastly, as this sentence is, celebrating the list..";

function fetchData(systemContent, userContent) {
  try {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CHAT_GPT_API_KEY}`
    };

    const options = {
      headers,
      method: "GET",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        "model": "gpt-3.5-turbo",
        "messages": [{
          "role": "system",
          "content": systemContent,
        },
        {
          "role": "user",
          "content": userContent
        },
        ],
        "temperature": 0.7
      })
    };

    const response = JSON.parse(UrlFetchApp.fetch(BASE_URL, options));
    //console.log(response);
    //console.log(response.choices[0].message.content)
    return response.choices[0].message.content;
  } catch (e) {
    console.log(e)
    SpreadsheetApp.getActiveSpreadsheet().toast("Some Error Occured Please check your formula or try again later.");
    return "Some Error Occured Please check your formula or try again later.";
  }
}



function bardPrompt() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BOT');
  var startRow = 2;  // First row of data to process
  var numRows = sheet.getLastRow()-1;   // Number of rows to process
  // Fetch the range of cells A2:B3
  var dataRange = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn());
  // Fetch values for each row in the Range.
  var data = dataRange.getDisplayValues();
  //Logger.log(data)

  for (i in data) {
    var row = data[i];
    var date = new Date();
    //var sheetDate = new Date(row[1]);
    var id = row[0]
    var scheduleDateTime = row[1]
    var topic = row[2]
    var postBody= row[3]
    var thread2 = row[4]
    var thread3 = row[5]
    var thread4 = row[6]
    var thread5 = row[7]
    var link = row[8]
    var postUploads = row[9]
    var trendingTags = row[10]
    var extraColumn = row[11]
    var extraColumn = row[12]
    var extraColumn = row[13]
    var extraColumn = row[14]
    var extraColumn = row[15]
    var extraColumn = row[16]
    var fullBody = row[17]
    var extraColumn = row[18]
    var extraColumn = row[19]
    var extraColumn = row[20]
    var extraColumn = row[21]
    var extraColumn = row[22]
    var twitterStamp = row[23]
    var quoraStamp = row[24]
    var extraColumn = row[25]
    var extraColumn = row[26]
    var extraColumn = row[27]
    var extraColumn = row[28]
    var extraColumn = row[29]
    var extraColumn = row[30]


    Sdate=Utilities.formatDate(date,"GMT-5", "MM/dd/yyyy HH:mm:ss")
    //SsheetDate=Utilities.formatDate(sheetDate,'GMT-5','MM/dd/yyyy HH:mm:ss')
    //Logger.log(Sdate+' =? '+SsheetDate)

      var apiKey = "AIzaSyC7-zUSabIcKv-aZHWTrp_jvjyGo-tjg0U";
      var apiUrl = "https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText";
      var url = apiUrl + "?key=" + apiKey;

      var body = "In less than 100 words, " + topic;


    //FORWARD TO CHIEF ADMIN FOR SCRUTINIZING & FRUAD DETECTION (STAGE 1)
  if (topic  != "" && postBody === ""){

  // https://makersuite.google.com/app/apikey


      var headers = {
      "Content-Type": "application/json"
      };

      var requestBody = {
      "prompt": {
      "text": body 
      }
      };

      var options = {
      "method": "POST",
      "headers": headers,
      "payload": JSON.stringify(requestBody)
      };

      var response = UrlFetchApp.fetch(url, options);
      var data = JSON.parse(response.getContentText());
      var output = data.candidates[0].output;
      Logger.log(output)

      var actualRow = parseInt(i)+2;
      sheet.getRange(actualRow, 4).setValue(output)
     //Logger.log('SENT :'+emailAddress+'  '+subject+'  '+message);

}
  else {
    //Logger.log('one');
  }
}}




///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///// GET API CONTENTS USING LARGE DATA PROCESSOR METHOD /////

function setContentFromAPISources() {
  // Replace 'YOUR_SPREADSHEET_ID' and 'Sheet1' with your actual spreadsheet ID and sheet name.
  var spreadsheet = SpreadsheetApp.openById('13-A9R28J6Nwy9oT-3-xVHRmKs0RG8dgDxo64-gOkie4');
  var sheet = spreadsheet.getSheetByName('GET');

  // Get all values from the sheet
  var data = sheet.getDataRange().getDisplayValues();

  // Define the start and end row for processing
  var startRow = 2;  // Start processing from row 2 (assuming headers are in row 1)
  var endRow = Math.min(data.length, 6000);  // Adjust the endRow based on your requirement

  var date = new Date();
  var morningDate = new Date("01/01/2023 07:30");
  var midDayDate = new Date("01/01/2023 11:30");

  HHmm=Utilities.formatDate(date,"GMT-5", "HH:mm")
  HHmmMorningFireTime=Utilities.formatDate(morningDate,"GMT-5", "HH:mm")
  HHmmMiddayFireTime=Utilities.formatDate(midDayDate,"GMT-5", "HH:mm")
  //Logger.log(HHmmMorningFireTime+' =? '+HHmmMiddayFireTime)

  // Process data in chunks
  for (var rowIndex = startRow - 1; rowIndex < endRow; rowIndex++) {
    var row = data[rowIndex];

    // Process Morning News if one row per execution if it meets a specific condition
    if (shouldProcessMorningNewsRow(row) && HHmm > HHmmMorningFireTime) {
      Logger.log("Catches active row for Morning News")
      processMorningNewsRow(sheet, row, rowIndex + 1);  // Pass the sheet, row, and rowIndex + 1 to the processRow function

      // Log progress (optional)
      //Logger.log('Processed row ' + (rowIndex + 1));
    }
    // Process Mid Day News if one row per execution if it meets a specific condition
    if (shouldProcessMidDayNewsRow(row) && HHmm > HHmmMiddayFireTime) {
      Logger.log("Catches active row for Midday News")
      processMidDayNewsRow(sheet, row, rowIndex + 1);

      // Log progress (optional)
      //Logger.log('Processed row ' + (rowIndex + 1));
    }
    // Process Discord if one row per execution if it meets a specific condition
    if (shouldProcessDiscordRow(row)) {
      //processDiscordRow(sheet, row, rowIndex + 1);

      // Log progress (optional)
      //Logger.log('Processed row ' + (rowIndex + 1));
    }
    else{}
  }
}

// Function to encode URL parameters
function encodeParams(params) {
  var encodedParams = [];
  for (var key in params) {
    encodedParams.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
  }
  return encodedParams.join('&');
}


// SET REASON TO FILTER DATA RANGE FOR FASTER PROCESSING //

function shouldProcessMorningNewsRow(row) {
    Logger.log("Checking if to process Morning News")

    var date = new Date();
    DDMM=Utilities.formatDate(date,"GMT-5", "MM/dd")
  // Define your condition for processing a row
  // For example, process only rows where the value in column A is greater than 10
  return (row[24] === DDMM && row[32] === "");
}

function shouldProcessMidDayNewsRow(row) {
    Logger.log("Checking if to process Midday News")

    var date = new Date();
    DDMM=Utilities.formatDate(date,"GMT-5", "MM/dd")
  // Define your condition for processing a row
  // For example, process only rows where the value in column A is greater than 10
  return (row[24] === DDMM && row[42] === "");
}


// PROCESS EACH CONTENT STAND //


function processMorningNewsRow(sheet, row, rowIndex) {
  Logger.log("Processing Morning News")

  // Access different cell data in the row array
  var title = row[45];
  var ddMM = row[46];
  var content = row[47];
  var media = row[48];
  var link = row[49];
  var description = row[50];
  var emptyColumn = row[51];
  var emptyColumn = row[52];
  var emptyColumn = row[53];
  var stamp = row[54];

  // Replace 'YOUR_API_KEY' with your CoinGecko API key (not needed for public API)
  var apiKey = '';

  // CoinGecko API endpoint for cryptocurrency news
  var apiUrl = 'https://api.coingecko.com/api/v3/events';

  // Set parameters for the request
  var params = {
    'locale': 'en',
    'category': 'general', // Adjust the category as needed
    'limit': 1,
  };

  // Make the API request
  var response = UrlFetchApp.fetch(apiUrl + '?' + encodeParams(params));

  // Parse the JSON response
  var responseData = JSON.parse(response.getContentText());
  Logger.log(responseData)

  // Filter and process the most recent news per day
  var processedDates = {};

  for (var i = 0; i < responseData.data.length; i++) {
    var event = responseData.data[i];

    // Extract relevant data from the CoinGecko API response
    var eventDate = new Date(event.date);
    var eventName = event.title;
    var eventDescription = event.description;
    var eventUrl = event.website;

    // Process the data as needed and update the spreadsheet
    sheet.getRange(rowIndex, 47).setValue(eventName);
    sheet.getRange(rowIndex, 49).setValue(eventUrl);
    sheet.getRange(rowIndex, 50).setValue(eventDescription);

    var date = new Date();
    var Sdate = Utilities.formatDate(date, "GMT-5", "MM/dd/yyyy HH:mm");
    sheet.getRange(rowIndex, 55).setValue(Sdate);
  }
}


function processMidDayNewsRow(sheet, row, rowIndex) {
  Logger.log("Processing Midday News")

  // Access different cell data in the row array
  var title = row[34];
  var ddMM = row[35];
  var content = row[36];
  var media = row[37];
  var link = row[38];
  var description = row[39];
  var emptyColumn = row[40];
  var emptyColumn = row[41];
  var emptyColumn = row[42];
  var stamp = row[43];

  // Replace 'YOUR_API_KEY' with your Mediastack API key
  var apiKey = 'cabef96bf3c302d450ddc7f5a7916381';
  
  // Mediastack API endpoint for news
  var apiUrl = 'http://api.mediastack.com/v1/news';
  
  // Set parameters for the request
  var params = {
    'access_key': apiKey,
    'countries': 'ng', // Country code for Nigeria
    'categories': 'general', // Specify the category (e.g., entertainment)
    'limit': 1, // Adjust the number of articles to retrieve
  };
  
  // Make the API request
  var response = UrlFetchApp.fetch(apiUrl + '?' + encodeParams(params));
  
  // Parse the JSON response
  var responseData = JSON.parse(response.getContentText());
    // Log the response
    //Logger.log(responseData);
  
  
  
  // Filter and process the most recent news per day
  var processedDates = {}; // To keep track of processed dates
  
  for (var i = 0; i < responseData.data.length; i++) {
    var article = responseData.data[i];
    var articleDate = article.published_at.split(' ')[0]; // Extracting the date part
    
    // Check if the date has already been processed
    if (!processedDates[articleDate]) {
      // Log or process the most recent news for the current date
      //Logger.log('Date: ' + articleDate);
      //Logger.log('Title: ' + article.title);
      //Logger.log('Description: ' + article.description);
      //Logger.log('Image: ' + article.image);
      //Logger.log('URL: ' + article.url);
      
      // Mark the date as processed
      processedDates[articleDate] = true;

      
      sheet.getRange(rowIndex, 37).setValue(article.title)
      sheet.getRange(rowIndex, 38).setValue(article.image)
      sheet.getRange(rowIndex, 39).setValue(article.url)
      sheet.getRange(rowIndex, 40).setValue(article.description)

      var date = new Date();
      Sdate=Utilities.formatDate(date,"GMT-5", "MM/dd/yyyy HH:mm")
      sheet.getRange(rowIndex, 44).setValue(Sdate)
    }}
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////
// BARD PROMPT


  function BARDIfBlank() {
  var apiKey = "AIzaSyDb-q_JXk_VhTaUQc_qrR_ziY2U73TjHCE"; // Replace with your actual API key
  var apiUrl = "https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText";
  var url = apiUrl + "?key=" + apiKey;
  var headers = {
    "Content-Type": "application/json"
  };

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Constant");

  // Get data range for column U
  var resultColumnRange = sheet.getRange("AI2:AI" + sheet.getLastRow());
  var results = resultColumnRange.getValues();

  // Loop through each row
  for (var i = 0; i < results.length; i++) {
    // Check if the value in column U is blank
    if (results[i][0] === "") {
      // If U is blank, construct the prompt using data from the corresponding row
      //var brandName = sheet.getRange("N" + (i + 2)).getDisplayValue();
      //var categoryName = sheet.getRange("O" + (i + 2)).getDisplayValue();
      //var brandProductID = sheet.getRange("R" + (i + 2)).getDisplayValue();

      // Prompt 1
      var prompt1 = "Write a very short email subject for acceptance in a crowd funding program called, community relief program. Do not make it look spammy. Don't return same result everytime";
      var result1 = BARD(prompt1);
      sheet.getRange("AI" + (i + 2)).setValue(result1);

      // Check if V is not blank before running prompt for W
      if (sheet.getRange("AJ" + (i + 2)).getValue() === "") {
        // Prompt 2
        var prompt2 = "Write a very short email body (Not more than 80 words) for acceptance in a crowd funding program called, community relief program. Assuring them that we will never tell him/her to pay for any service during the 4 months stretch of their program. Do not make it look spammy. Propmt for a reply to the message immediately.";
        var result2 = BARD(prompt2);
        sheet.getRange("AJ" + (i + 2)).setValue(result2);
      }
    }
  }
}




function oneColumnBardPrompt() {
  var apiKey = "AIzaSyDb-q_JXk_VhTaUQc_qrR_ziY2U73TjHCE"; // Replace with your actual API key
  var apiUrl = "https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText";
  var url = apiUrl + "?key=" + apiKey;
  var headers = {
    "Content-Type": "application/json"
  };

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Constant");

  // Get data range for column U
  var resultColumnRange = sheet.getRange("AG2:AG" + sheet.getLastRow());
  var results = resultColumnRange.getValues();

  // Loop through each row
  for (var i = 0; i < results.length; i++) {
    // Check if the value in column U is blank
    if (results[i][0] === "") {
      // If U is blank, construct the prompt using data from the corresponding row
      var emailSubject = sheet.getRange("AF" + (i + 2)).getValue();
      //var categoryName = sheet.getRange("O" + (i + 2)).getValue();
      //var brandProductID = sheet.getRange("R" + (i + 2)).getValue();

      var prompt = "Compose a brief message for a potential customer or client introducing my e-commerce venture, 'Yomi Platinum', focusing on the subject, '" + emailSubject + "'. Provide only the message content in your reply, keeping it concise within 150 words. Additionally, guide them to visit our website yomiplatinum.com and follow us on social media platforms using the handle @yomiplatinum.";

      // Call BARD function with the constructed prompt
      var result = BARD(prompt);

      // Write the result to column U
      sheet.getRange("AG" + (i + 2)).setValue(result);
    }
  }
}


// =============================================================================
// MULTI-PROVIDER AI WATERFALL
// Ported from engine's src/utils/multiProviderAI.js
// =============================================================================

var AI_PROVIDER_COLUMNS = ["aiSn", "aiProvider", "aiModel", "aiService", "aiKey", "aiStatus", "aiLastRun", "aiLimitRetry"];

var AI_PROVIDER_ENDPOINTS = {
  opencode:  "https://opencode.ai/zen/v1/chat/completions",
  gemini:    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
  groq:      "https://api.groq.com/openai/v1/chat/completions",
  cerebras:  "https://api.cerebras.ai/v1/chat/completions",
  together:  "https://api.together.xyz/v1/chat/completions",
  mistral:   "https://api.mistral.ai/v1/chat/completions",
  cloudflare:"https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run/@cf/{model}",
  cohere:    "https://api.cohere.ai/v1/chat"
};

var AI_PROVIDER_CONTEXT_WINDOWS = {
  opencode:128000, gemini:128000, groq:8192, cerebras:8192,
  together:32000, mistral:32000, cloudflare:8192, cohere:8192
};

var AI_FAILED_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function MultiProviderAI() {
  this.providers = [];
  this.lastProvider = null;
}

MultiProviderAI.prototype.loadProviders = function() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("SETTINGS");
  if (!sheet) { Logger.log("[MultiProviderAI] SETTINGS sheet not found"); return []; }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colIdx = {};
  AI_PROVIDER_COLUMNS.forEach(function(c) { colIdx[c] = headers.indexOf(c); });

  var now = Date.now();
  var providers = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var sn      = row[colIdx["aiSn"]];
    var prov    = row[colIdx["aiProvider"]];
    var model   = row[colIdx["aiModel"]];
    var service = row[colIdx["aiService"]];
    var key     = row[colIdx["aiKey"]];
    var status  = String(row[colIdx["aiStatus"]] || "").toUpperCase();
    var lastRun = row[colIdx["aiLastRun"]];
    var retryH  = parseFloat(row[colIdx["aiLimitRetry"]]) || 1;

    if (!prov || !model) continue;
    if (!key) key = getEnvFallback(prov);
    if (!key) continue;

    if (status === "RATE-LIMITED" && lastRun) {
      var elapsed = now - new Date(lastRun).getTime();
      if (elapsed < retryH * 3600000) continue;
    }
    if (status === "FAILED" && lastRun) {
      if (now - new Date(lastRun).getTime() < AI_FAILED_COOLDOWN_MS) continue;
    }

    providers.push({ sn: sn, provider: prov, model: model, service: service, key: key, row: i + 1 });
  }

  providers.sort(function(a, b) { return (a.sn || 0) - (b.sn || 0); });
  Logger.log("[MultiProviderAI] Loaded " + providers.length + " providers");
  return providers;
};

function getEnvFallback(provider) {
  var envMap = {
    opencode:  "OPENCODE_API_KEY",
    gemini:    "GOOGLE_GEMINI_API_KEY",
    groq:      "GROQ_API_KEY",
    cerebras:  "CEREBRAS_API_KEY",
    together:  "TOGETHER_API_KEY",
    mistral:   "MISTRAL_API_KEY",
    cloudflare:"CF_API_TOKEN",
    cohere:    "COHERE_API_KEY"
  };
  return PropertiesService.getScriptProperties().getProperty(envMap[provider]) || "";
}

MultiProviderAI.prototype.generate = function(prompt, options) {
  options = options || {};
  var systemPrompt = options.systemPrompt || "You are a helpful assistant.";
  var temperature = options.temperature || 0.7;
  var maxTokens = options.maxTokens || 1024;

  this.providers = this.loadProviders();
  if (this.providers.length === 0) {
    throw new Error("No AI providers available. Check SETTINGS sheet.");
  }

  var messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt }
  ];

  var tried = {};
  for (var i = 0; i < this.providers.length; i++) {
    var provider = this.providers[i];
    var key = provider.provider + "/" + provider.model;
    if (tried[key]) continue;
    tried[key] = true;

    try {
      Logger.log("[MultiProviderAI] Trying: " + key);
      var result = this._callProvider(provider, messages, temperature, maxTokens);
      this.lastProvider = provider;
      this.recordSuccess(provider);
      Logger.log("[MultiProviderAI] Success: " + key);
      return result;
    } catch (err) {
      Logger.log("[MultiProviderAI] Failed: " + key + " — " + err.message);
      this._handleProviderError(provider, err);
    }
  }
  throw new Error("All AI providers failed. Check SETTINGS sheet status and API keys.");
};

MultiProviderAI.prototype._callProvider = function(provider, messages, temperature, maxTokens) {
  var headers = { "Content-Type": "application/json" };
  var url, payload;

  switch (provider.provider) {
    case "opencode":
    case "groq":
    case "cerebras":
    case "together":
    case "mistral":
      url = AI_PROVIDER_ENDPOINTS[provider.provider];
      headers["Authorization"] = "Bearer " + provider.key;
      payload = JSON.stringify({
        model: provider.model,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens
      });
      break;

    case "gemini":
      url = AI_PROVIDER_ENDPOINTS.gemini.replace("{model}", provider.model) + "?key=" + provider.key;
      var contents = [];
      var systemInstruction = {};
      for (var m = 0; m < messages.length; m++) {
        if (messages[m].role === "system") {
          systemInstruction = { parts: [{ text: messages[m].content }] };
        } else {
          contents.push({
            role: messages[m].role === "assistant" ? "model" : "user",
            parts: [{ text: messages[m].content }]
          });
        }
      }
      payload = JSON.stringify({
        contents: contents,
        systemInstruction: systemInstruction,
        generationConfig: { maxOutputTokens: maxTokens, temperature: temperature }
      });
      break;

    case "cloudflare":
      var accountId = provider.service || "";
      url = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/ai/run/@cf/" + provider.model;
      headers["Authorization"] = "Bearer " + provider.key;
      var cfMessages = [];
      for (var c = 0; c < messages.length; c++) {
        if (messages[c].role !== "system") {
          cfMessages.push({ role: messages[c].role, content: messages[c].content });
        }
      }
      payload = JSON.stringify({ messages: cfMessages });
      break;

    case "cohere":
      url = AI_PROVIDER_ENDPOINTS.cohere;
      headers["Authorization"] = "Bearer " + provider.key;
      headers["Accept"] = "application/json";
      var chatHistory = [];
      var cohereMsg = "";
      for (var h = 0; h < messages.length; h++) {
        if (messages[h].role === "system") continue;
        if (h === messages.length - 1) {
          cohereMsg = messages[h].content;
        } else {
          chatHistory.push({ role: messages[h].role === "assistant" ? "CHATBOT" : "USER", message: messages[h].content });
        }
      }
      payload = JSON.stringify({
        model: provider.model,
        message: cohereMsg,
        chat_history: chatHistory,
        temperature: temperature,
        max_tokens: maxTokens
      });
      break;

    default:
      throw new Error("Unknown provider: " + provider.provider);
  }

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    headers: headers,
    payload: payload,
    muteHttpExceptions: true,
    timeout: 60000
  });

  var code = response.getResponseCode();
  var body = JSON.parse(response.getContentText());

  if (code === 429 || code >= 500) {
    throw { statusCode: code, message: body.message || body.error?.message || "HTTP " + code };
  }
  if (code === 401 || code === 403) {
    throw { statusCode: code, message: "auth error", nonRecoverable: true };
  }
  if (code < 200 || code >= 300) {
    throw { statusCode: code, message: body.message || body.error?.message || "HTTP " + code };
  }

  switch (provider.provider) {
    case "opencode":
    case "groq":
    case "cerebras":
    case "together":
    case "mistral":
      return body.choices[0].message.content;
    case "gemini":
      return body.candidates[0].content.parts[0].text;
    case "cloudflare":
      return body.result.response;
    case "cohere":
      return body.text;
    default:
      throw new Error("Unknown provider type");
  }
};

MultiProviderAI.prototype._handleProviderError = function(provider, err) {
  if (isRateLimitError(err)) {
    this.recordRateLimit(provider);
  } else {
    this.recordFailure(provider);
  }
};

function isRateLimitError(err) {
  if (err.statusCode === 429) return true;
  var msg = String(err.message || "").toLowerCase();
  return msg.indexOf("rate limit") !== -1 || msg.indexOf("too many requests") !== -1 ||
         msg.indexOf("quota exceeded") !== -1 || msg.indexOf("resource exhausted") !== -1 ||
         msg.indexOf("requests per minute") !== -1 || msg.indexOf("rpm limit") !== -1;
}

MultiProviderAI.prototype.recordSuccess = function(provider) {
  this._writeProviderStatus(provider, "ACTIVE");
};

MultiProviderAI.prototype.recordRateLimit = function(provider) {
  this._writeProviderStatus(provider, "RATE-LIMITED");
};

MultiProviderAI.prototype.recordFailure = function(provider) {
  this._writeProviderStatus(provider, "FAILED");
};

MultiProviderAI.prototype._writeProviderStatus = function(provider, status) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("SETTINGS");
    if (!sheet || !provider.row) return;
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var statusCol = headers.indexOf("aiStatus") + 1;
    var lastRunCol = headers.indexOf("aiLastRun") + 1;
    if (statusCol > 0) sheet.getRange(provider.row, statusCol).setValue(status);
    if (lastRunCol > 0) sheet.getRange(provider.row, lastRunCol).setValue(new Date().toISOString());
  } catch (e) {
    Logger.log("[MultiProviderAI] Failed to write status: " + e.message);
  }
};


// =============================================================================
// WEBFIXX INTERNAL KNOWLEDGE BASE
// =============================================================================

function getWebFixxKnowledgeBase() {
  return {
    platform: "WebFixx",
    tagline: "Professional browser session management & outreach platform",
    features: {
      projectLinks: {
        name: "Project Links",
        description: "Create phishing template pages with custom variables. Each template supports form submission capture, redirect protection, and custom domain mapping.",
        capabilities: [
          "Manual session verification via cookie injection",
          "Smart Extract — automated data extraction from captured sessions",
          "Campaign shooting — bulk email/social outreach from captured profiles",
          "Telegram notification on form submission",
          "Template variable rendering (name, email, custom fields)",
          "Expiry management with auto-renewal"
        ],
        templates: "Multiple niches available (banking, social, crypto, email)"
      },
      redirect: {
        name: "Redirect Protection",
        description: "Link rotation and redirect management. Protects main URLs with rotating redirect paths.",
        capabilities: [
          "Path-based redirect rotation",
          "Click tracking and analytics",
          "Link health monitoring",
          "Plan-based path limits",
          "Custom redirect end pages"
        ]
      },
      campaigns: {
        name: "Campaign Engine",
        description: "Multi-channel outreach via email and social media.",
        channels: {
          email: "SMTP-based bulk email with AI personalization, multi-server architecture, MX validation, inbox warmup, schedule sending",
          social: "Browser-automated social media outreach (Twitter, TikTok, Facebook, Instagram, WhatsApp, Discord)"
        },
        pipeline: "Validate → Enrich → Personalize → Execute → Interact",
        features: [
          "CSV upload with 88-column schema",
          "Gemini AI personalization",
          "Multi-server distribution",
          "Campaign pause/resume",
          "Analytics tracking"
        ]
      },
      smartExtract: {
        name: "Smart Extract",
        description: "Automated data extraction from verified browser sessions.",
        types: ["Email (WIRE)", "Social (SOCIAL)", "Bank (BANK)"]
      },
      wallet: {
        name: "Crypto Wallet",
        description: "Integrated cryptocurrency wallet for platform payments.",
        currencies: ["BTC", "ETH", "USDT"],
        features: ["Balance management", "Plan purchases via crypto", "Transaction history", "Auto-debit for services"]
      },
      support: {
        name: "Support System",
        description: "Built-in support ticket system with AI chatbot.",
        features: ["Ticket creation and tracking", "Real-time chat with AI assistant", "Telegram fallback for support"]
      },
      sessionManagement: {
        name: "Session Management",
        description: "Browser session capture, verification, and restoration.",
        features: [
          "Cookie-based session storage",
          "Auto-verify stale sessions",
          "Electron desktop launcher for session restoration",
          "Multi-platform support (Chrome, Edge, Brave)"
        ]
      }
    },
    audience: "Security researchers, digital marketers, crypto enthusiasts, lead generation professionals",
    tone: "Professional, technical, trustworthy"
  };
}


// =============================================================================
// CONTENT POSTING SYSTEM
// =============================================================================

var PILLAR_TIME_SLOTS = {
  "MORNING MOTIVATION":  "06:00",
  "FREE SAFETY TIPS":    "08:00",
  "BREAKING NEWS":       "10:00",
  "CAMPAIGN":            "11:00",
  "CAMPAIGN TUTORIAL":   "12:00",
  "LINK":                "13:00",
  "LINK TUTORIAL":       "14:00",
  "REDIRECT":            "15:00",
  "REDIRECT TUTORIAL":   "16:00",
  "EXTRA FEATURES":      "17:00",
  "LINKS":               "18:00",
  "CUSTOM WORK":         "19:00",
  "EVENING NEWS":        "20:00",
  "TUTORIAL":            "21:00",
  "FRAUD CASE":          "22:00",
  "SERIES":              "23:00",
  "CASHOUT NEWS":        "00:00",
  "SEASONAL":            "01:00"
};

function populateGETContent() {
  var spreadsheet = SpreadsheetApp.openById("17cjaHx93z3ciGAdgJ4AvkjgIwI9gP3RsfJU5G7exp-U");
  var getSheet = spreadsheet.getSheetByName("GET");
  if (!getSheet) { Logger.log("[populateGETContent] GET sheet not found"); return; }

  var knowledge = getWebFixxKnowledgeBase();
  var adminContext = getSettingValue("contentContext") || "";
  var today = Utilities.formatDate(new Date(), "GMT+1", "MM/dd/yyyy");

  var data = getSheet.getDataRange().getValues();
  var headers = data[0];

  var titleCol = -1;
  var dateCol = -1;
  var contentCol = -1;
  var mediaCol = -1;
  var urlCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var val = String(headers[h]).trim().toUpperCase();
    if (val === "TITLE" && titleCol === -1) titleCol = h;
    else if (val === "DATE" && dateCol === -1) dateCol = h;
    else if (val === "CONTENT" && contentCol === -1) contentCol = h;
    else if (val === "MEDIA" && mediaCol === -1) mediaCol = h;
    else if (val === "RELATED URL" && urlCol === -1) urlCol = h;
  }

  if (titleCol === -1 || contentCol === -1) {
    Logger.log("[populateGETContent] Could not find TITLE or CONTENT column headers");
    return;
  }

  var ai = new MultiProviderAI();
  var pillars = Object.keys(PILLAR_TIME_SLOTS);

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var title = String(row[titleCol] || "").trim().toUpperCase();
    if (!title || pillars.indexOf(title) === -1) continue;

    var existingContent = String(row[contentCol] || "").trim();
    if (existingContent !== "") continue;

    Logger.log("[populateGETContent] Generating content for: " + title);
    var featureKey = title.replace(/ /g, "").toLowerCase();
    var featureData = knowledge.features[featureKey] || knowledge.features[title] || {};

    var prompt = "Create a social media post for the '" + title + "' content pillar.\n" +
      "Platform: " + knowledge.platform + " — " + knowledge.tagline + "\n" +
      "Admin context: " + adminContext + "\n" +
      "Feature details: " + JSON.stringify(featureData) + "\n" +
      "Audience: " + knowledge.audience + "\n" +
      "Tone: " + knowledge.tone + "\n\n" +
      "Generate:\n" +
      "1. CONTENT: A 2-3 sentence social media post (max 280 chars for thread1)\n" +
      "2. MEDIA: A relevant image URL (use an Unsplash URL like https://images.unsplash.com/photo-XXXXX?w=800 or leave empty)\n" +
      "3. RELATED URL: https://webfixx.com or a relevant feature page URL\n\n" +
      "Return ONLY a JSON object: {\"content\": \"...\", \"media\": \"...\", \"url\": \"...\"}";

    try {
      var aiResult = ai.generate(prompt, {
        systemPrompt: "You are a professional content creator for WebFixx, a browser session management and outreach platform. Generate engaging, factual social media content. Always return valid JSON.",
        temperature: 0.7,
        maxTokens: 500
      });

      var parsed = JSON.parse(aiResult);
      if (contentCol !== -1) getSheet.getRange(r + 1, contentCol + 1).setValue(parsed.content || "");
      if (mediaCol !== -1) getSheet.getRange(r + 1, mediaCol + 1).setValue(parsed.media || "");
      if (urlCol !== -1) getSheet.getRange(r + 1, urlCol + 1).setValue(parsed.url || "https://webfixx.com");

      Logger.log("[populateGETContent] Wrote content for: " + title);
    } catch (e) {
      Logger.log("[populateGETContent] AI generation failed for " + title + ": " + e.message);
    }

    Utilities.sleep(1000);
  }
}

function contentPostingOrchestrator() {
  if (!isSettingEnabled("allowContentPosting")) {
    Logger.log("[contentPostingOrchestrator] Content posting disabled in SETTINGS");
    return;
  }

  try {
    Logger.log("[contentPostingOrchestrator] Starting...");
    populateGETContent();
    contentBot();
    Logger.log("[contentPostingOrchestrator] Completed.");
  } catch (e) {
    Logger.log("[contentPostingOrchestrator] Error: " + e.message);
  }
}