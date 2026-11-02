function oneMinuteRunner() {
  checkTransactionStatus();
  //alertUsers();
}

function fiveMinutesRunner() {
  updateExpiredProjectLinks();
  updateExpiredRedirectLinks();
  cleanupFailedRowsAppScript();
  scanAndMarkStaleRowsAppScript();
  checkAndResumeRestingCampaigns();
  //alertUsers();
}

/**
 * Checks for resting campaigns whose restUntil timestamp has expired and auto-resumes them.
 */
function checkAndResumeRestingCampaigns() {
  try {
    const campaignsRes = getAllRows("campaigns");
    if (!campaignsRes.success || !campaignsRes.data) return;
    const h = campaignsRes.headers;
    const idIdx = h.indexOf("campaignId");
    const statusIdx = h.indexOf("status");
    const settingsIdx = h.indexOf("settings");
    const createdOnIdx = h.indexOf("createdOn");
    if (idIdx === -1 || statusIdx === -1 || settingsIdx === -1) return;

    const now = Date.now();
    campaignsRes.data.forEach(function(row) {
      const status = String(row[statusIdx] || "").trim().toLowerCase();
      if (!status || status === "completed" || status === "draft" || status === "failed") return;

      let settings = {};
      try {
        const raw = row[settingsIdx];
        settings = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
      } catch (e) { return; }

      const campaignId = row[idIdx];

      // Expiration check: if campaign duration window has elapsed on ANY active/paused/resting row, complete it
      if (createdOnIdx !== -1 && row[createdOnIdx]) {
        const durationDays = Number(settings.durationDays) || 7;
        const createdOnTime = new Date(row[createdOnIdx]).getTime();
        const maxDurationMs = durationDays * 24 * 60 * 60 * 1000;
        if (now - createdOnTime >= maxDurationMs) {
          Logger.log("[checkAndResumeRestingCampaigns] Campaign " + campaignId + " reached duration limit (" + durationDays + "d) — completing");
          setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, {
            status: "completed",
            updatedOn: new Date().toISOString()
          });
          return;
        }
      }

      if (status !== "resting" && status !== "limit reached") return;

      if (settings.restUntil && now >= Number(settings.restUntil)) {
        const campaignId = row[idIdx];
        Logger.log("[checkAndResumeRestingCampaigns] Auto-resuming resting campaign " + campaignId);
        delete settings.restUntil;
        setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, {
          settings: JSON.stringify(settings),
          status: "paused"
        });
        resumeCampaign({ campaignId: campaignId });
      }
    });
  } catch (err) {
    Logger.log("[checkAndResumeRestingCampaigns] Error: " + err.message);
  }
}

function tenMinutesRunner() {
  contentPostingOrchestrator();
}

function fifteenMinutesRunner() {
  
}

function thirtyMinutesRunner() {
  
}

function oneHourRunner() {
  autoVerifyStaleSessions();
}

function sixHoursRunner() {
  
}