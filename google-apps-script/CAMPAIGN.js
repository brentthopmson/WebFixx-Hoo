/**
 * CAMPAIGN.js
 * Handles account retrieval and campaign execution triggers
 */

/**
 * Get all social accounts linked to a specific WebFixx project
 * @param {Object} params - Parameters containing projectId
 * @returns {Object} List of accounts with status and basic info
 */
function getProjectAccounts(params) {
  Logger.log("getProjectAccounts called with params: " + JSON.stringify(params));
  var projectIds = params.projectIds;
  if (!projectIds) {
    if (params.projectId) {
      projectIds = [params.projectId];
    } else {
      Logger.log("Error: No projectIds provided");
      return { success: false, error: "projectIds array is required" };
    }
  }

  if (!Array.isArray(projectIds)) projectIds = [projectIds];
  Logger.log("Syncing accounts for project IDs: " + projectIds.join(", "));

  // Load active campaign account IDs to filter out
  var activeAccountIds = {};
  try {
    var campaignsResult = getAllRows("campaigns");
    if (campaignsResult.success) {
      var campHeaders = campaignsResult.headers;
      var statusCol = campHeaders.indexOf("status");
      var settingsCol = campHeaders.indexOf("settings");
      
      if (statusCol !== -1 && settingsCol !== -1) {
        campaignsResult.data.forEach(function(row) {
          var status = row[statusCol];
          if (status && status !== "completed" && status !== "draft") {
            var settingsVal = row[settingsCol];
            if (settingsVal) {
              try {
                var settingsObj = typeof settingsVal === "string" ? JSON.parse(settingsVal) : settingsVal;
                var accountsList = settingsObj.accounts || [];
                accountsList.forEach(function(id) {
                  activeAccountIds[id] = true;
                });
              } catch (e) {
                Logger.log("Error parsing settings for active filter in getProjectAccounts: " + e.message);
              }
            }
          }
        });
      }
    }
  } catch (err) {
    Logger.log("Failed to load campaigns for active filtering in getProjectAccounts: " + err.message);
  }

  var allAccounts = [];

  projectIds.forEach(function (pid) {
    Logger.log("Fetching accounts for project: " + pid);
    var hubData = getRowsByColumn("hub", "projectId", pid);
    if (hubData.success) {
      var headers = hubData.headers;
      var submissionIdIndex = headers.indexOf("submissionId");
      var typeIndex = headers.indexOf("type");
      var emailIndex = headers.indexOf("email");
      var statusIndex = headers.indexOf("status");
      var cookieIndex = headers.indexOf("cookieJSON");

      Logger.log("Headers found: " + headers.join(", "));

      if (statusIndex === -1) {
        Logger.log("CRITICAL: 'status' column not found in 'hub' sheet headers.");
        return;
      }

      var accounts = hubData.data.filter(function (row) {
        var rowStatus = row[statusIndex];
        var accountId = row[submissionIdIndex];
        return rowStatus === "COMPLETED" && !activeAccountIds[accountId];
      }).map(function (row) {
        return {
          accountId: row[submissionIdIndex],
          type: row[typeIndex],
          identifier: row[emailIndex],
          status: "COMPLETED",
          projectId: pid,
          hasCookies: row[cookieIndex] ? true : false
        };
      });
      Logger.log("Found " + accounts.length + " COMPLETED and available accounts for project " + pid);
      allAccounts = allAccounts.concat(accounts);
    } else {
      Logger.log("Error fetching rows for project " + pid + ": " + hubData.error);
    }
  });

  Logger.log("Sync complete. Total COMPLETED and available accounts: " + allAccounts.length);
  return {
    success: true,
    data: allAccounts,
    count: allAccounts.length,
    debug: {
      projectIdsSent: projectIds,
      lastSheetHeaders: headers || []
    }
  };
}

/**
 * Trigger a new campaign execution via the serverless engine
 * @param {Object} params - Campaign parameters (accountIds, strategy, etc)
 * @returns {Object} Execution status
 */
/**
 * Trigger a new campaign execution via the serverless engine
 * @param {Object} params - Campaign parameters (accountIds, strategy, etc)
 * @returns {Object} Execution status
 */
function createNewCampaign(params) {
  try {
    let { projectId, accountIds, strategyContext, status } = params;

    // Normalize accountIds: form-urlencoded sends arrays as comma-separated strings
    if (typeof accountIds === "string") {
      accountIds = accountIds.split(",").map(function(id) { return id.trim(); }).filter(function(id) { return id.length > 0; });
    } else if (!Array.isArray(accountIds)) {
      accountIds = [];
    }

    const campaignId = "CMP-" + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();

    let parsedStrategy = {};
    try {
      parsedStrategy = typeof strategyContext === "string" ? JSON.parse(strategyContext) : (strategyContext || {});
    } catch (e) {
      parsedStrategy = { body: strategyContext };
    }

    // Feature gate: campaign creation
    const gateCampaign = requireSetting("allowCampaignCreation", "campaign creation");
    if (gateCampaign) return gateCampaign;
    // Feature gate: social channel campaigns require allowInteraction
    const gateChannel = (parsedStrategy.channel || "email");
    if (gateChannel === "social") {
      const gateInteraction = requireSetting("allowInteraction", "social interaction");
      if (gateInteraction) return gateInteraction;
    }

    // Determine initial campaign status
    const initialStatus = status || "running";

    // Allow drafts without a projectId (created from CSV upload before project selection)
    if (!projectId && initialStatus !== "draft") {
      return { success: false, error: "Missing required campaign parameters" };
    }
    projectId = projectId || "";

    // If fileContent is provided, decode and store in Drive, then set fileUrl
    var fileUrl = parsedStrategy.fileUrl || "";
    if (params.fileContent) {
      try {
        Logger.log("[createNewCampaign] Storing CSV file: " + params.fileName);
        var decodedBytes = Utilities.base64Decode(params.fileContent);
        var fileName = campaignId + '_' + (params.fileName || 'campaign.csv');
        var blob = Utilities.newBlob(decodedBytes, 'text/csv', fileName);
        var folder = DriveApp.getFolderById(CONFIG.FOLDER_ID.CAMPAIGNS);
        var file = folder.createFile(blob);
        fileUrl = file.getUrl();
        Logger.log("[createNewCampaign] File stored at: " + fileUrl);
      } catch (storeErr) {
        Logger.log("[createNewCampaign] Failed to store file: " + storeErr.message);
        return { success: false, error: "Failed to store uploaded file: " + storeErr.message };
      }
    }

    // Setup complete settings structure
    const settingsData = {
      projectId: projectId,
      accounts: accountIds,
      channel: parsedStrategy.channel || "email",
      name: parsedStrategy.name || campaignId,
      subject: parsedStrategy.subject || "",
      body: parsedStrategy.body || "",
      fileUrl: fileUrl,
      smtpSettings: parsedStrategy.smtpSettings || [],
      deliveryMethod: parsedStrategy.deliveryMethod || "smtp",
      
      // Staged prep parameters
      validationStaged: parsedStrategy.validationStaged || false,
      validationStatus: parsedStrategy.validationStatus || "idle",
      enrichmentStaged: parsedStrategy.enrichmentStaged || false,
      enrichmentStatus: parsedStrategy.enrichmentStatus || "idle",
      aiPersonalizationStaged: parsedStrategy.aiPersonalizationStaged || false,
      aiPersonalizationPrompt: parsedStrategy.aiPersonalizationPrompt || "",
      personalizationStatus: parsedStrategy.personalizationStatus || "idle",
      
      // Link tracking parameters
      linkType: parsedStrategy.linkType || "project",
      linkId: parsedStrategy.linkId || "",
      
      // Social targeting options
      socialInteractionTypes: parsedStrategy.socialInteractionTypes || [],
      socialStrategyPrompt: parsedStrategy.socialStrategyPrompt || "",
      socialKeywords: parsedStrategy.socialKeywords || [],
      
      // DM to all CSV profiles flag
      shouldSendMessage: parsedStrategy.shouldSendMessage || false
    };

    const campaignData = {
      createdOn: new Date().toLocaleString(),
      campaignId: campaignId,
      userId: params.userId || "anonymous",
      type: parsedStrategy.type || (parsedStrategy.channel === "social" ? "Social" : "general"),
      fileUrl: fileUrl,
      settings: JSON.stringify(settingsData),
      context: typeof strategyContext === "object" ? JSON.stringify(strategyContext) : (strategyContext || "{}"),
      status: initialStatus,
      stats: JSON.stringify({ interactions: 0, conversions: 0, inbox: 0 }),
      updatedOn: new Date().toLocaleString()
    };

    // Ensure the campaigns sheet exists before writing
    ensureCampaignsSheet();

    // Always persist the campaign to sheet before any execution
    var saveResult = setRowDataByHeaderMap(CONFIG.SHEET_NAME.CAMPAIGNS, campaignData);
    if (!saveResult.success) {
      return { success: false, error: "Failed to save campaign: " + saveResult.error };
    }

    // If status is draft, just save and do not call the external serverless executor immediately
    if (initialStatus === "draft") {
      return {
        success: true,
        message: "Draft campaign saved successfully",
        campaignId: campaignId,
        fileUrl: fileUrl,
        details: campaignData
      };
    }

    // 1. Fetch full account details including cookies for each accountId
    const accountsWithCookies = [];
    for (const id of accountIds) {
      const result = getRowsByColumn("hub", "submissionId", id);
      if (result.success && result.count > 0) {
        const row = result.data[0];
        const headers = result.headers;
        const cookieJSON = row[headers.indexOf("cookieJSON")];

        if (cookieJSON) {
          accountsWithCookies.push({
            accountId: id,
            type: row[headers.indexOf("type")],
            identifier: row[headers.indexOf("email")],
            cookies: JSON.parse(cookieJSON)
          });
        }
      }
    }

    if (accountsWithCookies.length === 0) {
      return { success: false, error: "No accounts with valid cookies found for execution" };
    }

    // 2. Prepare payload for serverless engine
    const payload = {
      campaignId,
      projectId,
      accounts: accountsWithCookies,
      settings: settingsData,
      context: parsedStrategy,
      timestamp: new Date().toISOString()
    };

    // 3. Call the external headless engine
    const EXTERNAL_API = CONFIG.EXTERNAL_API + "/api/execute-campaign";

    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'ngrok-skip-browser-warning': 'true'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(EXTERNAL_API, options);
    const result = JSON.parse(response.getContentText());

    return {
      success: result.success || false,
      message: result.message || "Campaign initiation result",
      executionId: result.executionId || null,
      details: result,
      campaignId: campaignId
    };

  } catch (error) {
    Logger.log("Error in createNewCampaign: " + error.message);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Ensure the campaigns sheet exists with proper headers, create if missing
 */
function ensureCampaignsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME.CAMPAIGNS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME.CAMPAIGNS);
    const headers = ["sn", "createdOn", "campaignId", "userId", "type", "fileUrl", "settings", "context", "status", "stats", "updatedOn"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    Logger.log("Created campaigns sheet with headers");
  } else {
    // Heal #REF! header if present (column A has a formula, but header got broken)
    var firstHeader = sheet.getRange(1, 1).getValue();
    if (firstHeader === "#REF!") {
      sheet.getRange(1, 1).setValue("sn");
      Logger.log("Healed #REF! header back to 'sn'");
    }
  }
}

/**
 * Execute an existing draft campaign
 * @param {Object} params - Campaign execution parameters
 * @returns {Object} Execution status
 */
function executeCampaign(params) {
  try {
    const gateShooting = requireSetting("allowShooting", "campaign shooting");
    if (gateShooting) return gateShooting;
    const { campaignId } = params;
    if (!campaignId) {
      return { success: false, error: "campaignId is required" };
    }

    // 1. Fetch campaign row
    const result = getRowsByColumn("campaigns", "campaignId", campaignId);
    if (!result.success || result.count === 0) {
      return { success: false, error: "Campaign not found" };
    }

    const row = result.data[0];
    const headers = result.headers;
    const currentStatus = row[headers.indexOf("status")];
    if (currentStatus && String(currentStatus).trim().toLowerCase() === "paused") {
      return { success: false, error: "Campaign is paused. Resume it to continue shooting." };
    }

    const settingsStr = row[headers.indexOf("settings")];
    const contextStr = row[headers.indexOf("context")];

    let settings = {};
    try {
      settings = typeof settingsStr === "string" ? JSON.parse(settingsStr) : (settingsStr || {});
    } catch (e) {
      Logger.log("Error parsing settings: " + e.message);
    }

    const projectId = settings.projectId || "";
    const accountIds = settings.accounts || [];

    // 2. Fetch full account details including cookies for each accountId
    const accountsWithCookies = [];
    for (const id of accountIds) {
      const res = getRowsByColumn("hub", "submissionId", id);
      if (res.success && res.count > 0) {
        const r = res.data[0];
        const h = res.headers;
        const cookieJSON = r[h.indexOf("cookieJSON")];

        if (cookieJSON) {
          accountsWithCookies.push({
            accountId: id,
            type: r[h.indexOf("type")],
            identifier: r[h.indexOf("email")],
            cookies: JSON.parse(cookieJSON)
          });
        }
      }
    }

    // 3. Prepare payload for serverless engine
    const payload = {
      campaignId,
      projectId,
      accounts: accountsWithCookies,
      settings: settings,
      context: contextStr ? (typeof contextStr === "string" ? JSON.parse(contextStr) : contextStr) : {},
      timestamp: new Date().toISOString()
    };

    // 4. Call the external headless engine
    const EXTERNAL_API = CONFIG.EXTERNAL_API + "/api/execute-campaign";

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(EXTERNAL_API, options);
    const apiResult = JSON.parse(response.getContentText());

    if (apiResult.success || response.getResponseCode() === 200) {
      // Update status to 'running'
      const updates = {
        status: "running",
        updatedOn: new Date().toLocaleString()
      };
      setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, updates);
      
      return {
        success: true,
        message: "Campaign executed and started running successfully",
        data: apiResult
      };
    } else {
      return {
        success: false,
        error: apiResult.error || "Failed to execute campaign via serverless API"
      };
    }

  } catch (error) {
    Logger.log("Error in executeCampaign: " + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Update an existing campaign's settings or status
 * @param {Object} params - Campaign parameters
 */
function updateCampaign(params) {
  try {
    const { campaignId, settings, status } = params;
    if (!campaignId) {
      return { success: false, error: "campaignId is required" };
    }

    const updates = {
      updatedOn: new Date().toLocaleString()
    };
    if (settings) updates.settings = settings;
    if (status) updates.status = status;

    const result = setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, updates);
    return { success: true, message: "Campaign updated successfully", data: result };
  } catch (error) {
    Logger.log("Error in updateCampaign: " + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a campaign from the sheet
 * @param {Object} params - Campaign parameters
 */
function deleteCampaign(params) {
  try {
    const { campaignId } = params;
    if (!campaignId) {
      return { success: false, error: "campaignId is required" };
    }

    const result = deleteSheetRow("campaigns", "campaignId", campaignId);
    return { success: true, message: "Campaign deleted successfully", data: result };
  } catch (error) {
    Logger.log("Error in deleteCampaign: " + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Pause a running campaign. Only campaigns with status 'running' or 'Limit Reached'
 * can be paused. Paused campaigns will not shoot further contacts until resumed.
 * @param {Object} params - { campaignId }
 * @returns {Object} Result object
 */
function pauseCampaign(params) {
  try {
    const { campaignId } = params;
    if (!campaignId) {
      return { success: false, error: "campaignId is required" };
    }

    const result = getRowsByColumn("campaigns", "campaignId", campaignId);
    if (!result.success || result.count === 0) {
      return { success: false, error: "Campaign not found" };
    }

    const headers = result.headers;
    const row = result.data[0];
    const currentStatus = row[headers.indexOf("status")];
    const normalized = currentStatus ? String(currentStatus).trim().toLowerCase() : "";

    if (normalized === "paused") {
      return { success: true, message: "Campaign is already paused." };
    }
    if (normalized !== "running" && normalized !== "limit reached") {
      return { success: false, error: "Only running or Limit Reached campaigns can be paused (current status: " + (currentStatus || "unknown") + ")." };
    }

    const updates = {
      status: "paused",
      updatedOn: new Date().toLocaleString()
    };
    const writeResult = setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, updates);
    if (!writeResult.success) {
      return { success: false, error: writeResult.error };
    }

    Logger.log(`[pauseCampaign] Campaign ${campaignId} paused (was: ${currentStatus})`);
    return { success: true, message: "Campaign paused successfully. No further contacts will be shot until resumed.", status: "paused" };
  } catch (error) {
    Logger.log("Error in pauseCampaign: " + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Resume a paused campaign and immediately continue shooting from the checkpoint.
 * @param {Object} params - { campaignId }
 * @returns {Object} Result object
 */
function resumeCampaign(params) {
  try {
    const { campaignId } = params;
    if (!campaignId) {
      return { success: false, error: "campaignId is required" };
    }

    const result = getRowsByColumn("campaigns", "campaignId", campaignId);
    if (!result.success || result.count === 0) {
      return { success: false, error: "Campaign not found" };
    }

    const headers = result.headers;
    const row = result.data[0];
    const currentStatus = row[headers.indexOf("status")];
    const normalized = currentStatus ? String(currentStatus).trim().toLowerCase() : "";

    if (normalized !== "paused") {
      return { success: false, error: "Only paused campaigns can be resumed (current status: " + (currentStatus || "unknown") + ")." };
    }

    const updates = {
      status: "running",
      updatedOn: new Date().toLocaleString()
    };
    const writeResult = setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, updates);
    if (!writeResult.success) {
      return { success: false, error: writeResult.error };
    }

    Logger.log(`[resumeCampaign] Campaign ${campaignId} resumed from 'paused', continuing shooting from checkpoint.`);

    // Continue shooting immediately from the checkpoint in one action.
    const executionResult = executeCampaign(params);
    if (executionResult && executionResult.success) {
      return { success: true, message: "Campaign resumed and continued shooting.", status: "running", execution: executionResult };
    }
    return { success: true, message: "Campaign resumed. Re-run or continue shooting manually if the engine did not continue.", status: "running", execution: executionResult };
  } catch (error) {
    Logger.log("Error in resumeCampaign: " + error.message);
    return { success: false, error: error.message };
  }
}

function getCampaign(params) {
  try {
    var campaignId = params.campaignId;
    if (!campaignId) {
      return { success: false, error: "campaignId is required" };
    }

    var result = getRowsByColumn("campaigns", "campaignId", campaignId);
    if (!result.success || result.count === 0) {
      return { success: false, error: "Campaign not found" };
    }

    var headers = result.headers;
    var row = result.data[0];
    var campaign = {};
    headers.forEach(function(h, i) { campaign[h] = row[i]; });

    // Parse JSON fields
    if (campaign.settings) {
      try { campaign.settings = JSON.parse(campaign.settings); } catch (e) {}
    }
    if (campaign.updatedOn) {
      try { campaign.updatedOn = JSON.parse(campaign.updatedOn); } catch (e) {}
    }

    return { success: true, data: campaign };
  } catch (error) {
    Logger.log("Error in getCampaign: " + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Validate a campaign's email list
 * @param {Object} params - Campaign parameters
 */
function validateCampaignEmails(params) {
  try {
    const { campaignId } = params;
    if (!campaignId) {
      return { success: false, error: "campaignId is required" };
    }

    // 1. Fetch campaign row
    const result = getRowsByColumn("campaigns", "campaignId", campaignId);
    if (!result.success || result.count === 0) {
      return { success: false, error: "Campaign not found" };
    }

    const row = result.data[0];
    const headers = result.headers;
    const settingsStr = row[headers.indexOf("settings")];
    const contextStr = row[headers.indexOf("context")];

    let settings = {};
    try {
      settings = typeof settingsStr === "string" ? JSON.parse(settingsStr) : (settingsStr || {});
    } catch (e) {
      Logger.log("Error parsing settings: " + e.message);
    }

    // 2. Update status to 'processing'
    settings.validationStatus = "processing";
    const updates = {
      settings: JSON.stringify(settings),
      updatedOn: new Date().toLocaleString()
    };
    setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, updates);

    // 3. Dispatch to Serverless
    const payload = {
      campaignId,
      fileUrl: settings.fileUrl || "",
      settings: settings,
      context: contextStr ? (typeof contextStr === "string" ? JSON.parse(contextStr) : contextStr) : {}
    };

    const EXTERNAL_API = CONFIG.EXTERNAL_API + "/api/validate-campaign";
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(EXTERNAL_API, options);
    const apiResult = JSON.parse(response.getContentText());

    return {
      success: apiResult.success || false,
      message: apiResult.message || "Email validation initiated",
      data: apiResult
    };

  } catch (error) {
    Logger.log("Error in validateCampaignEmails: " + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Enrich a campaign's lead list
 * @param {Object} params - Campaign parameters
 */
function enrichCampaignLeads(params) {
  try {
    const { campaignId } = params;
    if (!campaignId) {
      return { success: false, error: "campaignId is required" };
    }

    // 1. Fetch campaign row
    const result = getRowsByColumn("campaigns", "campaignId", campaignId);
    if (!result.success || result.count === 0) {
      return { success: false, error: "Campaign not found" };
    }

    const row = result.data[0];
    const headers = result.headers;
    const settingsStr = row[headers.indexOf("settings")];
    const contextStr = row[headers.indexOf("context")];

    let settings = {};
    try {
      settings = typeof settingsStr === "string" ? JSON.parse(settingsStr) : (settingsStr || {});
    } catch (e) {
      Logger.log("Error parsing settings: " + e.message);
    }

    // 2. Update status to 'processing'
    settings.enrichmentStatus = "processing";
    const updates = {
      settings: JSON.stringify(settings),
      updatedOn: new Date().toLocaleString()
    };
    setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, updates);

    // 3. Dispatch to Serverless
    const payload = {
      campaignId,
      fileUrl: settings.fileUrl || "",
      settings: settings,
      context: contextStr ? (typeof contextStr === "string" ? JSON.parse(contextStr) : contextStr) : {}
    };

    const EXTERNAL_API = CONFIG.EXTERNAL_API + "/api/enrich-campaign";
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(EXTERNAL_API, options);
    const apiResult = JSON.parse(response.getContentText());

    return {
      success: apiResult.success || false,
      message: apiResult.message || "Lead enrichment initiated",
      data: apiResult
    };

  } catch (error) {
    Logger.log("Error in enrichCampaignLeads: " + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * AI Personalize a campaign's email templates
 * @param {Object} params - Campaign parameters
 */
function personalizeCampaignEmails(params) {
  try {
    const { campaignId } = params;
    if (!campaignId) {
      return { success: false, error: "campaignId is required" };
    }

    // 1. Fetch campaign row
    const result = getRowsByColumn("campaigns", "campaignId", campaignId);
    if (!result.success || result.count === 0) {
      return { success: false, error: "Campaign not found" };
    }

    const row = result.data[0];
    const headers = result.headers;
    const settingsStr = row[headers.indexOf("settings")];
    const contextStr = row[headers.indexOf("context")];

    let settings = {};
    try {
      settings = typeof settingsStr === "string" ? JSON.parse(settingsStr) : (settingsStr || {});
    } catch (e) {
      Logger.log("Error parsing settings: " + e.message);
    }

    // 2. Update status to 'processing'
    settings.personalizationStatus = "processing";
    const updates = {
      settings: JSON.stringify(settings),
      updatedOn: new Date().toLocaleString()
    };
    setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, updates);

    // 3. Dispatch to Serverless
    const payload = {
      campaignId,
      fileUrl: settings.fileUrl || "",
      settings: settings,
      context: contextStr ? (typeof contextStr === "string" ? JSON.parse(contextStr) : contextStr) : {}
    };

    const EXTERNAL_API = CONFIG.EXTERNAL_API + "/api/personalize-campaign";
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(EXTERNAL_API, options);
    const apiResult = JSON.parse(response.getContentText());

    return {
      success: apiResult.success || false,
      message: apiResult.message || "AI personalization initiated",
      data: apiResult
    };

  } catch (error) {
    Logger.log("Error in personalizeCampaignEmails: " + error.message);
    return { success: false, error: error.message };
  }
}


