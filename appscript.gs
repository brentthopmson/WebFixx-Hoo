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
    const userAgent = visitorInfo.userAgent || "Unknown";
    
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

    // Determine message icon and status based on visit type
    let statusIcon, statusText, alertLevel;
    if (visitType === "VALID") {
      statusIcon = "✅";
      statusText = "Valid Visit";
      alertLevel = "";
    } else if (visitType === "FLAGGED") {
      statusIcon = "🚨";
      statusText = "Flagged Visit - Host Mismatch";
      alertLevel = "⚠️ SECURITY ALERT ⚠️\n";
    } else {
      statusIcon = "👁️";
      statusText = "Page Visit";
      alertLevel = "";
    }

    // Construct the message
    const formattedMessage = `${alertLevel}${statusIcon} **${statusText}**

    🌐 **Project:** ${projectName}
    📍 **Path:** \`${path}\`
    🔗 **Full URL:** ${completeUrl}

    👤 **Visitor Details:**
    🌍 **Location:** ${city}, ${region}, ${country}
    🌐 **IP Address:** \`${ip}\`
    🏢 **ISP:** ${isp}
    🕒 **Time:** ${timestamp}
    🌏 **Timezone:** ${timezone}

    💻 **Device Info:**
    📱 **User Agent:** \`${userAgent}\`

    ${visitType === "VALID" ? "✨ Everything looks good!" : "🔍 Please review this activity for potential security concerns."}`;

    const textPayload = {
      method: "sendMessage",
      chat_id: telegramGroupId,
      text: formattedMessage,
      parse_mode: "Markdown"
    };

    const messageId = sendMediaAndMessageToTelegram(textPayload, null);

    if (messageId) {
      Logger.log(`Telegram notification sent successfully for ${visitType} visit to ${projectName}`);
    } else {
      Logger.log(`Failed to send Telegram notification for ${visitType} visit to ${projectName}`);
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
