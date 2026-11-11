/**
 * NOTIFY.js — shared admin-notification gateway for the WebFixx Apps Script backend.
 *
 * Sends opt-in Telegram alerts to the admin chat (`webFixxTelegramChatId` from the
 * SETTINGS sheet) for application-level events: logins, home/login page visits, and
 * wallet funding. Each event is gated by a `allowNotifyXxx` settings flag so admins
 * can turn individual notifications on/off from the Admin Settings panel
 * (AdminSettingsPanel auto-renders any settingsKey prefixed with "allow" as a switch).
 *
 * Reuses the existing cross-file helper `sendMediaAndMessageToTelegram` (AUTH.js).
 */

/**
 * Fire a fire-and-forget admin notification (never blocks / never throws to the caller).
 *
 * @param {string} eventName - Logical event id, e.g. "Login", "SiteVisit", "WalletFund".
 * @param {string} title - Human-readable heading for the message.
 * @param {Object} fields - Key/value pairs to include in the message body.
 */
function notifyAdmin(eventName, title, fields) {
  try {
    // 1. Respect the admin toggle: allowNotify{EventName}. Blank/missing => enabled (safe).
    var toggleKey = "allowNotify" + eventName;
    if (!isSettingEnabled(toggleKey)) {
      Logger.log("[notifyAdmin] Skipped '" + eventName + "' (toggle '" + toggleKey + "' is OFF).");
      return;
    }

    // 2. Debounce per event (+ its natural dedupe key) so visit storms don't spam the chat.
    var dedupeKey = eventName + ":" + (fields.ip || fields.userId || fields.txRef || "");
    var cache = CacheService.getScriptCache();
    var cacheKey = "notify_" + dedupeKey;
    if (cache.get(cacheKey)) {
      Logger.log("[notifyAdmin] Debounced duplicate for '" + dedupeKey + "'.");
      return;
    }
    // Per-event debounce window: 60s for high-frequency events (visits), else 30s default.
    var ttlSeconds = eventName === "SiteVisit" ? 60 : 30;
    cache.put(cacheKey, "1", ttlSeconds);

    // 3. Resolve bot token + admin chat id from SETTINGS.
    var token = getSettingValue("webFixxTelegramBot");
    var chatId = getSettingValue("webFixxTelegramChatId");
    if (!token || !chatId) {
      Logger.log("[notifyAdmin] Skipped '" + eventName + "': webFixxTelegramBot/webFixxTelegramChatId not set.");
      return;
    }

    // 4. Build a compact Markdown message.
    var lines = ["*" + title + "*"];
    fields = fields || {};
    Object.keys(fields).forEach(function (key) {
      var val = fields[key];
      if (val !== undefined && val !== null && String(val) !== "") {
        lines.push("*" + key + ":* " + String(val));
      }
    });
    lines.push("*Time:* " + new Date().toISOString());
    var text = lines.join("\n");

    var textPayload = {
      method: "sendMessage",
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown",
    };
    // sendMediaAndMessageToTelegram is defined in AUTH.js and reads the bot token from SETTINGS;
    // the payload's chat_id is sourced from SETTINGS, matching how the rest of the app alerts.
    sendMediaAndMessageToTelegram(textPayload, null, token);
    Logger.log("[notifyAdmin] Sent '" + eventName + "' to chat " + chatId + ".");
  } catch (error) {
    Logger.log("[notifyAdmin] Error sending '" + eventName + "': " + error.message);
  }
}