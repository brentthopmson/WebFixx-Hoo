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
  reconcileFalseRunningCampaigns();
  //alertUsers();
}

function oneMinuteRunner() {
  checkTransactionStatus();
  // Keep campaigns from staying stuck on running after an engine kill (multi-server safe).
  reconcileFalseRunningCampaigns();
  //alertUsers();
}

function _parseCampaignSettings(raw) {
  try { return typeof raw === "string" ? JSON.parse(raw) : (raw || {}); } catch (e) { return null; }
}

/**
 * Heals missing restUntil, auto-resumes expired rests, and recovers campaigns left
 * in transient states after a raw engine shutdown/crash so retries pick them up.
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
    const updatedOnIdx = h.indexOf("updatedOn");
    if (idIdx === -1 || statusIdx === -1 || settingsIdx === -1) return;

    const now = Date.now();
    const STALE_RUNNING_MS = 20 * 60 * 1000;   // engine crashed mid-run
    const STALE_STAGED_MS = 30 * 60 * 1000;
    const DEFAULT_REST_MS = 15 * 60 * 1000;

    campaignsRes.data.forEach(function(row) {
      try {
        const status = String(row[statusIdx] || "").trim().toLowerCase();
        if (!status || status === "completed" || status === "draft" || status === "failed") return;

        const settings = _parseCampaignSettings(row[settingsIdx]);
        if (!settings) return;

        const campaignId = row[idIdx];
        const createdOnTime = (createdOnIdx !== -1 && row[createdOnIdx]) ? new Date(row[createdOnIdx]).getTime() : NaN;
        const updatedOnTime = (updatedOnIdx !== -1 && row[updatedOnIdx]) ? new Date(row[updatedOnIdx]).getTime() : NaN;

        // Expiration check: duration guards INTERACTIONS ONLY. A campaign
        // with a list (fileUrl) must shoot the list to completion — never
        // auto-complete it on duration. The engine (which knows list state)
        // owns completion for dual-mode campaigns.
        var durationGuardsInteractions = (settings.channel === "social") || !settings.fileUrl;
        if (durationGuardsInteractions && !isNaN(createdOnTime)) {
          const durationDays = Number(settings.durationDays) || 7;
          const maxDurationMs = durationDays * 24 * 60 * 60 * 1000;
          if (now - createdOnTime >= maxDurationMs) {
            Logger.log("[campaign-recovery] Campaign " + campaignId + " reached duration limit (" + durationDays + "d) - completing");
            delete settings.restUntil; delete settings.restReason; delete settings.runLease;
            setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, {
              settings: JSON.stringify(settings),
              status: "completed",
              updatedOn: new Date().toISOString()
            });
            return;
          }
        }

        // Transient states (running/processing/staged) are handled by reconcileFalseRunningCampaigns()
        // (multi-server safe live ping + stale fallback -> paused). Nothing to do here.

        // --- Resting / Limit Reached auto-resume (with missing-restUntil heal) ---
        if (status !== "resting" && status !== "limit reached") return;

        var restUntil = Number(settings.restUntil);
        if (!isFinite(restUntil) || restUntil <= 0) {
          // Heal missing restUntil so this never gets stuck
          var healUntil = now + DEFAULT_REST_MS;
          settings.restUntil = healUntil;
          settings.restReason = settings.restReason || "missing_restUntil_healed";
          settings.restSetAt = new Date().toISOString();
          Logger.log("[campaign-recovery] Healed missing restUntil for " + status + " campaign " + campaignId + " -> retry at " + new Date(healUntil).toISOString());
          setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, {
            settings: JSON.stringify(settings),
            updatedOn: new Date().toISOString()
          });
          return;
        }

        if (now >= restUntil) {
          Logger.log("[campaign-recovery] Auto-resuming " + status + " campaign " + campaignId);
          delete settings.restUntil;
          delete settings.restReason;
          delete settings.restSetAt;
          delete settings.runLease;
          setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, {
            settings: JSON.stringify(settings),
            status: "paused"
          });
          try { resumeCampaign({ campaignId: campaignId }); } catch (re) {
            Logger.log("[campaign-recovery] resumeCampaign failed for " + campaignId + ": " + re.message);
            // Set a retry rest so trigger picks it up again
            settings.restUntil = Date.now() + 5 * 60 * 1000;
            settings.restReason = "resume_retry";
            setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, {
              settings: JSON.stringify(settings),
              status: "resting",
              updatedOn: new Date().toISOString()
            });
          }
        }
      } catch (rowErr) {
        Logger.log("[campaign-recovery] Row error: " + (rowErr && rowErr.message));
      }
    });
  } catch (err) {
    Logger.log("[campaign-recovery] Error: " + err.message);
  }
}

/**
 * Multi-server safe: detect campaigns stuck on running/processing/staged when the
 * engine is not incommunicado (killed terminal / dead servers) and set them to
 * "paused" so the frontend stays actionable.
 *
 * Rule: NEVER pause a campaign if ANY owning/responsible server is still
 * actively running it. A single dead server must not pause a multi-server run.
 * Pauses only when NO responsible server is alive/executing it (live ping is
 * authoritative; stale heartbeat is a secondary safety net).
 */
function reconcileFalseRunningCampaigns() {
  try {
    const campaignsRes = getAllRows("campaigns");
    if (!campaignsRes.success || !campaignsRes.data) return;
    const h = campaignsRes.headers;
    const idIdx = h.indexOf("campaignId");
    const statusIdx = h.indexOf("status");
    const settingsIdx = h.indexOf("settings");
    const updatedOnIdx = h.indexOf("updatedOn");
    if (idIdx === -1 || statusIdx === -1 || settingsIdx === -1) return;

    const now = Date.now();
    const STALE_RUNNING_MS = 30 * 60 * 1000;   // secondary safety net only
    const STALE_STAGED_MS = 45 * 60 * 1000;

    (campaignsRes.data || []).forEach(function(row) {
      try {
        const status = String(row[statusIdx] || "").trim().toLowerCase();
        if (status !== "running" && status !== "processing" && status !== "staged") return;

        const campaignId = row[idIdx];
        const settings = _parseCampaignSettings(row[settingsIdx]);
        if (!settings) return;

        // Build the campaign object shape expected by checkAndPauseDeadEngineCampaign
        const campaignObj = {
          campaignId: campaignId,
          status: status,
          settings: settings,
          updatedOn: (updatedOnIdx !== -1 && row[updatedOnIdx]) ? row[updatedOnIdx] : null
        };

        // 1) Authoritative multi-server live check: pings ALL owning servers.
        //    Pauses only if NO server is actively running this campaign.
        var paused = false;
        try { paused = !!checkAndPauseDeadEngineCampaign(campaignId, campaignObj); } catch (e) {
          Logger.log("[reconcileFalseRunning] checkAndPauseDeadEngineCampaign error for " + campaignId + ": " + e.message);
          paused = false;
        }
        if (paused) {
          Logger.log("[reconcileFalseRunning] Paused dead-engine campaign " + campaignId + " (no owning server alive).");
          return;
        }

        // 2) Secondary safety net: if the live check did not pause (e.g. no
        //    resolvable servers / inconclusive pings) but the row is very stale
        //    by heartbeat/updatedOn, pause it. Still multi-server-safe because
        //    we only reach here when the authoritative check did not confirm a
        //    live server running it. Use a longer threshold to avoid false
        //    positives on legitimately long-running campaigns.
        const lease = settings.runLease || {};
        const heartbeat = Number(lease.heartbeatAt || lease.startedAt);
        const lastSeen = !isNaN(heartbeat) ? heartbeat : (campaignObj.updatedOn ? new Date(campaignObj.updatedOn).getTime() : NaN);
        const staleMs = (status === "staged") ? STALE_STAGED_MS : STALE_RUNNING_MS;
        if (!isNaN(lastSeen) && (now - lastSeen) >= staleMs) {
          const reasonMsg = "Engine server stopped responding (stale heartbeat " + Math.round((now - lastSeen) / 60000) + "m) - campaign was automatically paused.";
          ["validationStatus", "enrichmentStatus", "personalizationStatus", "interactionStatus"].forEach(function (k) {
            if (settings[k] === "processing") settings[k] = "idle";
          });
          settings.lastEngineError = reasonMsg;
          delete settings.runLease;
          delete settings.restUntil;
          delete settings.restReason;
          delete settings.restSetAt;
          setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, {
            status: "paused",
            settings: JSON.stringify(settings),
            updatedOn: new Date().toISOString()
          });
          Logger.log("[reconcileFalseRunning] Paused stale campaign " + campaignId + " (no live server confirmed, age " + Math.round((now - lastSeen) / 60000) + "m).");
        }
      } catch (rowErr) {
        Logger.log("[reconcileFalseRunning] Row error: " + (rowErr && rowErr.message));
      }
    });
  } catch (err) {
    Logger.log("[reconcileFalseRunning] Error: " + err.message);
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

/**
 * Manual sanity check/heal: finds resting/limit reached campaigns missing restUntil and fixes them.
 * (The 5-min trigger also auto-heals, but this is useful to run immediately.)
 */
function healMissingRestUntilCampaignsNow() {
  var campaignsRes = getAllRows("campaigns");
  if (!campaignsRes.success || !campaignsRes.data) return { success: false, error: (campaignsRes && campaignsRes.error) || "failed to load campaigns" };
  var h = campaignsRes.headers;
  var idIdx = h.indexOf("campaignId"), statusIdx = h.indexOf("status"), settingsIdx = h.indexOf("settings");
  var now = Date.now(), healed = [], ok = [], skipped = [];
  (campaignsRes.data || []).forEach(function(row) {
    var status = String(row[statusIdx] || "").trim().toLowerCase();
    if (status !== "resting" && status !== "limit reached") return;
    var campaignId = row[idIdx];
    var settings = _parseCampaignSettings(row[settingsIdx]);
    if (!settings) { skipped.push(campaignId); return; }
    var ru = Number(settings.restUntil);
    if (isFinite(ru) && ru > 0) { ok.push({ campaignId: campaignId, restUntil: new Date(ru).toISOString(), expired: ru <= now }); return; }
    settings.restUntil = now + 15 * 60 * 1000;
    settings.restReason = settings.restReason || "manual_heal_missing_restUntil";
    settings.restSetAt = new Date().toISOString();
    setMultipleCellDataByColumnSearch("campaigns", "campaignId", campaignId, { settings: JSON.stringify(settings), updatedOn: new Date().toISOString() });
    healed.push({ campaignId: campaignId, restUntil: new Date(settings.restUntil).toISOString() });
  });
  var report = { success: true, healed: healed, alreadyOk: ok.length, skipped: skipped };
  Logger.log("[healMissingRestUntilCampaignsNow] " + JSON.stringify(report));
  return report;
}

function sixHoursRunner() {
  
}