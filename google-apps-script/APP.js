const API_URL = "https://webfixx-hoo-oamupo-e98ced-157-173-204-24.sslip.io/api";

// HUB

//SAVE MEMO

// VERIFY LOGIN

// EXTRACT

// SHOOT






// EMAIL CAMPAIGN


// PROJECT LINKS

function verifyTelegramNotification(params) {
  try {
    const { telegramId, userId } = params;

    if (!telegramId) {
      return {
        success: false,
        error: "telegramId is required"
      };
    }

    // Fetch user by userId
    const userResult = getRowsByColumn("user", "userId", userId);
    if (!userResult.success || userResult.count === 0) {
      return {
        success: false,
        error: "User not found",
        details: userResult
      };
    }

    const userRow = userResult.data[0];
    const headers = userResult.headers;
    const userMap = {};
    headers.forEach((header, i) => {
      userMap[header] = userRow[i];
    });

    const username = userMap.username || "there";

    // Create Telegram message
    const formattedMessage = `👋 Hey *${username}*, this is a quick test to make sure Telegram messages can reach you.`;

    const textPayload = {
      method: "sendMessage",
      chat_id: telegramId,
      text: formattedMessage,
      parse_mode: "Markdown"
    };

    const token = getSettingValue("webFixxTelegramBot");
    const messageId = sendMediaAndMessageToTelegram(textPayload, null, token);

    if (!messageId) {
      return {
        success: false,
        error: "Message could not be delivered to the Telegram ID"
      };
    }

    return {
      success: true,
      messageId: messageId,
      message: "Test message sent successfully"
    };

  } catch (error) {
    Logger.log("Error in verifyTelegramNotification: " + error.toString());
    return {
      success: false,
      error: "Server error: " + error.toString(),
      details: {
        errorMessage: error.message,
        errorStack: error.stack
      }
    };
  }
}

// CLOUDFLARE AUTO-LINK
// Deploy a per-link Cloudflare Worker (forwarder to this app's backend) directly
// via the Cloudflare Workers Scripts API — no Flask hop. Credentials come from the
// Link engine: fetches worker.js from the WebFixx-Links GitHub repo, injects
// secrets from settings sheet rows 12-18 (CLOUDFLARE_API_TOKEN /
// CLOUDFLARE_ACCOUNT_ID / LINKS_REPO / GITHUB_TOKEN / IPHUB_API_KEY /
// ABUSEIPDB_API_KEY / TURNSTILE_SECRET, values in settingsValue1), and uploads
// one Cloudflare Worker per link. Used only when no manual/formula link exists.
// Rows 12-15 are required; rows 16-18 are optional — a blank value deploys the
// Worker with that protection off (no IPHUB/AbuseIPDB checks, no Turnstile gate).

/** Cached per-editor-session so repeat creates skip the account lookup. */
let CF_WORKERS_DEV_SUBDOMAIN = '';

function cfGetWorkersDevSubdomain(accountId, token) {
  if (CF_WORKERS_DEV_SUBDOMAIN) return CF_WORKERS_DEV_SUBDOMAIN;
  const settingSub = getSettingValue('CLOUDFLARE_SUBDOMAIN');
  if (settingSub) {
    CF_WORKERS_DEV_SUBDOMAIN = settingSub;
    return settingSub;
  }
  try {
    const response = UrlFetchApp.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}`,
      {
        method: 'get',
        headers: { Authorization: `Bearer ${token}` },
        muteHttpExceptions: true
      }
    );
    const code = response.getResponseCode();
    const text = response.getContentText() || '{}';
    let data = {};
    try { data = JSON.parse(text); } catch (e) { data = {}; }
    if (code === 200 && data.success) {
      const subdomain = String((data.result && data.result.workers_dev_subdomain) || '').trim();
      if (subdomain) {
        CF_WORKERS_DEV_SUBDOMAIN = subdomain;
        return subdomain;
      }
    }
  } catch (e1) {
    Logger.log(`cfGetWorkersDevSubdomain: account fetch exception: ${e1.message}`);
  }

  // Newer account objects omit workers_dev_subdomain — the dedicated
  // /workers/subdomain endpoint is authoritative (returns {"subdomain":"..."}).
  try {
    const sub = UrlFetchApp.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
      {
        method: 'get',
        headers: { Authorization: `Bearer ${token}` },
        muteHttpExceptions: true
      }
    );
    const subText = sub.getContentText() || '{}';
    let subData = {};
    try { subData = JSON.parse(subText); } catch (e2) { subData = {}; }
    const found = (sub.getResponseCode() === 200 && subData.success)
      ? String((subData.result && subData.result.subdomain) || '').trim()
      : '';
    if (found) {
      CF_WORKERS_DEV_SUBDOMAIN = found;
      return found;
    }
    Logger.log(`cfGetWorkersDevSubdomain: endpoint returned HTTP ${sub.getResponseCode()} body=${subText.slice(0, 200)}`);
  } catch (e3) {
    Logger.log(`cfGetWorkersDevSubdomain: subdomain endpoint failed ${e3.message}`);
  }

  // Fallback to known account subdomain if Google Apps Script UrlFetchApp network hiccups
  const fallback = 'web-solution';
  Logger.log(`cfGetWorkersDevSubdomain: falling back to '${fallback}'`);
  CF_WORKERS_DEV_SUBDOMAIN = fallback;
  return fallback;
}

function cfSlugify(text, maxLen) {
  let slug = String(text || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
  slug = slug.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  return slug.slice(0, maxLen).replace(/-+$/, '');
}

// <slug(title)>-<6 chars of entity id> — e.g. chase-upgrade-x7k2m9 (no 'wf-' prefix).
function cfWorkerName(nameHint, entityId) {
  const slug = cfSlugify(nameHint, 36) || 'link';
  const entity = String(entityId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let suffix = entity.length >= 6 ? entity.slice(-6) : entity;
  if (!suffix) {
    suffix = String(Math.floor(Date.now() / 1000) % 1000000).padStart(6, '0');
  }
  let name = `${slug}-${suffix}`;
  if (name.length > 58) name = name.slice(0, 58).replace(/-+$/, '');
  return name;
}

/** Fetches the latest worker.js from the WebFixx-Links repo (base64 in the
 *  GitHub contents API response). Returns the source text or null. */
function cfFetchLinkWorkerSource(repoFullName, githubToken) {
  const response = UrlFetchApp.fetch(
    `https://api.github.com/repos/${repoFullName}/contents/worker.js`,
    {
      method: 'get',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28'
      },
      muteHttpExceptions: true
    }
  );
  const code = response.getResponseCode();
  const text = response.getContentText() || '{}';
  let data = {};
  try { data = JSON.parse(text); } catch (e) { data = {}; }
  if (code !== 200 || !data.content) {
    Logger.log(`cfFetchLinkWorkerSource ${repoFullName} failed status=${code} body=${text.slice(0, 300)}`);
    return null;
  }
  const base64 = String(data.content).replace(/\s/g, '');
  return Utilities.newBlob(Utilities.base64Decode(base64)).getDataAsString();
}

/** Replaces each "__TOKEN__" string literal in the worker source with the
 *  JSON-escaped secret value (quoted form replaced, so values with special
 *  characters cannot break the generated JavaScript). */
function cfConfigureWorkerSource(source, values) {
  const tokens = {
    __GAS_URL__: values.gasUrl,
    __SCRIPT_KEY__: values.scriptKey,
    __KIND__: values.kind,
    __IPHUB_KEY__: values.iphubKey,
    __ABUSEIPDB_KEY__: values.abuseKey,
    __TURNSTILE_SECRET__: values.turnstileSecret
  };
  let out = source;
  Object.keys(tokens).forEach(function (token) {
    const value = String(tokens[token] == null ? '' : tokens[token]);
    out = out.split('"' + token + '"').join(JSON.stringify(value));
  });
  const leftover = out.match(/"__(GAS_URL|SCRIPT_KEY|KIND|IPHUB_KEY|ABUSEIPDB_KEY|TURNSTILE_SECRET)__"/g);
  if (leftover) {
    Logger.log(`cfConfigureWorkerSource: unreplaced placeholders remain: ${leftover.join(', ')}`);
    return null;
  }
  return out;
}

/** Multipart body (metadata JSON + worker.js module) for the Workers Scripts upload. */
function cfBuildUploadBody(workerSource) {
  const boundary = `----WebFixx${Utilities.getUuid().replace(/-/g, '')}`;
  const lf = '\r\n';
  const metadata = JSON.stringify({
    main_module: 'worker.js',
    compatibility_date: '2026-10-01'
  });
  const payload =
    `--${boundary}` + lf +
    'Content-Disposition: form-data; name="metadata"' + lf +
    'Content-Type: application/json' + lf +
    lf + metadata + lf +
    `--${boundary}` + lf +
    'Content-Disposition: form-data; name="worker.js"; filename="worker.js"' + lf +
    'Content-Type: application/javascript+module' + lf +
    lf + workerSource + lf +
    `--${boundary}--` + lf;
  return { boundary, payload };
}

/** Enables the workers.dev route for a freshly uploaded script. Upload alone
 *  leaves the route disabled (API-created Workers default to off) — wrangler
 *  issues this POST after every deploy; it is known to flake, hence retries.
 *  Returns null on success, or 'HTTP {code}' after final failure. */
function cfEnableWorkersDev(accountId, token, workerName) {
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = UrlFetchApp.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`,
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          Authorization: `Bearer ${token}`,
          'Cloudflare-Workers-Script-Api-Date': '2025-08-01'
        },
        payload: JSON.stringify({ enabled: true, previews_enabled: false }),
        muteHttpExceptions: true
      }
    );
    const code = response.getResponseCode();
    const text = response.getContentText() || '{}';
    let data = {};
    try { data = JSON.parse(text); } catch (e) { data = {}; }
    if (code === 200 && data.success) {
      if (attempt > 1) Logger.log(`cfEnableWorkersDev ${workerName}: succeeded on attempt ${attempt}`);
      return null;
    }
    last = `HTTP ${code} ${text.slice(0, 200)}`;
    Logger.log(`cfEnableWorkersDev ${workerName}: attempt ${attempt} failed ${last}`);
    Utilities.sleep(1000 * attempt);
  }
  return last || 'unknown error';
}

// Resolves the /exec URL baked into Cloudflare workers.
// Priority: settings SCRIPT_EXEC_URL (row 19, settingsValue1) — explicit control;
// fallback: ScriptApp.getService().getUrl() only when row 19 is blank.
// Never returns a /dev URL: external anonymous POSTs to /dev get HTTP 401 +
// Google login HTML, which the worker's safeJson rejects -> transient 404.
function cfResolveGasUrl() {
  const setting = getSettingValue('SCRIPT_EXEC_URL');
  if (setting) {
    const valid = /^https:\/\/script\.google\.com\/macros\/s\//.test(setting) && setting.endsWith('/exec');
    if (!valid) {
      return { ok: false, error: 'settings SCRIPT_EXEC_URL (row 19) is not a /exec URL (got ' + setting + ') — paste the web-app /exec URL (Deploy > Manage deployments) into settings row 19' };
    }
    return { ok: true, gasUrl: setting, source: 'settings SCRIPT_EXEC_URL' };
  }
  const gasUrl = ScriptApp.getService().getUrl();
  if (!gasUrl) {
    return { ok: false, error: 'Deploy this script as a web app (Deploy > New deployment) or set settings SCRIPT_EXEC_URL (row 19) so the /exec URL can be injected into the Worker' };
  }
  if (!gasUrl.endsWith('/exec')) {
    return { ok: false, error: 'ScriptApp.getService().getUrl() is not /exec (got ' + gasUrl + '). Set settings SCRIPT_EXEC_URL (row 19) to the web-app /exec URL with access "Anyone" — do not use the /dev URL for external Workers' };
  }
  return { ok: true, gasUrl: gasUrl, source: 'ScriptApp.getService().getUrl()' };
}

/** Joins a link base with a path the way Flask's route table expects:
 *  - base ends with a static route prefix (…/page)  -> direct, no slash
 *    (/pageXYZ -> template flow with path XYZ)
 *  - base already ends with "/"                       -> direct
 *  - anything else (bare host)                        -> insert "/"
 *  Used for every pageURL build so project links stay correct regardless of
 *  whether the stored base carries the trailing slash. */
function buildPageUrl(base, path) {
  const b = String(base || "");
  const p = String(path || "");
  if (b.endsWith("/") || /\/(page|document|archive|director(y|ies))$/.test(b)) {
    return b + p;
  }
  return b + "/" + p;
}

function createCloudflareLink(nameHint, entityId, kind) {
  try {
    // Which link this Worker will serve: "template" (project pages) or
    // "redirect". Baked into CONFIG.kind; the Worker routes its bare
    // /<path> accordingly. Anything other than "redirect" = template.
    const workerKind = String(kind || '').trim() === 'redirect' ? 'redirect' : 'template';
    const token = getSettingValue('CLOUDFLARE_API_TOKEN');
    const accountId = getSettingValue('CLOUDFLARE_ACCOUNT_ID');
    const linksRepo = getSettingValue('LINKS_REPO');
    const githubToken = getSettingValue('GITHUB_TOKEN');
    const iphubKey = getSettingValue('IPHUB_API_KEY');
    const abuseKey = getSettingValue('ABUSEIPDB_API_KEY');
    const turnstileSecret = getSettingValue('TURNSTILE_SECRET');
    if (!token || !accountId || !linksRepo || !githubToken) {
      Logger.log('createCloudflareLink: missing settings (rows 12-15: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, LINKS_REPO, GITHUB_TOKEN)');
      return { success: false, error: 'Links engine is not configured (settings rows 12-15)' };
    }
    if (!String(entityId || '').trim()) {
      return { success: false, error: 'entityId is required' };
    }
    const gasRes = cfResolveGasUrl();
    if (!gasRes.ok) {
      return { success: false, error: gasRes.error };
    }
    const gasUrl = gasRes.gasUrl;
    Logger.log('createCloudflareLink: gasUrl from ' + gasRes.source + ' -> ' + gasUrl);
    const rawSource = cfFetchLinkWorkerSource(String(linksRepo).trim(), githubToken);
    if (!rawSource) {
      return { success: false, error: 'Could not fetch worker.js from LINKS_REPO (check repo name + GITHUB_TOKEN scope)' };
    }
    const workerSource = cfConfigureWorkerSource(rawSource, {
      gasUrl: gasUrl,
      scriptKey: SCRIPT_KEY,
      kind: workerKind,
      iphubKey: iphubKey,
      abuseKey: abuseKey,
      turnstileSecret: turnstileSecret
    });
    if (!workerSource) {
      return { success: false, error: 'Failed to inject secrets into worker.js' };
    }
    const workerName = cfWorkerName(nameHint, entityId);
    return cfPutWorker('createCloudflareLink', workerName, workerSource, accountId, token, workerKind);
  } catch (e) {
    Logger.log(`createCloudflareLink exception: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/** Uploads configured Worker source to an EXISTING script name (same name =
 * same workers.dev URL), enables the workers.dev route, and returns
 * { success, url, workerName } or { success: false, error }. */
function cfPutWorker(label, workerName, workerSource, accountId, token, kind) {
  const subdomain = cfGetWorkersDevSubdomain(accountId, token);
  if (!subdomain) {
    return { success: false, error: 'Could not resolve workers.dev subdomain (check CLOUDFLARE_ACCOUNT_ID / token permissions)' };
  }
  const { boundary, payload } = cfBuildUploadBody(workerSource);
  const response = UrlFetchApp.fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`,
    {
      method: 'put',
      contentType: `multipart/form-data; boundary=${boundary}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: payload,
      muteHttpExceptions: true
    }
  );
  const code = response.getResponseCode();
  const text = response.getContentText() || '{}';
  let data = {};
  try { data = JSON.parse(text); } catch (e) { data = {}; }
  if (code === 200 && data.success) {
    const enableErr = cfEnableWorkersDev(accountId, token, workerName);
    if (enableErr) {
      Logger.log(`${label} ${workerName}: uploaded but workers.dev route enable failed (${enableErr})`);
      return { success: false, error: `Worker uploaded but workers.dev route enable failed (${enableErr}) — re-run to retry` };
    }
    const url = `https://${workerName}.${subdomain}.workers.dev`;
    Logger.log(`${label} deployed ${workerName} -> ${url} (route enabled, kind=${kind})`);
    return { success: true, url: url, workerName: workerName };
  }
  Logger.log(`${label} ${workerName} failed status=${code} body=${text.slice(0, 300)}`);
  return { success: false, error: `Worker upload failed (HTTP ${code})` };
}

/** Re-uploads worker.js into an EXISTING wf-*.workers.dev worker. The worker
 * name is taken from the link URL, so the URL never changes and links/redirect
 * sheet rows stay valid. kind: "template" (project pages) or "redirect".
 * Run after upgrading the engine source in LINKS_REPO. */
function redeployCloudflareWorker(linkUrl, kind) {
  try {
    const workerKind = String(kind || '').trim() === 'redirect' ? 'redirect' : 'template';
    const workerName = cfWorkerNameFromUrl(linkUrl);
    if (!workerName) {
      return { success: false, error: 'Not a wf-*.workers.dev link' };
    }
    const token = getSettingValue('CLOUDFLARE_API_TOKEN');
    const accountId = getSettingValue('CLOUDFLARE_ACCOUNT_ID');
    const linksRepo = getSettingValue('LINKS_REPO');
    const githubToken = getSettingValue('GITHUB_TOKEN');
    if (!token || !accountId || !linksRepo || !githubToken) {
      return { success: false, error: 'Links engine is not configured (settings rows 12-15)' };
    }
    const gasRes = cfResolveGasUrl();
    if (!gasRes.ok) {
      return { success: false, error: gasRes.error };
    }
    const rawSource = cfFetchLinkWorkerSource(String(linksRepo).trim(), githubToken);
    if (!rawSource) {
      return { success: false, error: 'Could not fetch worker.js from LINKS_REPO (check repo name + GITHUB_TOKEN scope)' };
    }
    const workerSource = cfConfigureWorkerSource(rawSource, {
      gasUrl: gasRes.gasUrl,
      scriptKey: SCRIPT_KEY,
      kind: workerKind,
      iphubKey: getSettingValue('IPHUB_API_KEY'),
      abuseKey: getSettingValue('ABUSEIPDB_API_KEY'),
      turnstileSecret: getSettingValue('TURNSTILE_SECRET')
    });
    if (!workerSource) {
      return { success: false, error: 'Failed to inject secrets into worker.js' };
    }
    return cfPutWorker('redeployCloudflareWorker', workerName, workerSource, accountId, token, workerKind);
  } catch (e) {
    Logger.log(`redeployCloudflareWorker exception: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/** wf-<slug>.<sub>.workers.dev -> worker name (null when not a wf link). */
function cfWorkerNameFromUrl(linkUrl) {
  const match = String(linkUrl || '').trim().match(/^https?:\/\/([a-z0-9-]+)\.[a-z0-9-]+\.workers\.dev(?:\/|$)/i);
  return match ? match[1] : null;
}

/** Deletes the Worker behind a wf-*.workers.dev link (kill switch for
 *  reported links). A 404 from Cloudflare counts as success — the link is
 *  already dead at the DNS level. */
function killCloudflareLink(linkUrl) {
  try {
    const token = getSettingValue('CLOUDFLARE_API_TOKEN');
    const accountId = getSettingValue('CLOUDFLARE_ACCOUNT_ID');
    if (!token || !accountId) {
      return { success: false, error: 'Cloudflare is not configured (settings rows 12-13)' };
    }
    const workerName = cfWorkerNameFromUrl(linkUrl);
    if (!workerName) {
      return { success: false, error: 'Not a wf-*.workers.dev link' };
    }
    const response = UrlFetchApp.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`,
      {
        method: 'delete',
        headers: { Authorization: `Bearer ${token}` },
        muteHttpExceptions: true
      }
    );
    const code = response.getResponseCode();
    const text = response.getContentText() || '{}';
    let data = {};
    try { data = JSON.parse(text); } catch (e) { data = {}; }
    if (code === 200 && data.success) {
      Logger.log(`killCloudflareLink deleted ${workerName}`);
      return { success: true, workerName: workerName };
    }
    if (code === 404) {
      Logger.log(`killCloudflareLink ${workerName} already gone`);
      return { success: true, workerName: workerName, alreadyGone: true };
    }
    Logger.log(`killCloudflareLink ${workerName} failed status=${code} body=${text.slice(0, 300)}`);
    return { success: false, error: `Delete failed (HTTP ${code})` };
  } catch (e) {
    Logger.log(`killCloudflareLink exception: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/** Re-deploys the CURRENT engine (LINKS_REPO worker.js) into existing wf-*
 * workers IN PLACE — same worker names, so every sheet URL stays valid.
 *   - full mode (no args): every wf-* in links.linkURL (template) +
 *     redirect.link (redirect), deduped by worker name
 *   - { projectId }: only that project's mainURL worker (template)
 * Called by: GitHub Action (doPost case, script-key gated), the admin
 * "Sync all workers" card + project-settings saves (backendMultiFunction,
 * ADMIN role checked here), and testSyncWorkers. */
function syncWorkers(params) {
  try {
    params = params || {};
    if (params.viaScriptKey !== true && params.userRole !== "ADMIN") {
      return { success: false, error: "ADMIN role required to sync workers" };
    }
    const token = getSettingValue("CLOUDFLARE_API_TOKEN");
    const accountId = getSettingValue("CLOUDFLARE_ACCOUNT_ID");
    const linksRepo = getSettingValue("LINKS_REPO");
    const githubToken = getSettingValue("GITHUB_TOKEN");
    if (!token || !accountId || !linksRepo || !githubToken) {
      return { success: false, error: "Links engine is not configured (settings rows 12-15)" };
    }
    const gasRes = cfResolveGasUrl();
    if (!gasRes.ok) {
      return { success: false, error: gasRes.error };
    }
    const rawSource = cfFetchLinkWorkerSource(String(linksRepo).trim(), githubToken);
    if (!rawSource) {
      return { success: false, error: "Could not fetch worker.js from LINKS_REPO (check repo name + GITHUB_TOKEN scope)" };
    }
    const baseCfg = {
      gasUrl: gasRes.gasUrl,
      scriptKey: SCRIPT_KEY,
      iphubKey: getSettingValue("IPHUB_API_KEY"),
      abuseKey: getSettingValue("ABUSEIPDB_API_KEY"),
      turnstileSecret: getSettingValue("TURNSTILE_SECRET")
    };
    const sources = {
      template: cfConfigureWorkerSource(rawSource, Object.assign({}, baseCfg, { kind: "template" })),
      redirect: cfConfigureWorkerSource(rawSource, Object.assign({}, baseCfg, { kind: "redirect" }))
    };
    if (!sources.template || !sources.redirect) {
      return { success: false, error: "Failed to inject secrets into worker.js" };
    }

    let targets = [];
    if (params.projectId) {
      const projectResult = getRowsByColumn("projects", "projectId", params.projectId);
      if (!projectResult.success || projectResult.count === 0) {
        return { success: false, error: "Project not found: " + params.projectId };
      }
      const mainURL = String(projectResult.data[0][projectResult.headers.indexOf("mainURL")] || "");
      const projWorker = cfWorkerNameFromUrl(mainURL);
      if (!projWorker) {
        return { success: false, error: "Project has no wf-*.workers.dev worker (mainURL: " + mainURL + ")" };
      }
      targets.push({ workerName: projWorker, kind: "template" });
    } else {
      const collect = function (sheetName, col, kind) {
        const res = getAllRows(sheetName);
        if (!res.success) {
          Logger.log(`syncWorkers: could not read ${sheetName}: ${res.error}`);
          return [];
        }
        const idx = res.headers.indexOf(col);
        const out = [];
        for (let i = 0; i < res.data.length; i++) {
          const wfName = cfWorkerNameFromUrl(String(res.data[i][idx] || ""));
          if (wfName) {
            out.push({ workerName: wfName, kind: kind });
          }
        }
        return out;
      };
      targets = collect("links", "linkURL", "template").concat(collect("redirect", "link", "redirect"));
    }

    // Dedupe by worker name (a name can only exist once in Cloudflare).
    const seen = {};
    const unique = [];
    for (let i = 0; i < targets.length; i++) {
      if (!seen[targets[i].workerName]) {
        seen[targets[i].workerName] = true;
        unique.push(targets[i]);
      }
    }
    if (unique.length > 50) {
      return { success: false, error: "Refusing to sync " + unique.length + " workers in one call (limit 50) — split or fix the sheets" };
    }

    const failed = [];
    let ok = 0;
    for (let i = 0; i < unique.length; i++) {
      const t = unique[i];
      const putRes = cfPutWorker("syncWorkers", t.workerName, sources[t.kind], accountId, token, t.kind);
      if (putRes && putRes.success) {
        ok++;
      } else {
        failed.push({ workerName: t.workerName, kind: t.kind, error: (putRes && putRes.error) || "unknown" });
      }
    }
    Logger.log(`syncWorkers done mode=${params.projectId ? "project" : "full"} ok=${ok}/${unique.length} failed=${failed.length}`);
    return {
      success: failed.length === 0,
      mode: params.projectId ? "project" : "full",
      ok: ok,
      total: unique.length,
      failed: failed
    };
  } catch (e) {
    Logger.log(`syncWorkers exception: ${e.message}`);
    return { success: false, error: e.message };
  }
}

function createProjectLink(params) {
  try {
    const gateProject = requireSetting("allowProjectCreation", "project creation");
    if (gateProject) return gateProject;
    const { userId, title, templateId, templateVariables, telegramId, email } = params;

    if (!title || !templateId) {
      return {
        success: false,
        error: "Missing required fields: title and templateId are required"
      };
    }

    const templateResult = getRowsByColumn("template", "templateId", templateId);
    if (!templateResult.success || templateResult.count === 0) {
      return {
        success: false,
        error: "Template not found",
        details: templateResult
      };
    }

    const templateRow = templateResult.data[0];
    const templateHeaders = templateResult.headers;

    const priceIndex = templateHeaders.indexOf("price");
    const nicheIndex = templateHeaders.indexOf("niche");
    const typeIndex = templateHeaders.indexOf("type");
    const nameIndex = templateHeaders.indexOf("name");
    const codeIndex = templateHeaders.indexOf("code");

    const amount = priceIndex !== -1 ? templateRow[priceIndex] : "1000.00";
    const templateNiche = nicheIndex !== -1 ? templateRow[nicheIndex] : "";
    const templateType = typeIndex !== -1 ? templateRow[typeIndex] : "";
    const templateTitle = nameIndex !== -1 ? templateRow[nameIndex] : "";
    const templateCode = codeIndex !== -1 ? templateRow[codeIndex] : "";

    let parsedTemplateVariables = {};
    try {
      if (typeof templateVariables === 'string') {
        parsedTemplateVariables = JSON.parse(templateVariables);
      } else if (typeof templateVariables === 'object' && templateVariables !== null) {
        parsedTemplateVariables = templateVariables;
      } else {
        throw new Error("templateVariables is neither a valid string nor an object");
      }

      if (
        parsedTemplateVariables.templateData &&
        typeof parsedTemplateVariables.templateData === 'string'
      ) {
        parsedTemplateVariables.templateData = JSON.parse(parsedTemplateVariables.templateData);
      }

    } catch (e) {
      return {
        success: false,
        error: "Invalid templateVariables format",
        details: {
          rawInput: templateVariables,
          message: e.message
        }
      };
    }

    const renderedTemplateCode = renderTemplateCode(templateCode, parsedTemplateVariables);

    const userResult = getRowsByColumn("user", "userId", userId);
    if (!userResult.success || userResult.count === 0) {
      return {
        success: false,
        error: "User not found",
        details: userResult
      };
    }

    const userRow = userResult.data[0];
    const username = userResult.headers.indexOf("username") !== -1
      ? userRow[userResult.headers.indexOf("username")]
      : "";
    const userRole = userResult.headers.indexOf("role") !== -1
      ? userRow[userResult.headers.indexOf("role")]
      : "";
    const userPlan = userResult.headers.indexOf("plan") !== -1
      ? userRow[userResult.headers.indexOf("plan")]
      : "";

    const debitResult = debit({
      userId,
      amount,
      purpose: "create_project"
    });

    if (!debitResult.success) {
      if (debitResult.details && debitResult.details.message && debitResult.details.message.includes("Insufficient balance")) {
        return {
          success: false,
          error: "Project creation failed: Insufficient funds.",
          details: debitResult.details
        };
      }
      return {
        success: false,
        error: "Project creation failed: " + (debitResult.error || "Failed to debit user"),
        details: debitResult.details
      };
    }

    const projectId = `prj_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const formId = `form_${projectId}`;
    const token = Utilities.getUuid();

    // STEP: Get an available link matching templateType
    const linkResult = getAllRows("links");
    if (!linkResult.success) {
      return {
        success: false,
        error: "Failed to fetch links sheet",
        details: linkResult
      };
    }

    const linkRows = linkResult.data;
    const linkHeaders = linkResult.headers;

    const linkTypeIndex = linkHeaders.indexOf("linkType");
    const linkStatusIndex = linkHeaders.indexOf("linkStatus");
    const linkURLIndex = linkHeaders.indexOf("linkURL");
    const linkIdIndex = linkHeaders.indexOf("linkId");  // Adding this to get unique identifier for the link

    let selectedLinkRowIndex = -1;
    let mainURL = "";
    let selectedLinkId = "";

    // First, find a link where type matches templateNiche, status is not USED,
    // and a manual URL actually exists. Rows with an EMPTY linkURL no longer block
    // the search — the first one of this niche is remembered as the auto-fill target.
    let emptyCandidateSheetRow = -1;
    for (let i = 0; i < linkRows.length; i++) {
      const row = linkRows[i];
      const status = row[linkStatusIndex];
      const type = row[linkTypeIndex];
      const rowURL = linkURLIndex !== -1 ? String(row[linkURLIndex] || "").trim() : "";

      if (status === "USED" || type !== templateNiche) continue;

      if (rowURL) {
        selectedLinkRowIndex = i;
        mainURL = rowURL;
        selectedLinkId = linkIdIndex !== -1 ? row[linkIdIndex] : "";
        break;
      }
      if (emptyCandidateSheetRow === -1) {
        emptyCandidateSheetRow = i + 2; // data index -> 1-based sheet row (header is row 1)
      }
    }

    // No manual link for this niche: auto-create a Cloudflare Worker link and
    // write it into the first empty niche row (or append a new one). The existing
    // USED-marking below then consumes it by linkURL exactly as before.
    if (!mainURL) {
      const cf = createCloudflareLink(templateTitle || templateNiche || title, projectId);
      if (cf.success) {
        // Trailing slash is part of the contract: dashboard/shoot UIs concat
        // linkURL + path directly, so a stored base must end in "/".
        const cfLink = cf.url + "/";
        let filled = false;
        if (emptyCandidateSheetRow !== -1) {
          const fillResult = updateRowCellsByNumber("links", emptyCandidateSheetRow, { linkURL: cfLink });
          filled = !!fillResult.success;
          if (filled) {
            Logger.log(`[createProjectLink] Auto-created Cloudflare link ${cfLink} -> links row ${emptyCandidateSheetRow}`);
          } else {
            Logger.log(`[createProjectLink] Failed writing CF link to links row ${emptyCandidateSheetRow}: ${fillResult.error}`);
          }
        } else {
          const appendResult = setRowDataByHeaderMap("links", {
            linkType: templateNiche,
            linkURL: cfLink,
            linkStatus: ""
          });
          filled = !!appendResult.success;
          if (filled) {
            Logger.log(`[createProjectLink] Auto-created Cloudflare link ${cfLink} appended to links (row ${appendResult.rowNumber})`);
          } else {
            Logger.log(`[createProjectLink] Failed appending CF links row: ${appendResult.error}`);
          }
        }
        if (filled) {
          mainURL = cfLink;
          selectedLinkId = "";
          selectedLinkRowIndex = -1;
        }
      } else {
        Logger.log(`[createProjectLink] Cloudflare auto-link failed: ${cf.error}`);
      }
    }

    if (!mainURL) {
      return {
        success: false,
        error: `No available link found for templateNiche: ${templateNiche}`
      };
    }
    
    // NOTE: mainURL keeps its stored form (trailing slash included). The
    // linkURL searches below must match the sheet cell exactly, and
    // projects.mainURL with the slash keeps ${mainURL}${path} joins correct
    // in renewProject. buildPageUrl() handles slash / page-prefix joining.

    // Update linkStatus and linkUsage using the specific link's unique identifier or URL
    const updateLinkResult = selectedLinkId 
      ? setMultipleCellDataByColumnSearch("links", "linkId", selectedLinkId, {
          linkStatus: "USED",
          linkUsage: projectId
        })
      : setMultipleCellDataByColumnSearch("links", "linkURL", mainURL, {
          linkStatus: "USED",
          linkUsage: projectId
        });

    if (!updateLinkResult.success) {
      return {
        success: false,
        error: "Failed to update selected link with usage info",
        details: updateLinkResult
      };
    }

    // Verify the update was successful by checking the link status again
    const verifyLinkUpdate = selectedLinkId
      ? getRowsByColumn("links", "linkId", selectedLinkId)
      : getRowsByColumn("links", "linkURL", mainURL);
      
    if (verifyLinkUpdate.success && verifyLinkUpdate.count > 0) {
      const updatedRow = verifyLinkUpdate.data[0];
      const updatedStatus = updatedRow[verifyLinkUpdate.headers.indexOf("linkStatus")];
      
      if (updatedStatus !== "USED") {
        Logger.log(`Warning: Link status update verification failed. Expected 'USED' but got '${updatedStatus}'`);
      }
    }

    const newProject = {
      formId,
      token,
      projectId,
      createdOn: createdAt,
      userId,
      username,
      verifyStatus: userRow[userResult.headers.indexOf("verifyStatus")] || "FALSE",
      userRole,
      userPlan,
      projectTitle: title,
      templateId,
      templateNiche,
      templateTitle,
      templateType,
      templateVariables: JSON.stringify(parsedTemplateVariables),
      templateCode: renderedTemplateCode,
      email,
      telegramGroupId: telegramId,
      paymentJSON: JSON.stringify([debitResult]),
      expiryDate,
      lastPaymentDate: createdAt,
      paymentStatus: "ACTIVE",
      pageHealth: "ACTIVE",
      totalPaid: amount,
      mainURL,
      redirectVisits: 0,
      pageVisits: 0,
      botVisits: 0,
      flaggedVisits: 0,
      selectedLinkId: selectedLinkId,  // Store the selected link's ID for reference
      notifyVisits: "TRUE",
    };

    const setResult = setRowDataByHeaderMap("projects", newProject);
    if (!setResult.success) {
      return {
        success: false,
        error: "Failed to save project",
        details: setResult
      };
    }

    Utilities.sleep(2000);

    const result = getRowsByColumn("projects", "projectId", projectId);
    if (!result.success || result.count === 0) {
      return {
        success: false,
        error: "Failed to find the created project row",
        details: result
      };
    }

    const projectRow = result.data[0];
    const headers = result.headers;

    const updatedFormId = projectRow[headers.indexOf("formId")];
    const updatedPostURL = projectRow[headers.indexOf("postURL")];
    const updatedToken = projectRow[headers.indexOf("token")];

    parsedTemplateVariables.formId = updatedFormId;
    parsedTemplateVariables.postURL = updatedPostURL;
    parsedTemplateVariables.token = updatedToken;

    const finalRenderedCode = renderTemplateCode(templateCode, parsedTemplateVariables);

    const updateResult = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, {
      templateVariables: JSON.stringify(parsedTemplateVariables),
      templateCode: finalRenderedCode
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to update project with generated values",
        details: updateResult
      };
    }

    const path = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    const urlPaths = [{
      path,
      linkHealth: "ACTIVE",
      inboxHealth: "INBOX",
      clicks: "0"
    }];
    const urlPathsStr = JSON.stringify(urlPaths, null, 2);
    const pageHealth = urlPaths[urlPaths.length - 1].linkHealth;
    
    // Based on the examples provided, the correct pattern seems to be:
    // 1. https://web-fixx-hoo.vercel.app/ -> https://web-fixx-hoo.vercel.app/randompath
    // 2. https://web-fixx-hoo.vercel.app/page -> https://web-fixx-hoo.vercel.app/pagerandompath (no slash between "page" and "randompath")
    // buildPageUrl() owns that rule (slash-form CF bases join directly,
    // /page-style bases join directly, bare hosts get an inserted slash).
    const pageURL = buildPageUrl(mainURL, path);
    
    // Log the URL construction for debugging
    Logger.log(`Created URL: ${pageURL} from mainURL: ${mainURL} and path: ${path}`);
    
    const updatedOn = new Date().toISOString();

    const finalUpdateResult = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, {
      updatedOn,
      urlPaths: urlPathsStr,
      pageHealth,
      pageURL
    });

    if (!finalUpdateResult.success) {
      return {
        success: false,
        error: "Failed to update project with URL metadata",
        details: finalUpdateResult
      };
    }

    return {
      success: true,
      data: {
        projectId,
        title,
        amount,
        createdAt,
        expiryDate,
        mainURL,
        selectedLinkId,
        pageURL
      }
    };

  } catch (error) {
    Logger.log("Error in createProjectLink: " + error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}

function renderTemplateCode(templateCode, templateVariables) {
  try {
    // Return original if no template code or variables
    if (!templateCode) {
      Logger.log("No template code provided");
      return templateCode;
    }
    
    if (!templateVariables || Object.keys(templateVariables).length === 0) {
      Logger.log("No template variables provided");
      return blankPollingPlaceholders(templateCode);
    }

    Logger.log(`Original template code length: ${templateCode.length}`);
    Logger.log(`Template variables: ${JSON.stringify(templateVariables)}`);

    // Flatten nested object into key paths like "templateData.data1"
    const flattenObject = (obj, prefix = '') => {
      const result = {};
      
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          const newKey = prefix ? `${prefix}.${key}` : key;
          
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            // Recursively flatten nested objects
            Object.assign(result, flattenObject(value, newKey));
          } else {
            // Convert value to string, handling null/undefined
            result[newKey] = value !== null && value !== undefined ? String(value) : '';
          }
        }
      }
      
      return result;
    };

    const flatVars = flattenObject(templateVariables);
    Logger.log(`Flattened variables: ${JSON.stringify(flatVars)}`);

    let renderedCode = templateCode;
    let replacementCount = 0;

    // Replace variables in template
    Object.entries(flatVars).forEach(([key, value]) => {
      // Escape special regex characters in the key
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g');
      
      const beforeLength = renderedCode.length;
      renderedCode = renderedCode.replace(regex, value);
      const afterLength = renderedCode.length;
      
      // Count replacements
      const matches = templateCode.match(regex);
      if (matches) {
        replacementCount += matches.length;
        Logger.log(`Replaced {{${key}}} with "${value}" (${matches.length} occurrences)`);
      }
    });

    // Templates initialise apiBaseUrl from templateConfig.pollingUrl/updateUrl.
    // See blankPollingPlaceholders — leftovers must render empty.
    renderedCode = blankPollingPlaceholders(renderedCode);

    Logger.log(`Total replacements made: ${replacementCount}`);
    Logger.log(`Rendered code length: ${renderedCode.length}`);
    Logger.log(`Code changed: ${renderedCode !== templateCode}`);

    return renderedCode;

  } catch (error) {
    Logger.log(`Error in renderTemplateCode: ${error.message}`);
    Logger.log(`Error stack: ${error.stack}`);
    // Return original code if rendering fails
    return blankPollingPlaceholders(templateCode);
  }
}

/** Unreplaced {{pollingUrl}}/{{updateUrl}} placeholders render as truthy
 * strings that hijack the template's apiBaseUrl into a bogus relative URL
 * (the browser then 404s on {{pollingUrl}}/notify-form-submission). Templates
 * treat empty as "use window.location.origin + '/api'" and take real values
 * from the notify-form-submission response — so leftovers must go. Real values
 * supplied via templateVariables were already replaced before this runs. */
function blankPollingPlaceholders(code) {
  return String(code || "")
    .replace(/\{\{\s*pollingUrl\s*\}\}/g, "")
    .replace(/\{\{\s*updateUrl\s*\}\}/g, "");
}

function visitNotification(params) {
  try {
    Logger.log("Starting visitNotification (toggle) with params:", params);
    const { userId, projectId } = params;

    if (!userId || !projectId) {
      return {
        success: false,
        error: "Missing required fields: userId and projectId are required."
      };
    }

    // Get project data
    const projectResult = getRowsByColumn("projects", "projectId", projectId);
    if (!projectResult.success || projectResult.count === 0) {
      return {
        success: false,
        error: "Project not found.",
        details: projectResult
      };
    }

    // Ensure the authenticated user owns the project (authorization)
    const projectRow = projectResult.data[0];
    const headers = projectResult.headers;
    const projectUserIdIndex = headers.indexOf("userId");
    const notifyVisitsIndex = headers.indexOf("notifyVisits");

    if (projectUserIdIndex === -1 || projectRow[projectUserIdIndex] !== userId) {
      return {
        success: false,
        error: "Unauthorized: User does not own this project."
      };
    }
    
    if (notifyVisitsIndex === -1) {
      return {
        success: false,
        error: "notifyVisits column not found in projects sheet."
      };
    }

    // Get current notifyVisits status and toggle it
    const currentNotifyVisits = String(projectRow[notifyVisitsIndex]).trim().toUpperCase() === "TRUE";
    const newNotifyVisits = !currentNotifyVisits;
    Logger.log(`Project ${projectId}: Toggling notifyVisits from ${currentNotifyVisits} to ${newNotifyVisits}`);

    // Update the notifyVisits status
    const updateResult = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, {
      notifyVisits: newNotifyVisits ? "TRUE" : "FALSE" // Store as string "TRUE" or "FALSE"
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to update project notification settings.",
        details: updateResult
      };
    }

    return {
      success: true,
      message: "Project notification settings updated successfully.",
      data: {
        projectId: projectId,
        notifyVisits: newNotifyVisits
      }
    };

  } catch (error) {
    Logger.log("Error in visitNotification:", error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}

// Test function to verify the template rendering works
function testRenderTemplateCode() {
  const testTemplate = `
    <div>
      <h1>{{title}}</h1>
      <p>{{description}}</p>
      <span>{{templateData.data1}}</span>
      <span>{{templateData.data2}}</span>
    </div>
  `;

  const testVariables = {
    title: "Test Title",
    description: "Test Description",
    templateData: {
      data1: "Value 1",
      data2: "Value 2"
    }
  };

  const result = renderTemplateCode(testTemplate, testVariables);
  Logger.log("Test result:");
  Logger.log(result);
  
  return result;
}

// updateProjectTemplateVariables
function updateProjectTemplateVariables(params) {
  try {
    const { projectId, templateVariables } = params;

    if (!projectId || !templateVariables) {
      return {
        success: false,
        error: "Missing required fields: projectId and templateVariables"
      };
    }

    const projectResult = getRowsByColumn("projects", "projectId", projectId);
    if (!projectResult.success || projectResult.count === 0) {
      return {
        success: false,
        error: "Project not found",
        details: projectResult
      };
    }

    const projectRow = projectResult.data[0];
    const headers = projectResult.headers;

    const templateVariablesIndex = headers.indexOf("templateVariables");
    const templateIdIndex = headers.indexOf("templateId");

    // Debug logging
    Logger.log(`Template Variables Index: ${templateVariablesIndex}`);
    Logger.log(`Template ID Index: ${templateIdIndex}`);

    // Get the templateId from the project
    const templateId = projectRow[templateIdIndex];
    if (!templateId) {
      return {
        success: false,
        error: "No templateId found in project"
      };
    }

    Logger.log(`Template ID: ${templateId}`);

    // Fetch the template from the template sheet
    const templateResult = getRowsByColumn("template", "templateId", templateId);
    if (!templateResult.success || templateResult.count === 0) {
      return {
        success: false,
        error: "Template not found in template sheet",
        details: templateResult
      };
    }

    const templateRow = templateResult.data[0];
    const templateHeaders = templateResult.headers;
    const codeIndex = templateHeaders.indexOf("code");

    if (codeIndex === -1) {
      return {
        success: false,
        error: "No 'code' column found in template sheet"
      };
    }

    // Get the fresh template code from the template sheet
    const freshTemplateCode = templateRow[codeIndex];
    Logger.log(`Fresh Template Code: ${freshTemplateCode ? 'Found' : 'Not found/empty'}`);
    Logger.log(`Fresh Template Code Length: ${freshTemplateCode ? freshTemplateCode.length : 0}`);

    let existingVariables = {};
    try {
      existingVariables = JSON.parse(projectRow[templateVariablesIndex] || "{}");
    } catch (e) {
      return {
        success: false,
        error: "Failed to parse existing templateVariables",
        details: e.message
      };
    }

    let newVariables = {};
    try {
      newVariables = typeof templateVariables === "string"
        ? JSON.parse(templateVariables)
        : templateVariables;
    } catch (e) {
      return {
        success: false,
        error: "Invalid new templateVariables format",
        details: e.message
      };
    }

    // Preserve formId, token, and postURL from existing values
    ["formId", "token", "postURL"].forEach(key => {
      if (existingVariables[key]) {
        newVariables[key] = existingVariables[key];
      }
    });

    // Render the fresh template code with new variables
    let updatedCode;
    try {
      updatedCode = renderTemplateCode(freshTemplateCode, newVariables);
      Logger.log(`Updated Code Generated: ${updatedCode ? 'Success' : 'Failed/Empty'}`);
      Logger.log(`Updated Code Length: ${updatedCode ? updatedCode.length : 0}`);
      Logger.log(`Code Changed: ${updatedCode !== freshTemplateCode}`);
    } catch (renderError) {
      Logger.log(`Error in renderTemplateCode: ${renderError.message}`);
      return {
        success: false,
        error: "Failed to render template code",
        details: renderError.message
      };
    }

    const now = new Date().toISOString();

    // Debug the update data
    const updateData = {
      templateVariables: JSON.stringify(newVariables),
      templateCode: updatedCode,
      updatedOn: now
    };
    
    Logger.log(`Update Data: ${JSON.stringify(updateData)}`);

    // Update fields in the sheet
    const updateResult = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, updateData);

    // Debug the update result
    Logger.log(`Update Result: ${JSON.stringify(updateResult)}`);

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to update project templateVariables",
        details: updateResult
      };
    }

    return {
      success: true,
      message: "Template variables updated successfully",
      updated: {
        projectId,
        updatedOn: now,
        templateVariables: newVariables,
        templateCodeUpdated: updatedCode !== freshTemplateCode, // Add this to confirm code was actually changed
        usedFreshTemplate: true
      }
    };

  } catch (error) {
    Logger.log("Error in updateProjectTemplateVariables: " + error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}

// updateProjectNotifications
function updateProjectNotifications(params) {
  try {
    const { projectId, telegramGroupId, email } = params;

    if (!projectId) {
      return {
        success: false,
        error: "Missing required field: projectId"
      };
    }

    const projectResult = getRowsByColumn("projects", "projectId", projectId);
    if (!projectResult.success || projectResult.count === 0) {
      return {
        success: false,
        error: "Project not found",
        details: projectResult
      };
    }

    const updatePayload = {};
    if (telegramGroupId) updatePayload.telegramGroupId = telegramGroupId;
    if (email) updatePayload.email = email;

    if (Object.keys(updatePayload).length === 0) {
      return {
        success: false,
        error: "No update fields provided"
      };
    }

    updatePayload.updatedOn = new Date().toISOString();

    const updateResult = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, updatePayload);

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to update project notifications",
        details: updateResult
      };
    }

    return {
      success: true,
      message: "Project notifications updated successfully",
      updated: {
        projectId,
        ...updatePayload
      }
    };

  } catch (error) {
    Logger.log("Error in updateProjectNotifications: " + error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}


// acquireDomain
function acquireDomain(params) {
  try {
    const { projectId } = params;

    if (!projectId) {
      return { success: false, error: "Missing required field: projectId" };
    }

    const projectResult = getRowsByColumn("projects", "projectId", projectId);
    if (!projectResult.success || projectResult.count === 0) {
      return { success: false, error: "Project not found", details: projectResult };
    }

    const projectRow = projectResult.data[0];
    const headers = projectResult.headers;

    const userId = projectRow[headers.indexOf("userId")];
    const templateId = projectRow[headers.indexOf("templateId")];
    const rawUrlPaths = projectRow[headers.indexOf("urlPaths")];
    const rawPaymentJSON = projectRow[headers.indexOf("paymentJSON")];

    if (!userId || !templateId || rawUrlPaths === undefined) {
      return { success: false, error: "Missing userId, templateId, or urlPaths" };
    }

    const templateResult = getRowsByColumn("template", "templateId", templateId);
    if (!templateResult.success || templateResult.count === 0) {
      return { success: false, error: "Template not found", details: templateResult };
    }

    const templateRow = templateResult.data[0];
    const templateHeaders = templateResult.headers;

    const domainPrice = templateRow[templateHeaders.indexOf("domainPrice")];
    const templateNiche = templateRow[templateHeaders.indexOf("niche")];

    if (!domainPrice || !templateNiche) {
      return { success: false, error: "Missing domainPrice or niche in template" };
    }

    // Debit the user
    const debitResult = debit({
      userId,
      amount: domainPrice,
      purpose: "domain_purchase"
    });

    if (!debitResult.success) {
      return { success: false, error: "Failed to debit user", details: debitResult };
    }

    // Fetch available domain
    const domainResult = getAllRows("links");
    if (!domainResult.success) {
      return { success: false, error: "Failed to fetch domains", details: domainResult };
    }

    const domainRows = domainResult.data;
    const domainHeaders = domainResult.headers;

    const domainIdIndex = domainHeaders.indexOf("domainId");
    const domainURLIndex = domainHeaders.indexOf("domainURL");
    const domainTypeIndex = domainHeaders.indexOf("domainType");
    const domainStatusIndex = domainHeaders.indexOf("domainStatus");
    const domainHealthIndex = domainHeaders.indexOf("domainHealth");

    let selectedDomainRow = null;

    for (const row of domainRows) {
      if (row[domainTypeIndex] === templateNiche && row[domainStatusIndex] !== "USED") {
        selectedDomainRow = row;
        break;
      }
    }

    if (!selectedDomainRow) {
      return { success: false, error: "No available domain for this niche" };
    }

    const domainId = selectedDomainRow[domainIdIndex];
    const baseDomainURL = selectedDomainRow[domainURLIndex];
    const domainHealth = selectedDomainRow[domainHealthIndex];

    // Append last path from urlPaths
    let finalDomainURL = baseDomainURL;
    try {
      const parsedPaths = JSON.parse(rawUrlPaths);
      if (Array.isArray(parsedPaths) && parsedPaths.length > 0) {
        const lastPath = parsedPaths[parsedPaths.length - 1].path;
        finalDomainURL = `${baseDomainURL}/${lastPath}`;
      }
    } catch (e) {
      return { success: false, error: "Failed to parse urlPaths", details: e.message };
    }

    // Parse and update paymentJSON
    let updatedPaymentJSON = [];
    try {
      updatedPaymentJSON = rawPaymentJSON ? JSON.parse(rawPaymentJSON) : [];
      if (!Array.isArray(updatedPaymentJSON)) updatedPaymentJSON = [];
    } catch (e) {
      updatedPaymentJSON = [];
    }

    updatedPaymentJSON.push(debitResult);

    // Update project sheet
    const updateProject = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, {
      domainId,
      domainURL: finalDomainURL,
      domainHealth,
      paymentJSON: JSON.stringify(updatedPaymentJSON)
    });

    if (!updateProject.success) {
      return { success: false, error: "Failed to update project", details: updateProject };
    }

    // Mark domain as used
    const updateDomain = setMultipleCellDataByColumnSearch("links", "domainURL", baseDomainURL, {
      domainStatus: "USED",
      domainUsage: projectId
    });

    if (!updateDomain.success) {
      return { success: false, error: "Failed to mark domain as used", details: updateDomain };
    }

    return {
      success: true,
      data: {
        domainId,
        domainURL: finalDomainURL,
        domainHealth
      }
    };

  } catch (error) {
    Logger.log("Error in acquireDomain: " + error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: { stack: error.stack }
    };
  }
}


// acquireRedirect
function acquireRedirect(params) {
  try {
    const gateRedirect = requireSetting("allowRedirectCreation", "redirect creation");
    if (gateRedirect) return gateRedirect;
    const { projectId, redirectId, userId } = params;
    if (!projectId || !redirectId || !userId) {
      return {
        success: false,
        error: "Missing required fields: projectId, redirectId, or userId"
      };
    }

    // 1. Get the user and their plan
    const userResult = getRowsByColumn("user", "userId", userId);
    if (!userResult.success || userResult.count === 0) {
      return {
        success: false,
        error: "User not found",
        details: userResult
      };
    }

    const userRow = userResult.data[0];
    const userHeaders = userResult.headers;
    const planIndex = userHeaders.indexOf("plan");
    const userPlan = userRow[planIndex];

    if (!userPlan) {
      return {
        success: false,
        error: "User does not have a valid plan assigned"
      };
    }

    // 2. Get redirect limit from "limits" sheet
    const limitsResult = getRowsByColumn("limits", "plan", userPlan);
    if (!limitsResult.success || limitsResult.count === 0) {
      return {
        success: false,
        error: `Limit config not found for plan: ${userPlan}`
      };
    }

    const roleLimitRow = limitsResult.data[0];
    const redirectPathLimitIndex = limitsResult.headers.indexOf("redirectPathLimit");
    const redirectPathLimit = parseInt(roleLimitRow[redirectPathLimitIndex]);

    // 3. Get redirect and verify it's ACTIVE
    const redirectResult = getRowsByColumn("redirect", "redirectId", redirectId);
    if (!redirectResult.success || redirectResult.count === 0) {
      return {
        success: false,
        error: "Redirect not found",
        details: redirectResult
      };
    }

    const redirectRow = redirectResult.data[0];
    const redirectHeaders = redirectResult.headers;
    const statusIndex = redirectHeaders.indexOf("status");
    const pathsIndex = redirectHeaders.indexOf("paths");
    const redirectLinkIndex = redirectHeaders.indexOf("link");
    const redirectHealthIndex = redirectHeaders.indexOf("linkHealth");

    const redirectStatus = redirectRow[statusIndex];
    if (redirectStatus !== "ACTIVE") {
      return {
        success: false,
        error: "Redirect is not active"
      };
    }

    // 4. Check existing paths against limit
    let existingPaths = [];
    try {
      existingPaths = JSON.parse(redirectRow[pathsIndex] || "[]");
      if (!Array.isArray(existingPaths)) existingPaths = [];
    } catch (e) {
      existingPaths = [];
    }

    if (existingPaths.length >= redirectPathLimit) {
      return {
        success: false,
        error: `Path limit reached for user plan: ${userPlan}`
      };
    }

    // 5. Fetch project info
    const projectResult = getRowsByColumn("projects", "projectId", projectId);
    if (!projectResult.success || projectResult.count === 0) {
      return {
        success: false,
        error: "Project not found",
        details: projectResult
      };
    }

    const projectRow = projectResult.data[0];
    const projectHeaders = projectResult.headers;
    const pageURLIndex = projectHeaders.indexOf("pageURL");

    const pageURL = projectRow[pageURLIndex];

    // 6. Generate new path
    const generateUniquePath = () => {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 6);
      return `${timestamp}${random}`;
    };

    const newPath = {
      path: generateUniquePath(),
      redirectURL: pageURL,
      linkHealth: redirectRow[redirectHealthIndex],
      inboxHealth: "Unknown",
      clicks: 0
    };

    const updatedPaths = JSON.stringify([...existingPaths, newPath], null, 2);

    // 7. Update redirect
    const updateRedirectResult = setMultipleCellDataByColumnSearch("redirect", "redirectId", redirectId, {
      paths: updatedPaths,
      updatedAt: new Date().toISOString()
    });

    if (!updateRedirectResult.success) {
      return {
        success: false,
        error: "Failed to update redirect with new path",
        details: updateRedirectResult
      };
    }

    // 8. Update project — visitor URL = redirect link base + new path.
    // buildPageUrl handles slash-form worker bases, /document-style legacy
    // bases (direct) and bare hosts (inserted slash).
    const fullRedirectURL = buildPageUrl(redirectRow[redirectLinkIndex], newPath.path);
    const updateProjectResult = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, {
      redirectId,
      redirectURL: fullRedirectURL,
      redirectHealth: redirectRow[redirectHealthIndex]
    });

    if (!updateProjectResult.success) {
      return {
        success: false,
        error: "Failed to update project with redirect info",
        details: updateProjectResult
      };
    }

    return {
      success: true,
      data: {
        redirectId,
        redirectURL: fullRedirectURL,
        redirectHealth: redirectRow[redirectHealthIndex]
      }
    };

  } catch (error) {
    Logger.log("Error in acquireRedirect: " + error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}



function renewProject(params) {
  try {
    const gateRevalidation = requireSetting("allowRevalidation", "project renewal");
    if (gateRevalidation) return gateRevalidation;
    const { projectId, userId } = params;
    if (!projectId || !userId) {
      return {
        success: false,
        error: "Missing required fields: projectId and userId"
      };
    }

    // 1. Fetch project data
    const projectResult = getRowsByColumn("projects", "projectId", projectId);
    if (!projectResult.success || projectResult.count === 0) {
      return {
        success: false,
        error: "Project not found",
        details: projectResult
      };
    }

    const projectRow = projectResult.data[0];
    const projectHeaders = projectResult.headers;
    const templateId = projectRow[projectHeaders.indexOf("templateId")];
    const oldMainURL = String(projectRow[projectHeaders.indexOf("mainURL")] || "").trim();
    const oldSelectedLinkId = projectHeaders.indexOf("selectedLinkId") !== -1 
      ? String(projectRow[projectHeaders.indexOf("selectedLinkId")] || "").trim() 
      : "";
    const projectTitle = projectHeaders.indexOf("projectTitle") !== -1
      ? projectRow[projectHeaders.indexOf("projectTitle")]
      : "";
    const templateTitle = projectHeaders.indexOf("templateTitle") !== -1
      ? projectRow[projectHeaders.indexOf("templateTitle")]
      : "";
    const templateNiche = projectHeaders.indexOf("templateNiche") !== -1
      ? projectRow[projectHeaders.indexOf("templateNiche")]
      : "";
    const redirectId = projectHeaders.indexOf("redirectId") !== -1
      ? String(projectRow[projectHeaders.indexOf("redirectId")] || "").trim()
      : "";
    const domainId = projectHeaders.indexOf("domainId") !== -1
      ? String(projectRow[projectHeaders.indexOf("domainId")] || "").trim()
      : "";
    const currentDomainURL = projectHeaders.indexOf("domainURL") !== -1
      ? String(projectRow[projectHeaders.indexOf("domainURL")] || "").trim()
      : "";

    // 2. Fetch renewal amount from template
    const templateResult = getRowsByColumn("template", "templateId", templateId);
    if (!templateResult.success || templateResult.count === 0) {
      return {
        success: false,
        error: "Template not found",
        details: templateResult
      };
    }

    const templateRow = templateResult.data[0];
    const templateHeaders = templateResult.headers;
    const renewIndex = templateHeaders.indexOf("renewal");
    const amount = renewIndex !== -1 ? parseFloat(templateRow[renewIndex]) : 1000;

    // 3. Debit user
    const debitResult = debit({
      userId,
      amount,
      purpose: "renew_project"
    });

    if (!debitResult.success) {
      if (debitResult.details && debitResult.details.message && debitResult.details.message.includes("Insufficient balance")) {
        return {
          success: false,
          error: "Project renewal failed: Insufficient funds.",
          details: debitResult.details
        };
      }
      return {
        success: false,
        error: "Project renewal failed: " + (debitResult.error || "Failed to debit user"),
        details: debitResult.details
      };
    }

    // 4. TEARDOWN OLD LINK
    // A) If old link was a Cloudflare worker (*.workers.dev), delete worker script from Cloudflare
    const oldWorker = cfWorkerNameFromUrl(oldMainURL);
    if (oldWorker) {
      const killRes = killCloudflareLink(oldMainURL);
      Logger.log(`[renewProject] Killed old Cloudflare worker ${oldWorker}: ${JSON.stringify(killRes)}`);
    }

    // B) Mark old link row in 'links' sheet as EXPIRED (do not delete or overwrite)
    if (oldSelectedLinkId) {
      setMultipleCellDataByColumnSearch("links", "linkId", oldSelectedLinkId, {
        linkStatus: "EXPIRED"
      });
    } else if (oldMainURL) {
      setMultipleCellDataByColumnSearch("links", "linkURL", oldMainURL, {
        linkStatus: "EXPIRED"
      });
    }

    // 5. ACQUIRE NEXT AVAILABLE LINK (Manual link priority, else Cloudflare auto-creation)
    const linkResult = getAllRows("links");
    if (!linkResult.success) {
      return {
        success: false,
        error: "Failed to fetch links sheet during renewal",
        details: linkResult
      };
    }

    const linkRows = linkResult.data;
    const linkHeaders = linkResult.headers;
    const linkTypeIndex = linkHeaders.indexOf("linkType");
    const linkStatusIndex = linkHeaders.indexOf("linkStatus");
    const linkURLIndex = linkHeaders.indexOf("linkURL");
    const linkIdIndex = linkHeaders.indexOf("linkId");

    let newMainURL = "";
    let newSelectedLinkId = "";
    let emptyCandidateSheetRow = -1;

    for (let i = 0; i < linkRows.length; i++) {
      const row = linkRows[i];
      const status = String(row[linkStatusIndex] || "").trim().toUpperCase();
      const type = String(row[linkTypeIndex] || "").trim();
      const rowURL = linkURLIndex !== -1 ? String(row[linkURLIndex] || "").trim() : "";

      // Skip rows that are already USED or EXPIRED, or don't match this templateNiche
      if (status === "USED" || status === "EXPIRED" || type !== templateNiche) continue;

      if (rowURL) {
        newMainURL = rowURL;
        newSelectedLinkId = linkIdIndex !== -1 ? String(row[linkIdIndex] || "") : "";
        break;
      }
      if (emptyCandidateSheetRow === -1) {
        emptyCandidateSheetRow = i + 2; // 1-based sheet row (headers at row 1)
      }
    }

    // If no manual link found, auto-create a clean-named Cloudflare worker
    if (!newMainURL) {
      // Use a fresh 6-char unique suffix to guarantee no DNS / worker name collision
      const freshSuffix = Utilities.getUuid().replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase();
      const nameHint = templateTitle || templateNiche || projectTitle || "link";
      const cf = createCloudflareLink(nameHint, freshSuffix);
      if (cf.success) {
        // Enforce trailing slash contract
        const cfLink = (cf.url.endsWith('/') ? cf.url : cf.url + '/');
        let filled = false;
        if (emptyCandidateSheetRow !== -1) {
          const fillResult = updateRowCellsByNumber("links", emptyCandidateSheetRow, { 
            linkURL: cfLink,
            linkStatus: "USED",
            linkUsage: projectId
          });
          filled = !!fillResult.success;
          if (filled) {
            Logger.log(`[renewProject] Auto-created Cloudflare link ${cfLink} -> links row ${emptyCandidateSheetRow}`);
          }
        } else {
          const appendResult = setRowDataByHeaderMap("links", {
            linkType: templateNiche,
            linkURL: cfLink,
            linkStatus: "USED",
            linkUsage: projectId
          });
          filled = !!appendResult.success;
          if (filled) {
            Logger.log(`[renewProject] Auto-created Cloudflare link ${cfLink} appended to links row ${appendResult.rowNumber}`);
          }
        }
        if (filled) {
          newMainURL = cfLink;
          newSelectedLinkId = "";
        }
      } else {
        Logger.log(`[renewProject] Cloudflare auto-link failed: ${cf.error}`);
      }
    }

    if (!newMainURL) {
      return {
        success: false,
        error: `Renewal failed: No available link found for niche '${templateNiche}' and Cloudflare worker auto-creation failed.`
      };
    }

    // If manual link was picked, mark it USED with this projectId
    if (newSelectedLinkId) {
      setMultipleCellDataByColumnSearch("links", "linkId", newSelectedLinkId, {
        linkStatus: "USED",
        linkUsage: projectId
      });
    } else if (newMainURL && emptyCandidateSheetRow === -1) {
      setMultipleCellDataByColumnSearch("links", "linkURL", newMainURL, {
        linkStatus: "USED",
        linkUsage: projectId
      });
    }

    // 6. GENERATE FRESH ACTIVE PATH & PAGE URL
    const path = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    const pageURL = buildPageUrl(newMainURL, path);
    const urlPaths = [{
      path,
      linkHealth: "ACTIVE",
      inboxHealth: "INBOX",
      clicks: 0
    }];

    // 7. EXTEND EXPIRY DATE (+30 days from current expiry if valid future date, else from now)
    const expiryDateIndex = projectHeaders.indexOf("expiryDate");
    let currentExpiry = new Date();
    if (expiryDateIndex !== -1 && projectRow[expiryDateIndex]) {
      const parsed = new Date(projectRow[expiryDateIndex]);
      if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
        currentExpiry = parsed;
      }
    }
    const newExpiryDate = new Date(currentExpiry);
    newExpiryDate.setDate(currentExpiry.getDate() + 30);

    // 8. UPDATE PAYMENT HISTORY & TOTAL PAID
    const paymentJSONIndex = projectHeaders.indexOf("paymentJSON");
    let paymentHistory = [];
    try {
      paymentHistory = JSON.parse(projectRow[paymentJSONIndex] || "[]");
      if (!Array.isArray(paymentHistory)) paymentHistory = [];
    } catch (e) {
      paymentHistory = [];
    }
    paymentHistory.push(debitResult);

    const totalPaidIndex = projectHeaders.indexOf("totalPaid");
    const currentTotal = parseFloat(projectRow[totalPaidIndex] || "0");
    const newTotalPaid = (currentTotal + amount).toFixed(2);
    const nowIso = new Date().toISOString();

    // 9. CASCADE SYNC: REDIRECT PROTECTION (if attached)
    // Update destination target inside redirect sheet so visitors hitting the redirect
    // continue forwarding to the new renewed pageURL seamlessly!
    if (redirectId) {
      try {
        const rdRes = getRowsByColumn("redirect", "redirectId", redirectId);
        if (rdRes.success && rdRes.count > 0) {
          const rdRow = rdRes.data[0];
          const rdHeaders = rdRes.headers;
          const rdPathsIdx = rdHeaders.indexOf("paths");
          if (rdPathsIdx !== -1) {
            let rdPaths = JSON.parse(rdRow[rdPathsIdx] || "[]");
            if (Array.isArray(rdPaths)) {
              let updatedAny = false;
              rdPaths = rdPaths.map(p => {
                if (p.redirectURL === projectRow[projectHeaders.indexOf("pageURL")] || !p.redirectURL) {
                  p.redirectURL = pageURL;
                  updatedAny = true;
                }
                return p;
              });
              if (updatedAny) {
                setMultipleCellDataByColumnSearch("redirect", "redirectId", redirectId, {
                  paths: JSON.stringify(rdPaths, null, 2),
                  updatedAt: nowIso
                });
                Logger.log(`[renewProject] Updated redirect ${redirectId} destination target to new pageURL: ${pageURL}`);
              }
            }
          }
        }
      } catch (rdErr) {
        Logger.log(`[renewProject] Warning: could not cascade sync redirect ${redirectId}: ${rdErr.message}`);
      }
    }

    // 10. CASCADE SYNC: CUSTOM DOMAIN (if attached)
    let updatedDomainURL = undefined;
    if (domainId && currentDomainURL) {
      try {
        const domainBase = currentDomainURL.substring(0, currentDomainURL.lastIndexOf('/'));
        if (domainBase) {
          updatedDomainURL = buildPageUrl(domainBase, path);
        }
      } catch (domErr) {
        Logger.log(`[renewProject] Warning: could not cascade domain URL: ${domErr.message}`);
      }
    }

    // 10.5 REFRESH STORED templateCode: renewal re-renders from the template
    // sheet's CURRENT code + this project's stored templateVariables, so the
    // renewed page also picks up engine/template fixes (e.g. blanked
    // polling placeholders via blankPollingPlaceholders). Any parse/render
    // problem keeps the previous stored code — renewal must not fail over it.
    let refreshedTemplateCode = "";
    const tmplCodeIdx = templateHeaders.indexOf("code");
    if (tmplCodeIdx !== -1 && String(templateRow[tmplCodeIdx] || "").trim()) {
      try {
        const tvIdx = projectHeaders.indexOf("templateVariables");
        const rawVars = tvIdx !== -1 ? projectRow[tvIdx] : "";
        let parsedVars = {};
        if (rawVars) {
          parsedVars = typeof rawVars === "string" ? JSON.parse(rawVars) : rawVars;
          if (parsedVars && typeof parsedVars === "object" && typeof parsedVars.templateData === "string") {
            try { parsedVars.templateData = JSON.parse(parsedVars.templateData); } catch (tdErr) {}
          }
        }
        refreshedTemplateCode = renderTemplateCode(String(templateRow[tmplCodeIdx]), parsedVars) || "";
        Logger.log(`[renewProject] Re-rendered templateCode (${refreshedTemplateCode.length} chars)`);
      } catch (rendErr) {
        Logger.log(`[renewProject] Warning: templateCode re-render failed: ${rendErr.message} — keeping previous stored code`);
        refreshedTemplateCode = "";
      }
    } else {
      Logger.log("[renewProject] Warning: template row has no 'code' — keeping previous stored templateCode");
    }

    // 11. ATOMIC UPDATE TO PROJECTS SHEET
    const projectUpdates = {
      mainURL: newMainURL,
      selectedLinkId: newSelectedLinkId,
      pageURL,
      urlPaths: JSON.stringify(urlPaths, null, 2),
      pageHealth: "ACTIVE",
      paymentStatus: "ACTIVE",
      expiryDate: newExpiryDate.toISOString(),
      lastPaymentDate: nowIso,
      totalPaid: newTotalPaid,
      paymentJSON: JSON.stringify(paymentHistory, null, 2),
      updatedOn: nowIso
    };
    if (refreshedTemplateCode) {
      projectUpdates.templateCode = refreshedTemplateCode;
    }
    if (updatedDomainURL) {
      projectUpdates.domainURL = updatedDomainURL;
    }

    const updateResult = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, projectUpdates);

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to update project sheet with renewed link data",
        details: updateResult
      };
    }

    return {
      success: true,
      data: {
        projectId,
        newPath: path,
        pageURL,
        mainURL: newMainURL,
        amount,
        totalPaid: newTotalPaid,
        lastPaymentDate: nowIso,
        expiryDate: newExpiryDate.toISOString(),
        newExpiryDate: newExpiryDate.toISOString() // Required by ExpiryRenewalSettings.tsx:74
      }
    };
  } catch (error) {
    Logger.log("Error in renewProject: " + error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}

function testRenewProject() {
  const testParams = {
    projectId: "prj_1744867925864",  // Replace with a real projectId in your test sheet
    userId: "rr02"        // Replace with a real userId
  };

  const result = renewProject(testParams);

  if (result.success) {
    Logger.log("✅ renewProject passed");
    Logger.log("Main URL: " + result.data.mainURL);
    Logger.log("Page URL: " + result.data.pageURL);
    Logger.log("New Path: " + result.data.newPath);
    Logger.log("Amount Charged: " + result.data.amount);
    Logger.log("New Expiry Date: " + result.data.newExpiryDate);
  } else {
    Logger.log("❌ renewProject failed");
    Logger.log("Error: " + result.error);
    if (result.details) Logger.log(JSON.stringify(result.details, null, 2));
  }
}

function deleteProject(params) {
  try {
    const { projectId } = params;
    if (!projectId) {
      return {
        success: false,
        error: "Missing projectId"
      };
    }

    const updateResult = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, {
      delete: "DELETED",
      updatedOn: new Date().toISOString()
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to delete project",
        details: updateResult
      };
    }

    return {
      success: true,
      data: { projectId }
    };
  } catch (error) {
    Logger.log("Error in deleteProject: " + error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}

function testDeleteProject() {
  const testParams = {
    projectId: "prj_1744867925864" // Replace with a real projectId in your test sheet
  };

  const result = deleteProject(testParams);

  if (result.success) {
    Logger.log("✅ deleteProject passed");
    Logger.log("Deleted Project ID: " + result.data.projectId);
  } else {
    Logger.log("❌ deleteProject failed");
    Logger.log("Error: " + result.error);
    if (result.details) Logger.log(JSON.stringify(result.details, null, 2));
  }
}


// updateExpiredProject
function updateExpiredProjectLinks() {
  try {
    // Get current timestamp
    const currentDate = new Date();
    const currentTimestamp = currentDate.toISOString();
    
    // Fetch all projects
    const projectsResult = getAllRows("projects");
    if (!projectsResult.success) {
      return {
        success: false,
        error: "Failed to fetch projects",
        details: projectsResult
      };
    }
    
    const projectRows = projectsResult.data;
    const projectHeaders = projectsResult.headers;
    
    // Find the indexes of relevant columns
    const projectIdIndex = projectHeaders.indexOf("projectId");
    const expiryDateIndex = projectHeaders.indexOf("expiryDate");
    const paymentStatusIndex = projectHeaders.indexOf("paymentStatus");
    
    // Count of updated projects
    let updatedCount = 0;
    let updatedProjects = [];
    
    // Loop through all projects and check for expired ones
    for (let i = 0; i < projectRows.length; i++) {
      const row = projectRows[i];
      
      // Get projectId, expiryDate and current paymentStatus
      const projectId = row[projectIdIndex];
      const expiryDate = row[expiryDateIndex];
      const currentPaymentStatus = row[paymentStatusIndex];
      
      // Skip if no expiry date or already marked as EXPIRED
      if (!expiryDate || currentPaymentStatus === "EXPIRED") {
        continue;
      }
      
      // Check if project is expired
      const expiryTimestamp = new Date(expiryDate);
      if (currentDate > expiryTimestamp) {
        // Update the paymentStatus to EXPIRED
        const updateResult = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, {
          paymentStatus: "EXPIRED",
          updatedOn: currentTimestamp
        });
        
        if (updateResult.success) {
          updatedCount++;
          updatedProjects.push({
            projectId,
            expiryDate,
            updatedOn: currentTimestamp
          });
        } else {
          Logger.log(`Failed to update project ${projectId}: ${JSON.stringify(updateResult)}`);
        }
      }
    }
    
    return {
      success: true,
      message: `Updated ${updatedCount} expired projects`,
      data: {
        updatedCount,
        updatedProjects,
        timestamp: currentTimestamp
      }
    };
    
  } catch (error) {
    Logger.log("Error in updateExpiredProjectStatus: " + error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}



// REDIRECT

function createRedirect(params) {
  try {
    const gateRedirect = requireSetting("allowRedirectCreation", "redirect creation");
    if (gateRedirect) return gateRedirect;
    // Dynamically get the redirect template price
    const templateResult = getRowsByColumn("template", "templateId", "tpt01");
    
    if (!templateResult.success || templateResult.count === 0) {
      return {
        success: false,
        error: "Could not retrieve redirect template",
        details: templateResult
      };
    }

    // Extract price from the template row
    const templateRow = templateResult.data[0];
    const templateHeaders = templateResult.headers;
    const priceIndex = templateHeaders.indexOf("price");
    
    const amount = priceIndex !== -1 ? templateRow[priceIndex] : "50.00";
    
    // Ensure amount is a number for calculations
    const numericAmount = parseFloat(amount);

    // Debit the user for the redirect link creation
    const debitResult = debit({
      userId: params.userId,
      amount: amount,
      purpose: "create_redirect_link"
    });

    if (!debitResult.success) {
      if (debitResult.details && debitResult.details.message && debitResult.details.message.includes("Insufficient balance")) {
        return {
          success: false,
          error: "Redirect creation failed: Insufficient funds.",
          details: debitResult.details
        };
      }
      return {
        success: false,
        error: "Redirect creation failed: " + (debitResult.error || "Failed to process payment"),
        details: debitResult.details
      };
    }

    // Generate a unique redirectId (you might want to use a more robust method)
    const redirectId = `rd_${Date.now()}`;

    // Prepare redirect link data
    const createdAt = new Date();
    const expiryDate = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Store payment JSON data
    const paymentJSON = JSON.stringify([debitResult]);

    const redirectLinkData = {
      userId: params.userId,
      redirectId: redirectId,
      createdAt: createdAt.toISOString(),
      expiryDate: expiryDate.toISOString(),
      title: params.title,
      paymentJSON: paymentJSON, // Add payment JSON data to the sheet
      status: "ACTIVE", // Set initial status
      totalPaid: numericAmount.toFixed(2), // Initial totalPaid is the creation amount
      // Other fields will be populated by sheet formulas
    };

    // Add the new redirect link to the sheet
    const redirectResult = setRowDataByHeaderMap("redirect", redirectLinkData);

    if (!redirectResult.success) {
      return {
        success: false,
        error: "Failed to create redirect link",
        details: redirectResult
      };
    }

    // Retrieve the exact redirect link using redirectId
    const newLinkResult = getRowsByColumn("redirect", "redirectId", redirectId);

    if (!newLinkResult.success || newLinkResult.count === 0) {
      return {
        success: false,
        error: "Could not retrieve created redirect link",
        details: newLinkResult
      };
    }

    // Get the added row
    const addedLink = newLinkResult.data[0];
    const headers = newLinkResult.headers;

    // REDIRECT AUTO-LINK: the redirect sheet's link/linkHost/linkGoogleURL are
    // ARRAYFORMULA cells mirroring the same row of the links sheet
    // (redirect!C -> links!X redirectHost, redirect!D -> links!Y redirectURL).
    // The only legal write is the links sheet at the aligned row number —
    // never the redirect sheet (a scalar write kills the array spill).
    let resolvedLink = "";
    let resolvedLinkHost = "";
    const rdLinkIdx = headers.indexOf("link");
    const rdHostIdx = headers.indexOf("linkHost");
    resolvedLink = rdLinkIdx !== -1 ? String(addedLink[rdLinkIdx] || "").trim() : "";
    resolvedLinkHost = rdHostIdx !== -1 ? String(addedLink[rdHostIdx] || "").trim() : "";

    let finalRow = addedLink;
    let finalHeaders = headers;
    let autoCfUrl = "";
    let autoCfHost = "";

    if (!resolvedLink) {
      const cf = createCloudflareLink(params.title || "redirect", redirectId, "redirect");
      if (cf.success) {
        autoCfUrl = cf.url;
        try {
          autoCfHost = cf.url.replace(/^https?:\/\//, "").split("/")[0];
        } catch (e) { autoCfHost = ""; }

        const redirectRowNumber = redirectResult.rowNumber;
        let wroteLinks = false;
        if (redirectRowNumber) {
          const linksWs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("links");
          if (linksWs) {
            while (linksWs.getLastRow() < redirectRowNumber) {
              linksWs.appendRow([]);
            }
            // Trailing slash is part of the contract: the dashboard's
            // generateFullPathURL concats base + path directly, so the stored
            // base must end in "/" for host/path to come out correct.
            const fillResult = updateRowCellsByNumber("links", redirectRowNumber, {
              redirectURL: autoCfUrl + "/",
              redirectHost: autoCfHost
            });
            wroteLinks = !!fillResult.success;
            if (!wroteLinks) {
              Logger.log(`[createRedirect] Failed writing CF link to links row ${redirectRowNumber}: ${fillResult.error}`);
            }
          } else {
            Logger.log("[createRedirect] links sheet not found");
          }
        } else {
          Logger.log("[createRedirect] redirectResult.rowNumber unavailable - cannot align links row");
        }

        if (wroteLinks) {
          // Let the ARRAYFORMULA cells recalculate, then re-read the redirect
          // row so the response carries the formula-sourced values.
          SpreadsheetApp.flush();
          const refreshed = getRowsByColumn("redirect", "redirectId", redirectId);
          if (refreshed.success && refreshed.count > 0) {
            finalRow = refreshed.data[0];
            finalHeaders = refreshed.headers;
          }
          Logger.log(`[createRedirect] Auto-created Cloudflare link ${autoCfUrl} (links row ${redirectRowNumber})`);
        }
      } else {
        Logger.log(`[createRedirect] Cloudflare auto-link failed: ${cf.error}`);
      }
    }

    // Map the row data to a response object (formula-sourced after an
    // auto-link refresh; pre-write snapshot otherwise).
    const responseData = {};
    finalHeaders.forEach((header, index) => {
      responseData[header] = finalRow[index];
    });

    // Keep the response usable when formula cells are still empty (wiring gap)
    // without ever writing them to the redirect sheet.
    if (autoCfUrl && !responseData.link) responseData.link = autoCfUrl + "/";
    if (autoCfHost && !responseData.linkHost) responseData.linkHost = autoCfHost;

    // Ensure specific fields are returned
    return {
      success: true,
      data: {
        redirectId: responseData.redirectId,
        linkHost: responseData.linkHost,
        link: responseData.link,
        linkGoogleURL: responseData.linkGoogleURL,
        expiryDate: expiryDate.toISOString(), // Fixed 30-day expiry
        amount: amount, // Dynamically retrieved amount
        totalPaid: numericAmount.toFixed(2), // Initial total paid
        paymentDetails: debitResult, // Include payment details in response
        status: "ACTIVE" // Include status in response
      }
    };

  } catch (error) {
    Logger.log("Error in createRedirect function: " + error.toString());
    return {
      success: false,
      error: "Server error: " + error.toString(),
      details: {
        errorMessage: error.message,
        errorStack: error.stack,
        message: "An unexpected error occurred while creating redirect link"
      }
    };
  }
}

function renewRedirect(params) {
  try {
    const gateRevalidation = requireSetting("allowRevalidation", "redirect renewal");
    if (gateRevalidation) return gateRevalidation;
    // Validate input
    if (!params.redirectId) {
      return {
        success: false,
        error: "Redirect ID is required for renewal"
      };
    }

    // Retrieve the existing redirect link
    const existingLinkResult = getRowsByColumn("redirect", "redirectId", params.redirectId);
    
    if (!existingLinkResult.success || existingLinkResult.count === 0) {
      return {
        success: false,
        error: "Could not find redirect link to renew",
        details: existingLinkResult
      };
    }

    // Get the existing link row
    const existingLink = existingLinkResult.data[0];
    const headers = existingLinkResult.headers;

    // Find indices for relevant columns
    const expiryDateIndex = headers.indexOf("expiryDate");
    const paymentJSONIndex = headers.indexOf("paymentJSON");
    const totalPaidIndex = headers.indexOf("totalPaid");
    const statusIndex = headers.indexOf("status");

    // Check if the link is expired and update status if needed
    const currentDate = new Date();
    const expiryDate = new Date(existingLink[expiryDateIndex]);
    let currentStatus = statusIndex !== -1 ? existingLink[statusIndex] : "ACTIVE";
    
    // Get current totalPaid amount
    let currentTotalPaid = 0;
    if (totalPaidIndex !== -1 && existingLink[totalPaidIndex]) {
      currentTotalPaid = parseFloat(existingLink[totalPaidIndex]) || 0;
    }

    // Retrieve the redirect template to get renewal price
    const templateResult = getRowsByColumn("template", "templateId", "tpt01");
    
    if (!templateResult.success || templateResult.count === 0) {
      return {
        success: false,
        error: "Could not retrieve redirect template",
        details: templateResult
      };
    }

    // Extract renewal price from the template row
    const templateRow = templateResult.data[0];
    const templateHeaders = templateResult.headers;
    const renewalIndex = templateHeaders.indexOf("renewal");
    
    const renewalAmount = renewalIndex !== -1 ? templateRow[renewalIndex] : "20.00";
    const numericRenewalAmount = parseFloat(renewalAmount);

    // Debit the user for the redirect link renewal
    const debitResult = debit({
      userId: params.userId,
      amount: renewalAmount,
      purpose: "renew_redirect_link"
    });

    if (!debitResult.success) {
      return {
        success: false,
        error: "Failed to process renewal payment",
        details: debitResult
      };
    }

    // Calculate new expiry date
    const currentExpiryDate = new Date(existingLink[expiryDateIndex]);
    const newExpiryDate = new Date(currentExpiryDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Update payment JSON by appending the new payment data to existing data
    let existingPaymentJSON = [];
    if (paymentJSONIndex !== -1 && existingLink[paymentJSONIndex]) {
      try {
        existingPaymentJSON = JSON.parse(existingLink[paymentJSONIndex]);
        // Ensure it's an array
        if (!Array.isArray(existingPaymentJSON)) {
          existingPaymentJSON = [existingPaymentJSON];
        }
      } catch (e) {
        // If parsing fails, start with an empty array
        Logger.log("Failed to parse existing paymentJSON: " + e.toString());
        existingPaymentJSON = [];
      }
    }
    
    // Add the new payment to the array
    existingPaymentJSON.push(debitResult);
    
    // Calculate new totalPaid amount
    const newTotalPaid = currentTotalPaid + numericRenewalAmount;
    
    // Prepare update data
    const updateData = {
      expiryDate: newExpiryDate.toISOString(),
      updatedAt: new Date().toISOString(),
      paymentJSON: JSON.stringify(existingPaymentJSON), // Update with appended payment data
      totalPaid: newTotalPaid.toFixed(2), // Update totalPaid with new sum
      status: "ACTIVE" // Set status to ACTIVE on renewal
    };

    // Update the redirect link in the sheet using the helper method
    const updateResult = setMultipleCellDataByColumnSearch(
      "redirect", 
      "redirectId", 
      params.redirectId, 
      updateData
    );

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to update redirect link",
        details: updateResult
      };
    }

    // Retrieve the updated redirect link
    const updatedLinkResult = getRowsByColumn("redirect", "redirectId", params.redirectId);

    if (!updatedLinkResult.success || updatedLinkResult.count === 0) {
      return {
        success: false,
        error: "Could not retrieve renewed redirect link",
        details: updatedLinkResult
      };
    }

    // Get the updated row
    const updatedLink = updatedLinkResult.data[0];
    const updatedHeaders = updatedLinkResult.headers;

    // Map the row data to a response object
    const responseData = {};
    updatedHeaders.forEach((header, index) => {
      responseData[header] = updatedLink[index];
    });

    // Return success response
    return {
      success: true,
      data: {
        redirectId: params.redirectId,
        oldExpiryDate: currentExpiryDate.toISOString(),
        newExpiryDate: newExpiryDate.toISOString(),
        renewalAmount: renewalAmount,
        previousTotalPaid: currentTotalPaid.toFixed(2),
        newTotalPaid: newTotalPaid.toFixed(2),
        paymentDetails: debitResult, // Include the latest payment details in response
        paymentHistory: existingPaymentJSON, // Include full payment history
        status: "ACTIVE" // Always set to ACTIVE after renewal
      }
    };

  } catch (error) {
    Logger.log("Error in renewRedirect function: " + error.toString());
    return {
      success: false,
      error: "Server error: " + error.toString(),
      details: {
        errorMessage: error.message,
        errorStack: error.stack,
        message: "An unexpected error occurred while renewing redirect link"
      }
    };
  }
}

function addRedirectEndPages(params) {
  try {
    if (!params.redirectId || !params.paths) {
      return {
        success: false,
        error: "Missing required parameters: redirectId and paths"
      };
    }

    // Ensure new paths are in array form
    let newPaths = Array.isArray(params.paths)
      ? params.paths
      : JSON.parse(params.paths);

    // Generate a unique path using timestamp + random chars
    function generateUniquePath() {
      const timestamp = Date.now().toString(36); // compact base36
      const randomPart = Math.random().toString(36).substring(2, 6);
      return `${timestamp}${randomPart}`;
    }

    // Clean and prepare new path objects
    newPaths = newPaths.map((entry) => {
      const { redirectURL, linkHealth, inboxHealth } = entry;
      return {
        path: generateUniquePath(),
        redirectURL,
        linkHealth,
        inboxHealth,
        clicks: 0 // ← NEW
      };
    });


    // Fetch existing redirect row
    const result = getRowsByColumn("redirect", "redirectId", params.redirectId);
    if (!result.success || result.count === 0) {
      return {
        success: false,
        error: "Redirect link not found",
        details: result
      };
    }

    const row = result.data[0];
    const headers = result.headers;
    const pathsIndex = headers.indexOf("paths");

    let existingPathsRaw = row[pathsIndex];
    let existingPaths = [];

    if (existingPathsRaw && existingPathsRaw.trim()) {
      try {
        existingPaths = JSON.parse(existingPathsRaw);
        if (!Array.isArray(existingPaths)) existingPaths = [];
      } catch (e) {
        existingPaths = [];
      }
    }

    // Merge paths and update
    const combinedPaths = [...existingPaths, ...newPaths];
    const updatedPaths = JSON.stringify(combinedPaths, null, 2);

    const updateData = {
      paths: updatedPaths,
      updatedAt: new Date().toISOString()
    };

    const updateResult = setMultipleCellDataByColumnSearch(
      "redirect",
      "redirectId",
      params.redirectId,
      updateData
    );

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to update redirect paths",
        details: updateResult
      };
    }

    return {
      success: true,
      message: "Paths updated successfully",
      data: {
        redirectId: params.redirectId,
        addedCount: newPaths.length,
        totalCount: combinedPaths.length,
        updatedAt: updateData.updatedAt
      }
    };

  } catch (error) {
    Logger.log("Error in updateRedirectEndPages: " + error.toString());
    return {
      success: false,
      error: "Server error: " + error.toString(),
      details: {
        errorMessage: error.message,
        errorStack: error.stack,
        message: "Unexpected error occurred while updating paths"
      }
    };
  }
}

function updateRedirectEndPages(params) {
  try {
    const { redirectId, path, redirectURL } = params;

    if (!redirectId || !path || !redirectURL) {
      return {
        success: false,
        error: "Missing required parameters: redirectId, path, and redirectURL"
      };
    }

    // Fetch the redirect row
    const result = getRowsByColumn("redirect", "redirectId", redirectId);
    if (!result.success || result.count === 0) {
      return {
        success: false,
        error: "Redirect link not found",
        details: result
      };
    }

    const row = result.data[0];
    const headers = result.headers;
    const pathsIndex = headers.indexOf("paths");

    let pathsRaw = row[pathsIndex];
    let pathsArray = [];

    try {
      pathsArray = JSON.parse(pathsRaw);
      if (!Array.isArray(pathsArray)) throw new Error("Invalid paths format");
    } catch (e) {
      return {
        success: false,
        error: "Failed to parse paths JSON",
        details: e.toString()
      };
    }

    // Find and update the matching path object
    let found = false;
    pathsArray = pathsArray.map((entry) => {
      if (entry.path === path) {
        found = true;
        return {
          ...entry,
          redirectURL: redirectURL // Only update redirectURL
        };
      }
      return entry;
    });

    if (!found) {
      return {
        success: false,
        error: `No path entry found matching '${path}'`
      };
    }

    // Save the updated paths array
    const updatedPathsJSON = JSON.stringify(pathsArray, null, 2);
    const updateData = {
      paths: updatedPathsJSON,
      updatedAt: new Date().toISOString()
    };

    const updateResult = setMultipleCellDataByColumnSearch(
      "redirect",
      "redirectId",
      redirectId,
      updateData
    );

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to update redirect paths",
        details: updateResult
      };
    }

    return {
      success: true,
      message: "Path redirectURL updated successfully",
      data: {
        redirectId,
        path,
        newRedirectURL: redirectURL,
        updatedAt: updateData.updatedAt
      }
    };

  } catch (error) {
    Logger.log("Error in updateRedirectEndPages: " + error.toString());
    return {
      success: false,
      error: "Server error: " + error.toString(),
      details: {
        errorMessage: error.message,
        errorStack: error.stack,
        message: "Unexpected error occurred while updating redirect path"
      }
    };
  }
}

// add deleteEndPage method

// TODO----
function updateExpiredRedirectLinks() {
  try {
    // Get the active spreadsheet and the redirect sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ws = ss.getSheetByName("redirect");
    
    if (!ws) {
      throw new Error("Redirect sheet not found");
    }

    // Get all data from the sheet
    const [headers, ...rows] = ws.getDataRange().getValues();
    
    // Find indices of relevant columns
    const redirectIdIndex = headers.indexOf("redirectId");
    const expiryDateIndex = headers.indexOf("expiryDate");
    const statusIndex = headers.indexOf("status");

    // Validate column indices
    if (redirectIdIndex === -1) {
      throw new Error("redirectId column not found in sheet");
    }
    if (expiryDateIndex === -1) {
      throw new Error("expiryDate column not found in sheet");
    }
    if (statusIndex === -1) {
      throw new Error("status column not found in sheet");
    }

    // Current timestamp
    const currentTimestamp = new Date();
    
    Logger.log(`Current timestamp: ${currentTimestamp.toISOString()}`);

    // Track successful updates
    let updatedLinksCount = 0;
    let checkedLinksCount = 0;
    let alreadyExpiredCount = 0;

    // Iterate through rows and check expiry
    rows.forEach((row, index) => {
      // Skip if no redirectId
      if (!row[redirectIdIndex]) {
        return;
      }
      
      checkedLinksCount++;
      
      // Check if expiryDate exists
      if (row[expiryDateIndex]) {
        // Parse the ISO 8601 date string to ensure consistent date comparison
        let expiryDate;
        try {
          expiryDate = new Date(row[expiryDateIndex]);
          
          // Validate the parsed date
          if (isNaN(expiryDate.getTime())) {
            Logger.log(`Invalid expiry date format for ${row[redirectIdIndex]}: ${row[expiryDateIndex]}`);
            return;
          }
          
          Logger.log(`Checking redirect ${row[redirectIdIndex]}: Expiry date: ${expiryDate.toISOString()}, Current status: ${row[statusIndex]}`);
          
          // Check if the link is expired and not already marked as EXPIRED
          if (currentTimestamp > expiryDate && row[statusIndex] !== "EXPIRED") {
            // Prepare update data
            const updateData = {
              status: "EXPIRED",
              updatedAt: new Date().toISOString()
            };

            // Use helper method to update status
            const updateResult = setMultipleCellDataByColumnSearch(
              "redirect", 
              "redirectId", 
              row[redirectIdIndex], 
              updateData
            );

            // Log successful updates
            if (updateResult.success) {
              updatedLinksCount++;
              Logger.log(`Updated expired redirect link: ${row[redirectIdIndex]}, Expiry: ${expiryDate.toISOString()}`);
            } else {
              Logger.log(`Failed to update expired redirect link: ${row[redirectIdIndex]}, Error: ${JSON.stringify(updateResult)}`);
            }
          } else if (currentTimestamp > expiryDate && row[statusIndex] === "EXPIRED") {
            // Already marked as expired
            alreadyExpiredCount++;
            Logger.log(`Redirect link already marked as expired: ${row[redirectIdIndex]}`);
          }
        } catch (e) {
          Logger.log(`Error processing date for ${row[redirectIdIndex]}: ${e.message}`);
        }
      } else {
        Logger.log(`No expiry date for redirect link: ${row[redirectIdIndex]}`);
      }
    });

    // Return summary of updates
    return {
      success: true,
      message: `Checked and updated expired redirect links`,
      summary: {
        totalChecked: checkedLinksCount,
        newlyExpired: updatedLinksCount,
        alreadyExpired: alreadyExpiredCount,
        timestamp: currentTimestamp.toISOString()
      }
    };

  } catch (error) {
    Logger.log(`Error in updateExpiredRedirectLinks: ${error.message}`);
    return {
      success: false,
      error: error.message,
      details: {
        errorMessage: error.message,
        errorStack: error.stack
      }
    };
  }
}

// CUSTOM



// TOOLS



// WALLET

function getCurrentValue(amount) {
  try {
    const response = UrlFetchApp.fetch(`${API_URL}/get_exchange_rates?amount=${amount}`, { muteHttpExceptions: true });
    const result = JSON.parse(response.getContentText());
    Logger.log(result)

    if (!result.success || !result.data) {
      return { success: false, error: "Invalid response from API." };
    }

    const data = result.data;
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      success: true,
      data: {
        orderId: orderId,
        usdAmount: amount,
        btcAmount: data.btcAmount,
        ethAmount: data.ethAmount,
        usdtAmount: data.usdtAmount,
        exchangeRates: {
          BTC: data.btcRate,
          ETH: data.ethRate,
          USDT: "1.00"
        }
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function generateWalletAddresses(userId, currency) {
  try {
    // Make request to Flask API to create a wallet for the specific currency
    const options = {
      method: 'POST',
      muteHttpExceptions: true,
      contentType: 'application/json',
      payload: JSON.stringify({ userId: userId, currency: currency })
    };
    
    const response = UrlFetchApp.fetch(`${API_URL}/create_wallet`, options);
    const responseText = response.getContentText();
    Logger.log("FastAPI /create_wallet raw response: " + responseText);
    const result = JSON.parse(responseText);
    Logger.log("FastAPI /create_wallet parsed result: " + JSON.stringify(result));
    
    if (!result.success) {
      throw new Error(result.error);
    }

    const walletData = {
      userId: userId,
      network: result.data.currency,
      address: result.data.address,
      privateKey: result.data.privateKey,
      createdAt: new Date().toISOString(),
      status: 'ACTIVE'
    };
    
    const storeResult = setRowDataByHeaderMap("wallet_addresses", walletData);
    if (!storeResult.success) {
      throw new Error(`Failed to store ${currency} wallet data`);
    }
    
    return { 
      success: true, 
      data: {
        address: walletData.address,
        currency: walletData.network,
        userId: userId
      }
    };
  } catch (error) {
    Logger.log("Wallet generation error: " + error.message);
    return { success: false, error: error.message };
  }
}

function testGenerateWalletAddresses() {
  Logger.log("--- Starting testGenerateWalletAddresses ---");
  const testUserId = "rr02";
  const testCurrency = "USDT"; // Or 'BTC', 'USDT'

  const result = generateWalletAddresses(testUserId, testCurrency);

  if (result.success) {
    Logger.log(`Successfully generated wallet for ${testCurrency}:`);
    Logger.log(`Address: ${result.data.address}`);
    Logger.log(`Currency: ${result.data.currency}`);
    Logger.log(`User ID: ${result.data.userId}`);
  } else {
    Logger.log(`Failed to generate wallet: ${result.error}`);
  }
  Logger.log("--- Finished testGenerateWalletAddresses ---");
}


function initializePayment(params) {
  try {
    const { userId, amount, coinValue, currency, orderId } = params;
    
    // Generate a new wallet address for the specific currency
    const walletGenerationResult = generateWalletAddresses(userId, currency);
    if (!walletGenerationResult.success) {
      throw new Error(`Failed to generate wallet address: ${walletGenerationResult.error}`);
    }
    const userAddress = walletGenerationResult.data.address;
    
    // Create transaction record
    const txData = {
      transactionId: `tr_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: userId,
      type: 'CREDIT',
      purpose: 'add_funds',
      amount: amount, // USD amount
      coinValue: coinValue, // Crypto amount
      currency: currency,
      reference: orderId,
      address: userAddress,
      status: 'pending'
    };
    
    setRowDataByHeaderMap("transactions", txData);
    
    return {
      success: true,
      data: {
        ...txData,
        address: userAddress,
        timeRemaining: "30:00" // 30 minutes countdown
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function checkTransactionStatus() {
  const pendingTxs = getRowsByColumn("transactions", "status", "pending");
  console.log(pendingTxs);
  
  if (!pendingTxs.success || pendingTxs.count === 0) {
    console.log("No pending transactions found");
    return;
  }
  
  console.log(`Found ${pendingTxs.count} pending transactions to check`);
  
  // Get current time in UTC
  const currentTime = new Date();
  console.log(`Current time: ${currentTime.toISOString()}`);
  
  // Convert array data to objects with named properties using headers
  const transactions = pendingTxs.data.map(row => {
    const obj = {};
    pendingTxs.headers.forEach((header, index) => {
      // Skip empty header columns
      if (header && header.trim() !== '') {
        obj[header] = row[index];
      }
    });
    return obj;
  });
  
  transactions.forEach(tx => {
    try {
      console.log(`Processing transaction ${tx.transactionId}, timestamp: ${tx.timestamp}`);
      
      // First check if transaction should be expired based on timestamp
      // Parse the ISO timestamp correctly
      const createdTime = new Date(tx.timestamp);
      
      // Calculate time difference in milliseconds
      const timeDiffMs = currentTime.getTime() - createdTime.getTime();
      // Convert to hours
      const hoursDiff = timeDiffMs / (1000 * 60 * 60);
      
      console.log(`Transaction age: ${hoursDiff.toFixed(2)} hours (${timeDiffMs} ms)`);
      
      // IMPORTANT: Check if the parsed date is valid before proceeding
      if (isNaN(createdTime.getTime())) {
        console.error(`Invalid timestamp format for transaction ${tx.transactionId}: ${tx.timestamp}`);
        return; // Skip this transaction
      }
      
      // Debug the timestamps to check for issues
      console.log(`Created time: ${createdTime.toISOString()}`);
      console.log(`Current time: ${currentTime.toISOString()}`);
      console.log(`Difference: ${hoursDiff.toFixed(2)} hours`);
      
      // If transaction is older than 2 hours, mark as expired without checking blockchain
      if (hoursDiff >= 2) {
        console.log(`EXPIRING: Transaction ${tx.transactionId} is expired (age: ${hoursDiff.toFixed(2)} hours)`);
        setMultipleCellDataByColumnSearch("transactions", "id", tx.id, {
          status: "expired",
          updatedOn: new Date().toISOString(),
          found: "FALSE"
        });
        console.log(`Transaction ${tx.transactionId} marked as expired`);
        return; // Skip further processing for this transaction
      }
      
      console.log(`Transaction ${tx.transactionId} is not expired, checking blockchain status...`);
      
      // Only check blockchain for non-expired transactions
      const apiUrl = `${API_URL}/check_transaction`;
      const payload = {
        address: tx.address,
        amount: tx.coinValue,
        currency: tx.currency,
        transaction_id: tx.transactionId
      };
      
      const options = {
        'method': 'post',
        'contentType': 'application/json',
        'payload': JSON.stringify(payload)
      };
      
      console.log(`API POST request to: ${apiUrl} with payload:`, JSON.stringify(payload));
      const response = UrlFetchApp.fetch(apiUrl, options);
      const result = JSON.parse(response.getContentText());
      console.log(response.getContentText())
      console.log(result)
      
      if (!result.success) {
        console.error(`API error for transaction ${tx.transactionId}: ${result.error}`);
        return;
      }
      
      const status = result.data;
      
      // Handle confirmed transactions
      if (status.confirmed) {
        console.log(`Transaction ${tx.transactionId} is confirmed with hash ${status.txHash}`);
        
        // Check if we've already processed this transaction hash
        if (status.txHash) {
          const isDuplicate = checkExistingTransaction(status.txHash);
          if (isDuplicate) {
            console.log(`Transaction ${tx.transactionId} is a duplicate (txHash: ${status.txHash})`);
            setMultipleCellDataByColumnSearch("transactions", "id", tx.id, {
              status: "expired",
              updatedOn: new Date().toISOString(),
              found: "FALSE"
            });
            return; // Skip further processing for this transaction
          }
        }
        
        // Update transaction status
        setMultipleCellDataByColumnSearch("transactions", "id", tx.id, {
          status: "completed",
          txHash: status.txHash,
          updatedOn: new Date().toISOString(),
          found: "TRUE"
        });

        // Notify the admin when a user's wallet deposit is confirmed (opt-in via
        // allowNotifyWalletFund setting). Fire-and-forget — never blocks the credit loop.
        notifyAdmin("WalletFund", "Wallet Funded", {
          userId: tx.userId || tx.user_id || "",
          currency: tx.currency || "",
          amount: tx.coinValue || tx.amount || "",
          txRef: tx.transactionId || tx.reference || tx.id || "",
          txHash: status.txHash || "",
        });

        console.log(`Transaction ${tx.transactionId} marked as completed with hash ${status.txHash}`);
      } else {
        console.log(`Transaction ${tx.transactionId} still pending (age: ${hoursDiff.toFixed(2)} hours)`);
      }
    } catch (error) {
      console.error(`Error checking transaction ${tx.transactionId}:`, error);
      console.error(`Error stack: ${error.stack}`);
    }
  });
}

function checkExistingTransaction(txHash) {
  const existingTx = getRowsByColumn("transactions", "txHash", txHash);
  return existingTx.success && existingTx.count > 0;
}


function getUserWalletAddress(userId, network) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("wallet_addresses");
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const networkIndex = headers.indexOf("network");
  const addressIndex = headers.indexOf("address");

  if (networkIndex === -1 || addressIndex === -1) {
    Logger.log("Required columns not found in headers.");
    return null;
  }

  const addresses = getRowsByColumn("wallet_addresses", "userId", userId).data;
  // Logger.log("All addresses for user: " + JSON.stringify(addresses, null, 2));

  for (let i = addresses.length - 1; i >= 0; i--) {
    const row = addresses[i];
    if (row[networkIndex] === network) {
      Logger.log("Found address: " + row[addressIndex] + " on network: " + network);
      return row[addressIndex];
    }
  }

  Logger.log("No matching address found for network: " + network);
  return null;
}

function buyUsAdrink(params) {
  try {
    Logger.log("Starting buyUsAdrink with params:", params);
    const { userId, amount } = params;

    if (!userId || !amount) {
      return {
        success: false,
        error: "Missing required fields: userId and amount are required"
      };
    }

    // Validate amount is a positive number
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return {
        success: false,
        error: "Invalid amount. Amount must be a positive number."
      };
    }

    // Debit the user
    const debitResult = debit({
      userId,
      amount: parsedAmount.toFixed(2), // Ensure amount is formatted as string with 2 decimal places
      purpose: "buy a drink"
    });
    Logger.log("buyUsAdrink: debitResult: " + JSON.stringify(debitResult));

    if (!debitResult.success) {
      Logger.log("buyUsAdrink: Debit failed, returning error.");
      if (debitResult.details && debitResult.details.message && debitResult.details.message.includes("Insufficient balance")) {
        return {
          success: false,
          error: "Failed to buy a drink: Insufficient funds.",
          details: debitResult.details
        };
      }
      return {
        success: false,
        error: "Failed to buy a drink: " + (debitResult.error || "Failed to process transaction."),
        details: debitResult.details || {}
      };
    }

    // Ensure changes are flushed to the spreadsheet before re-fetching balance
    SpreadsheetApp.flush();
    Logger.log("buyUsAdrink: Spreadsheet flushed.");

    // Re-fetch user data to get the automatically updated balance
    const updatedUserResult = getRowsByColumn("user", "userId", userId);
    Logger.log("buyUsAdrink: updatedUserResult after flush: " + JSON.stringify(updatedUserResult));

    if (!updatedUserResult.success || updatedUserResult.count === 0) {
      Logger.log("buyUsAdrink: Failed to re-fetch user data after debit.");
      // This case should ideally not happen if debit was successful, but as a safeguard
      return {
        success: true, // Debit was successful, but couldn't fetch new balance
        message: "Thanks for buying us a drink! Could not retrieve updated balance.",
        data: {
          newBalance: "N/A",
          transactionId: debitResult.transactionId // Include transactionId from debit result
        }
      };
    }

    const updatedUserRow = updatedUserResult.data[0];
    const updatedHeaders = updatedUserResult.headers;
    const balanceIndex = updatedHeaders.indexOf("balance");
    const newBalance = balanceIndex !== -1 ? updatedUserRow[balanceIndex] : "N/A";
    Logger.log("buyUsAdrink: New balance retrieved: " + newBalance);

    const finalResponse = {
      success: true,
      message: "Thanks for buying us a drink!",
      data: {
        amount: parsedAmount.toFixed(2), // Return the amount debited
        newBalance: newBalance,
        transactionId: debitResult.transactionId
      }
    };
    Logger.log("buyUsAdrink: Final response object: " + JSON.stringify(finalResponse));
    return finalResponse;

  } catch (error) {
    Logger.log("Error in buyUsAdrink:", error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}

function testBuyUsAdrink() {
  // IMPORTANT: Replace with a valid userId from your 'user' sheet for testing
  const testUserId = "rr03"; // Example userId, replace with an actual one
  const testAmount = 5.00; // Example amount

  Logger.log(`Testing buyUsAdrink for userId: ${testUserId} with amount: ${testAmount}`);

  const result = buyUsAdrink({
    userId: testUserId,
    amount: testAmount
  });

  Logger.log("testBuyUsAdrink result: Success: " + result.success);
  if (result.message) {
    Logger.log("testBuyUsAdrink result: Message: " + result.message);
  }
  if (result.data) {
    Logger.log("testBuyUsAdrink result: Data: " + JSON.stringify(result.data, null, 2));
  }
  if (result.error) {
    Logger.log("testBuyUsAdrink result: Error: " + result.error);
  }
  return result;
}


/**
 * Processes a debit transaction after checking the user balance.
 * This version only reads the balance and logs a simulated transaction without modifying it.
 * 
 * @param {Object} params - The parameters for the debit.
 * @param {string} params.userId - The user ID.
 * @param {string} params.amount - The amount to debit (in USD).
 * @param {string} params.purpose - The purpose of the debit (e.g., 'buy_drink').
 * @param {string} [params.reference] - Optional reference for the transaction.
 * @return {Object} - Result of the transaction.
 */
function debit(params) {
  try {
    // Ensure userId is provided either through params or via an active session.
    if (!params.userId) {
      const userSession = getActiveUserSession();
      if (userSession && userSession.userId) {
        params.userId = userSession.userId;
      } else {
        return {
          success: false,
          error: "User not authenticated",
          details: {
            missingParams: ["userId"],
            message: "No userId provided and no active session found"
          }
        };
      }
    }
    
    // Validate required parameters
    if (!params.amount || !params.purpose) {
      return {
        success: false,
        error: "Missing required parameters",
        details: {
          missingParams: [
            !params.amount ? "amount" : null,
            !params.purpose ? "purpose" : null
          ].filter(Boolean),
          message: "Required parameters are missing"
        }
      };
    }
    
    // Parse debit amount as a float.
    const debitAmount = parseFloat(params.amount);
    if (isNaN(debitAmount) || debitAmount <= 0) {
      return {
        success: false,
        error: "Invalid amount: must be a positive number",
        details: {
          providedAmount: params.amount,
          parsedAmount: debitAmount,
          message: "Amount must be a positive number"
        }
      };
    }
    
    Logger.log(`Processing debit for user ${params.userId}, amount: $${debitAmount}, purpose: ${params.purpose}`);
    
    // Fetch user data using your helper (it returns the raw row from the "user" sheet).
    const userResult = getRowsByColumn("user", "userId", params.userId);
    if (!userResult.success || userResult.count === 0) {
      return {
        success: false,
        error: "User not found",
        details: {
          userId: params.userId,
          lookupResult: userResult,
          message: "No user found with the provided ID"
        }
      };
    }
    
    // Get the raw user row array.
    const user = userResult.data[0];
    
    // Get the headers from the "user" sheet dynamically.
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const balanceIndex = headers.indexOf("balance");
    
    if (balanceIndex === -1) {
      return {
        success: false,
        error: "Balance column not found in user sheet",
        details: { headers: headers }
      };
    }
    
    // Read and safely parse the user's balance.
    const rawBalance = user[balanceIndex];
    Logger.log("Raw balance value: " + rawBalance);
    
    const currentBalance = parseFloat(rawBalance ? rawBalance.toString().replace(/[^\d.-]/g, '') : "0") || 0;
    Logger.log(`User ${params.userId} current balance: $${currentBalance.toFixed(2)}`);
    
    // Check if the user has sufficient funds - ensure resulting balance doesn't go below 0.
    const resultingBalance = currentBalance - debitAmount;
    if (resultingBalance < 0) {
      return {
        success: false,
        error: `Insufficient balance: $${currentBalance.toFixed(2)} available, $${debitAmount.toFixed(2)} required`,
        details: {
          currentBalance: currentBalance.toFixed(2),
          requiredAmount: debitAmount.toFixed(2),
          shortfall: Math.abs(resultingBalance).toFixed(2),
          message: "Transaction would result in negative balance. Minimum balance is $0.00"
        }
      };
    }
    
    // Create a debit transaction record (simulation)
    const txData = {
      transactionId: `tr_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: params.userId,
      type: 'DEBIT',
      purpose: params.purpose,
      amount: debitAmount,
      coinValue: "", // No coinValue for debits
      currency: "USD",
      reference: params.reference || "",
      txHash: "", // Not applicable here
      updatedOn: "", // Not applicable for immediate transactions
      status: "completed" // For simulation, we mark as completed immediately
    };
    
    Logger.log("Creating transaction record: " + JSON.stringify(txData));
    
    // Record the transaction using your helper (assumes setRowDataByHeaderMap exists).
    const txResult = setRowDataByHeaderMap("transactions", txData);
    if (!txResult.success) {
      return {
        success: false,
        error: "Failed to record transaction",
        details: {
          transactionData: txData,
          dbResult: txResult,
          message: txResult.error || "Unknown database error"
        }
      };
    }
    
    // NOTE: We're not updating the user's balance here.
    Logger.log(`Successfully processed debit for user ${params.userId}. Balance remains unchanged.`);
    
    return {
      success: true,
      transactionId: txData.transactionId,
      newBalance: (currentBalance - debitAmount).toFixed(2), // For reference
      data: {
        transactionId: txData.transactionId,
        timestamp: txData.timestamp,
        userId: params.userId,
        type: "DEBIT",
        purpose: params.purpose,
        amount: debitAmount,
        newBalance: (currentBalance - debitAmount).toFixed(2),
        previousBalance: currentBalance.toFixed(2)
      }
    };
    
  } catch (error) {
    Logger.log("Error in debit function: " + error.toString());
    return {
      success: false,
      error: "Server error: " + error.toString(),
      details: {
        errorMessage: error.message,
        errorStack: error.stack,
        message: "An unexpected error occurred while processing the transaction"
      }
    };
  }
}

function testDebitMethod() {
  const testUserId = "rr03"; // Replace with an actual test user ID present in your "user" sheet
  
  // Log the starting test.
  Logger.log("=== Starting debit() Test ===");
  
  // Prepare test parameters.
  const testParams = {
    userId: testUserId,
    amount: "50.00",
    purpose: "Test purchase",
    reference: "test_tx_123"
  };
  
  // Call the debit() function.
  const result = debit(testParams);
  
  // Log the result in formatted JSON.
  Logger.log("Test Debit Result: " + JSON.stringify(result, null, 2));
}
// SETTINGS



