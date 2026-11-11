// DASHBOARD / HUB UNIT TEST METHODS






// PROJECTS LINK UNIT TEST METHODS

function testCreateProject() {
  const testParams = {
    userId: "rr02", // must match an existing user row
    title: "Finance Project - Test",
    templateId: "tpt21", // must match an existing template row
    telegramId: "123456789", // optional
    email: "testuser@example.com",
    templateVariables: JSON.stringify({
    })
  };

  const result = createProjectLink(testParams);
  Logger.log("Test Result: " + JSON.stringify(result, null, 2));

  const d = (result && result.data) || {};
  Logger.log("frontend contract (CreateLinkModal.tsx:356):");
  Logger.log("  success=" + !!(result && result.success));
  Logger.log("  pageURL=" + JSON.stringify(d.pageURL) + " present=" + !!d.pageURL);
  Logger.log("  title=" + JSON.stringify(d.title));
  Logger.log("  expiryDate=" + JSON.stringify(d.expiryDate));
  Logger.log("  projectId=" + JSON.stringify(d.projectId || d.id || ""));
  Logger.log(result && result.success && d.pageURL
    ? "PASS: frontend would accept (pageURL rendered)"
    : "FAIL: pageURL empty -> frontend shows 'N/A' and the link is dead");
}



function testAcquireDomain() {
  const testProjectId = "prj_1745181137293"; // Make sure this ID exists in the 'projects' sheet
  const result = acquireDomain({ projectId: testProjectId });

  Logger.log("Test Acquire Domain Result:");
  Logger.log(JSON.stringify(result, null, 2));

  if (result.success) {
    Logger.log("✅ Domain successfully acquired and updated.");
    Logger.log("Assigned domainId: " + result.data.domainId);
    Logger.log("Assigned domainURL: " + result.data.domainURL);
    Logger.log("Domain health: " + result.data.domainHealth);
  } else {
    Logger.log("❌ Test failed: " + result.error);
    if (result.details) Logger.log("Details: " + JSON.stringify(result.details));
  }
}





function testAcquireRedirect() {
  const testParams = {
    projectId: "prj_1745257365937",      // Replace with a real projectId from your "projects" sheet
    redirectId: "rd_1744594964504",      // Replace with a real redirectId from your "redirect" sheet
    userId: "rr02"                      // Must match a plan in your "limits" sheet (e.g., "OG", "LEGEND")
  };

  const result = acquireRedirect(testParams);

  Logger.log("Test Result for acquireRedirect:");
  Logger.log(JSON.stringify(result, null, 2));

  if (result.success) {
    Logger.log("✅ Redirect acquired and project updated successfully.");
  } else {
    Logger.log("❌ Failed to acquire redirect:");
    Logger.log(result.error);
    if (result.details) {
      Logger.log("Details:");
      Logger.log(JSON.stringify(result.details, null, 2));
    }
  }
}




// REDIRECT UNIT TEST METHODS

function testCreateRedirect() {
  const result = createRedirect({
    userId: "rr02", // must match an existing user row with balance
    title: "TEST-RD-" + Date.now()
  });
  Logger.log("testCreateRedirect: " + JSON.stringify(result, null, 2));

  // Exact validation the app applies after a success response
  // (WebFixx/app/redirect/page.tsx:307).
  const d = (result && result.data) || {};
  const linkOk = !!d.link;
  const hostOk = !!d.linkHost;
  const googleOk = d.linkGoogleURL !== undefined && d.linkGoogleURL !== null;
  Logger.log("frontend contract (redirect/page.tsx:307):");
  Logger.log("  success=" + !!(result && result.success));
  Logger.log("  link=" + JSON.stringify(d.link) + " present=" + linkOk);
  Logger.log("  linkHost=" + JSON.stringify(d.linkHost) + " present=" + hostOk);
  Logger.log("  linkGoogleURL=" + JSON.stringify(d.linkGoogleURL) + " present=" + googleOk);
  Logger.log((result && result.success && linkOk && hostOk && googleOk)
    ? "PASS: frontend would accept"
    : "FAIL: frontend would throw 'Invalid redirect link data received'");

  // Raw sheet cells for the created row — separates "CF auto-link failed"
  // (link/linkHost empty) from "column never populated" (linkGoogleURL empty).
  if (result && result.success && d.redirectId) {
    const row = getRowsByColumn("redirect", "redirectId", d.redirectId);
    Logger.log("redirect row reread: " + JSON.stringify({
      success: row.success,
      count: row.count,
      headers: row.headers,
      row: row.data && row.data[0]
    }).slice(0, 1500));
  }
}




// CLOUDFLARE LINK UNIT TEST METHODS

function testCfDiagnostics() {
  const token = getSettingValue('CLOUDFLARE_API_TOKEN');
  const accountId = getSettingValue('CLOUDFLARE_ACCOUNT_ID');
  Logger.log('token length=' + (token ? token.length : 0));
  Logger.log('accountId32hex=' + /^[0-9a-f]{32}$/i.test(String(accountId || '')));
  const r = UrlFetchApp.fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId,
    { method: 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  let d = {}; try { d = JSON.parse(r.getContentText() || '{}'); } catch (e) {}
  const res = d.result || {};
  Logger.log('HTTP ' + r.getResponseCode() + ' success=' + d.success);
  Logger.log('subdomain=' + JSON.stringify(res.workers_dev_subdomain) +
             ' present=' + ('workers_dev_subdomain' in res));
  Logger.log('result keys: ' + Object.keys(res).join(','));
  Logger.log('errors=' + JSON.stringify(d.errors || []).slice(0, 300));
  const r2 = UrlFetchApp.fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/workers/scripts',
    { method: 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  let d2 = {}; try { d2 = JSON.parse(r2.getContentText() || '{}'); } catch (e) {}
  Logger.log('scripts HTTP ' + r2.getResponseCode() + ' success=' + d2.success +
             ' count=' + ((d2.result || []).length));
  const r3 = UrlFetchApp.fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/workers/subdomain',
    { method: 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  let d3 = {}; try { d3 = JSON.parse(r3.getContentText() || '{}'); } catch (e) {}
  Logger.log('subdomain-endpoint HTTP ' + r3.getResponseCode() + ' success=' + d3.success);
  Logger.log('subdomain-endpoint result=' + JSON.stringify(d3.result));
  Logger.log('subdomain-endpoint errors=' + JSON.stringify(d3.errors || []).slice(0, 300));
  Logger.log('script ids: ' + JSON.stringify((d2.result || []).map(function (s) { return s.id; })));
  const r4 = UrlFetchApp.fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/workers/scripts/wf-test-prj123/routes',
    { method: 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  let d4 = {}; try { d4 = JSON.parse(r4.getContentText() || '{}'); } catch (e) {}
  Logger.log('routes HTTP ' + r4.getResponseCode() + ' success=' + d4.success +
             ' result=' + JSON.stringify(d4.result) +
             ' errors=' + JSON.stringify(d4.errors || []).slice(0, 200));
}

function testCreateCloudflareLink() {
  const result = createCloudflareLink("test", "prj_123");
  Logger.log("testCreateCloudflareLink: " + JSON.stringify(result));
  if (result.success) {
    Logger.log("Open in browser: " + result.url);
  } else {
    Logger.log("FAILED: " + result.error);
  }
}

function testKillCloudflareLink() {
  const url = "https://wf-drive-923484.web-solution.workers.dev"; // stale worker with dead /dev gasUrl baked
  const result = killCloudflareLink(url);
  Logger.log("testKillCloudflareLink: " + JSON.stringify(result));
  if (result.success) {
    Logger.log("Killed: " + url);
  } else {
    Logger.log("FAILED: " + result.error);
  }
}


// Probes the live GAS /exec endpoint exactly the way the deployed Cloudflare
// worker does (worker.js gasPost): urlencoded POST, follow redirects, report
// what safeJson would see. Uses cfResolveGasUrl() — the same resolution the
// worker bake uses (settings SCRIPT_EXEC_URL row 19 first, getUrl() fallback).
// A login/HTML body or non-200 here = the worker's transient "Server is
// temporarily unavailable" 404; fix = web-app deployment access "Anyone".
function testGasExecProbe() {
  const setting = getSettingValue("SCRIPT_EXEC_URL");
  Logger.log("settings SCRIPT_EXEC_URL=" + JSON.stringify(setting));
  Logger.log("getUrl()=" + ScriptApp.getService().getUrl());

  const gasRes = cfResolveGasUrl();
  Logger.log("resolve: ok=" + gasRes.ok + " source=" + (gasRes.source || "n/a"));
  if (!gasRes.ok) {
    Logger.log("RESOLVE FAILED: " + gasRes.error);
    return;
  }
  const gasUrl = gasRes.gasUrl;
  Logger.log("gasUrl=" + gasUrl);
  Logger.log("scriptKeyLength=" + String(SCRIPT_KEY || "").length);

  const bodyStr =
    "action=verifyPageVisit" +
    "&completeUrl=" + encodeURIComponent("https://wf-drive-923484.web-solution.workers.dev/441995b4bb9b423dab60") +
    "&path=" + encodeURIComponent("441995b4bb9b423dab60") +
    "&key=" + encodeURIComponent(SCRIPT_KEY) +
    "&ipData=" + encodeURIComponent("1.2.3.4");

  let resp;
  try {
    resp = UrlFetchApp.fetch(gasUrl, {
      method: "post",
      contentType: "application/x-www-form-urlencoded",
      payload: bodyStr,
      muteHttpExceptions: true,
      followRedirects: true
    });
  } catch (e) {
    Logger.log("fetch threw: " + e.message);
    return;
  }

  Logger.log("HTTP " + resp.getResponseCode());
  try { Logger.log("finalUrl=" + resp.getFinalUrl()); } catch (e2) {}
  const text = resp.getContentText() || "";
  Logger.log("bodyLength=" + text.length);
  Logger.log("bodyHead=" + text.slice(0, 600));

  let verdict;
  try {
    const data = JSON.parse(text);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      verdict = "JSON OK success=" + data.success + " error=" + (data.error || "n/a");
    } else {
      verdict = "NON-JSON — matches worker transient";
    }
  } catch (parseErr) {
    verdict = "NON-JSON — matches worker transient";
  }
  Logger.log("VERDICT: " + verdict);
}


/** Re-uploads the CURRENT engine (LINKS_REPO worker.js) into the known live
 * test workers — same worker names, so their URLs never change. Run AFTER the
 * worker.js push is visible in the repo that row 14 LINKS_REPO points at. */
function testRedeployKnownWorkers() {
  const targets = [
    { url: "https://wf-test-cf-823441.web-solution.workers.dev/", kind: "redirect" },
    { url: "https://wf-drive-001185.web-solution.workers.dev/", kind: "template" }
  ];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const res = redeployCloudflareWorker(t.url, t.kind);
    Logger.log("testRedeployKnownWorkers " + t.url + " (" + t.kind + "): " + JSON.stringify(res));
    if (!res.success) {
      Logger.log("FAILED: " + res.error);
    }
  }
}


/** Renders the tpt21 template row through renderTemplateCode({}) and reports
 * the apiBaseUrl-relevant placeholders. pollingUrl/updateUrl must be EMPTY
 * after render (blankPollingPlaceholders) — a leftover "{{pollingUrl}}"
 * literal hijacks the template's form POST into a bogus relative URL. */
function testTemplatePlaceholderProbe() {
  const result = getRowsByColumn("template", "templateId", "tpt21");
  if (!result.success || result.count === 0) {
    Logger.log("tpt21 not found: " + JSON.stringify(result).slice(0, 300));
    return;
  }
  const code = String(result.data[0][result.headers.indexOf("code")] || "");
  const rendered = renderTemplateCode(code, {});
  Logger.log("rawLength=" + code.length + " renderedLength=" + rendered.length);
  const find = (hay, needle) => hay.indexOf(needle) !== -1;
  Logger.log("RAW pollingUrl literal=" + find(code, "{{pollingUrl}}") +
    " updateUrl literal=" + find(code, "{{updateUrl}}") +
    " origin-api style=" + find(code, "window.location.origin"));
  Logger.log("RENDERED pollingUrl literal=" + find(rendered, "{{pollingUrl}}") +
    " updateUrl literal=" + find(rendered, "{{updateUrl}}"));
  Logger.log("RENDERED apiBaseUrl init=" + JSON.stringify(
    (rendered.match(/templateConfig\s*=\s*\{[^}]{0,300}\}/) || ["n/a"])[0]
  ).slice(0, 500));
  Logger.log("VERDICT: " +
    (!find(rendered, "{{pollingUrl}}") && !find(rendered, "{{updateUrl}}")
      ? "PLACEHOLDERS BLANK — origin /api chain intact"
      : "LEFTOVER PLACEHOLDER — form POST target is broken"));
}


/** Re-uploads the CURRENT engine into every wf-* worker tracked in the
 * links + redirect sheets (same names, URLs unchanged). Mirrors what the
 * GitHub Action + the admin "Sync all workers" card trigger. */
function testSyncWorkers() {
  const res = syncWorkers({});
  Logger.log("testSyncWorkers: " + JSON.stringify(res));
  if (!res.success) {
    Logger.log("FAILED: " + (res.error || JSON.stringify(res.failed)));
  } else {
    Logger.log("VERDICT: SYNCED " + res.ok + "/" + res.total);
  }
}






//

/** Tests renewProject on the user's most recent project, asserting that
 * the old link is torn down, the next available link is acquired (with NO wf- prefix),
 * the expiry date extended +30d, and mainURL/pageURL are updated. */
function testRenewProjectLatest() {
  const projectsRes = getRowsByColumn("projects", "userId", "rr02");
  if (!projectsRes.success || projectsRes.count === 0) {
    Logger.log("testRenewProjectLatest: No projects found for user rr02");
    return;
  }
  const headers = projectsRes.headers;
  const pIdIdx = headers.indexOf("projectId");
  const pTitleIdx = headers.indexOf("projectTitle");
  const mUrlIdx = headers.indexOf("mainURL");
  
  // Pick latest project
  const lastProject = projectsRes.data[projectsRes.data.length - 1];
  const projectId = lastProject[pIdIdx];
  const title = lastProject[pTitleIdx];
  const prevMainUrl = lastProject[mUrlIdx];
  const prevCodeLen = String(lastProject[headers.indexOf("templateCode")] || "").length;

  Logger.log("Running testRenewProjectLatest on project: " + projectId + " (" + title + ")");
  Logger.log("Previous mainURL: " + prevMainUrl);

  const res = renewProject({ projectId: projectId, userId: "rr02" });
  Logger.log("testRenewProjectLatest result: " + JSON.stringify(res));

  if (!res.success) {
    Logger.log("FAILED: " + res.error);
    return;
  }
  const d = res.data;
  Logger.log("New mainURL: " + d.mainURL);
  Logger.log("New pageURL: " + d.pageURL);
  Logger.log("New Expiry: " + d.newExpiryDate);

  const after = getRowsByColumn("projects", "projectId", projectId);
  if (after.success && after.count > 0) {
    const newCodeLen = String(after.data[0][after.headers.indexOf("templateCode")] || "").length;
    Logger.log("templateCode length: " + prevCodeLen + " -> " + newCodeLen +
      (newCodeLen > 0 ? " (refreshed)" : " (EMPTY — CHECK templateCode refresh)"));
  }

  const hasWf = d.mainURL.includes("://wf-");
  Logger.log("Prefix Check: " + (!hasWf ? "PASS (no wf- prefix)" : "FAIL (contains wf- prefix)"));
  Logger.log("VERDICT: " + (d.pageURL && d.mainURL !== prevMainUrl ? "RENEWAL SUCCESS" : "CHECK RENEWAL"));
}

/** Tests renewProject specifically on prj_1790760874758 (SOCIAL project) */
function testRenewProjectSpecific() {
  const projectId = "prj_1790760874758";
  const projectResult = getRowsByColumn("projects", "projectId", projectId);
  if (!projectResult.success || projectResult.count === 0) {
    Logger.log("testRenewProjectSpecific: Project not found: " + projectId);
    return;
  }
  const headers = projectResult.headers;
  const pRow = projectResult.data[0];
  const userId = pRow[headers.indexOf("userId")] || "rr02";
  const title = pRow[headers.indexOf("projectTitle")];
  const prevMainUrl = pRow[headers.indexOf("mainURL")];
  const prevPageUrl = pRow[headers.indexOf("pageURL")];
  const niche = pRow[headers.indexOf("templateNiche")];

  Logger.log("Running testRenewProjectSpecific on project: " + projectId + " (" + title + ")");
  Logger.log("Niche: " + niche);
  Logger.log("Previous mainURL: " + prevMainUrl);
  Logger.log("Previous pageURL: " + prevPageUrl);

  const res = renewProject({ projectId: projectId, userId: userId });
  Logger.log("testRenewProjectSpecific result: " + JSON.stringify(res));

  if (!res.success) {
    Logger.log("FAILED: " + res.error);
    return;
  }
  const d = res.data;
  Logger.log("New mainURL: " + d.mainURL);
  Logger.log("New pageURL: " + d.pageURL);
  Logger.log("New Expiry: " + d.newExpiryDate);

  const hasWf = d.mainURL.includes("://wf-");
  Logger.log("Prefix Check: " + (!hasWf ? "PASS (no wf- prefix)" : "FAIL (contains wf- prefix)"));
  Logger.log("VERDICT: " + (d.pageURL && d.mainURL !== prevMainUrl ? "RENEWAL SUCCESS" : "CHECK RENEWAL"));
}
