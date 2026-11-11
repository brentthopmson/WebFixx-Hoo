// ============================
// SUPPORT.js — Chatbot + Ticket System
// ============================

/**
 * Send a ticket-related email notification
 * @param {string} toEmail - recipient email
 * @param {string} subject - email subject
 * @param {string} body - email body
 */
function sendTicketEmail(toEmail, subject, body) {
  if (!toEmail) return;
  try {
    MailApp.sendEmail({
      to: toEmail,
      name: "WebFixx Support",
      subject: subject,
      body: body
    });
    Logger.log("[SUPPORT] Email sent to " + toEmail + ": " + subject);
  } catch (error) {
    Logger.log("[SUPPORT] sendTicketEmail error: " + error.message);
  }
}

/**
 * Look up a user's email from the user sheet
 * @param {string} userId
 * @returns {string} email or empty string
 */
function getUserEmail(userId) {
  try {
    var result = getRowsByColumn("user", "userId", userId);
    if (result && result.success && result.data && result.data.length > 0) {
      var headers = result.headers;
      var row = result.data[0];
      return row[headers.indexOf("email")] || "";
    }
  } catch (e) {
    Logger.log("[SUPPORT] getUserEmail error: " + e.message);
  }
  return "";
}

/**
 * Create a support ticket
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.username
 * @param {string} params.email
 * @param {string} params.category - campaigns|billing|projects|account|technical|general
 * @param {string} params.subCategory - specific issue type
 * @param {string} params.entityId - campaignId, projectId, etc. (optional)
 * @param {Array}  params.messages - [{role, content, ts}]
 * @param {string} params.address - wallet/email (optional)
 * @param {string} params.amount - monetary amount (optional)
 * @param {string} params.reference - transaction hash, etc. (optional)
 * @returns {{ success: boolean, supportId: string }}
 */
function createTicket(params) {
  try {
    var userId = params.userId;
    var category = params.category;
    var subCategory = params.subCategory || "";
    var entityId = params.entityId || "";
    var messages = params.messages || [];
    var address = params.address || "";
    var amount = params.amount || "";
    var reference = params.reference || "";
    var username = params.username || "";
    var email = params.email || "";

    if (!userId || !category) {
      return { success: false, error: "Missing userId or category" };
    }

    var supportId = "TKT-" + userId.slice(0, 8) + "-" + Date.now().toString(36);
    var now = new Date().toISOString();

    setRowDataByHeaderMap("support", {
      supportId: supportId,
      timestamp: now,
      userId: userId,
      category: category,
      subCategory: subCategory,
      entityId: entityId,
      messages: JSON.stringify(messages),
      address: address,
      amount: amount,
      reference: reference,
      updatedOn: now,
      status: "open"
    });

    // Telegram notification
    sendSupportNotification(supportId, username, category, subCategory, reference);

    // Email confirmation to user
    if (email) {
      sendTicketEmail(email, "Support Ticket Received — " + supportId,
        "Hi " + username + ",\n\n" +
        "Your support ticket has been received.\n\n" +
        "Ticket ID: " + supportId + "\n" +
        "Category: " + category + "\n" +
        "Issue: " + (subCategory || "General") + "\n\n" +
        "We'll get back to you shortly.\n\n" +
        "— WebFixx Support"
      );
    }

    // Clear user chat (conversation now lives in ticket)
    setMultipleCellDataByColumnSearch("user", "userId", userId, {
      chat: JSON.stringify({ lastTopic: "", lastMessages: [], lastInteraction: "" })
    });

    return { success: true, supportId: supportId };
  } catch (error) {
    Logger.log("[SUPPORT] createTicket error: " + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get tickets (user sees own, admin sees all)
 * @param {Object} params
 * @param {string} params.userId
 * @param {boolean} params.isAdmin
 * @returns {{ success: boolean, headers: Array, data: Array, count: number }}
 */
function getTickets(params) {
  try {
    if (params.isAdmin) {
      return getAllRows("support");
    }
    return getRowsByColumn("support", "userId", params.userId);
  } catch (error) {
    Logger.log("[SUPPORT] getTickets error: " + error.message);
    return { success: false, error: error.message, headers: [], data: [], count: 0 };
  }
}

/**
 * Update ticket (admin reply / status change)
 * @param {Object} params
 * @param {string} params.supportId
 * @param {string} params.status - open|in_progress|resolved|closed
 * @param {string} params.adminReply
 * @param {string} params.adminId
 * @param {Array}  params.messages - updated conversation
 * @returns {{ success: boolean }}
 */
function updateTicket(params) {
  try {
    var supportId = params.supportId;
    if (!supportId) return { success: false, error: "Missing supportId" };

    var updates = { updatedOn: new Date().toISOString() };
    if (params.status) updates.status = params.status;
    if (params.adminReply) updates.adminReply = params.adminReply;
    if (params.adminId) updates.adminId = params.adminId;
    if (params.messages) updates.messages = JSON.stringify(params.messages);

    setMultipleCellDataByColumnSearch("support", "supportId", supportId, updates);

    // Email notification to user on status change or admin reply
    try {
      var ticketRows = getRowsByColumn("support", "supportId", supportId);
      var ticketUserId = "";
      if (ticketRows && ticketRows.success && ticketRows.data && ticketRows.data.length > 0) {
        ticketUserId = ticketRows.data[0][ticketRows.headers.indexOf("userId")] || "";
      }
      if (ticketUserId) {
        var userEmail = getUserEmail(ticketUserId);
        if (userEmail) {
          var emailSubject = "Ticket Update — " + supportId;
          var emailBody = "";
          if (params.status) {
            emailBody = "Your ticket " + supportId + " status has been updated to: " + params.status + ".\n\n— WebFixx Support";
          }
          if (params.messages && Array.isArray(params.messages)) {
            var adminMsgs = params.messages.filter(function(m) { return m.role === "admin"; });
            var lastAdmin = adminMsgs[adminMsgs.length - 1];
            if (lastAdmin) {
              emailSubject = "New Reply on Ticket — " + supportId;
              emailBody = "New reply on ticket " + supportId + ":\n\n\"" + lastAdmin.content + "\"\n\n— WebFixx Support";
            }
          }
          if (emailBody) {
            sendTicketEmail(userEmail, emailSubject, emailBody);
          }
        }
      }
    } catch (e) {
      Logger.log("[SUPPORT] updateTicket email notification error: " + e.message);
    }

    return { success: true };
  } catch (error) {
    Logger.log("[SUPPORT] updateTicket error: " + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Save chat context to user's "chat" column
 * Keeps up to 20 most recent messages
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.lastTopic
 * @param {Array}  params.lastMessages - [{role, content, ts}]
 * @returns {{ success: boolean }}
 */
function saveChatContext(params) {
  try {
    var userId = params.userId;
    if (!userId) return { success: false, error: "Missing userId" };

    var trimmed = (params.lastMessages || []).slice(-20);

    setMultipleCellDataByColumnSearch("user", "userId", userId, {
      chat: JSON.stringify({
        lastTopic: params.lastTopic || "",
        lastMessages: trimmed,
        lastInteraction: new Date().toISOString()
      })
    });
    return { success: true };
  } catch (error) {
    Logger.log("[SUPPORT] saveChatContext error: " + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get chat context from user's "chat" column
 * @param {Object} params
 * @param {string} params.userId
 * @returns {{ success: boolean, chat: Object|null }}
 */
function getChatContext(params) {
  try {
    var userId = params.userId;
    if (!userId) return { success: true, chat: null };

    var result = getCachedRows("user", 300);
    var userIdx = result.headers.indexOf("userId");
    if (userIdx === -1) return { success: true, chat: null };

    var userRow = result.data.find(function(r) { return r[userIdx] === userId; });
    if (!userRow) return { success: true, chat: null };

    var chatIdx = result.headers.indexOf("chat");
    var chatData = chatIdx !== -1 ? userRow[chatIdx] : "";

    if (!chatData) return { success: true, chat: null };

    try {
      return { success: true, chat: JSON.parse(chatData) };
    } catch (e) {
      return { success: true, chat: null };
    }
  } catch (error) {
    Logger.log("[SUPPORT] getChatContext error: " + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get user context for AI injection
 * @param {string} userId
 * @returns {Object} user context
 */
function getUserSupportContext(userId) {
  try {
    var userResult = getCachedRows("user", 300);
    var campaignResult = getCachedRows("campaigns", 300);
    var projectResult = getCachedRows("projects", 300);

    // Find user row from cached data
    var userRow = null;
    var userIdx = userResult.headers.indexOf("userId");
    if (userIdx !== -1) {
      var found = userResult.data.find(function(r) { return r[userIdx] === userId; });
      if (found) {
        userRow = {};
        userResult.headers.forEach(function(h, i) { userRow[h] = found[i]; });
      }
    }

    // Filter campaigns from cached data
    var campaignUserIdIdx = campaignResult.headers.indexOf("userId");
    var userCampaigns = campaignUserIdIdx !== -1
      ? campaignResult.data.filter(function(r) { return r[campaignUserIdIdx] === userId; })
      : [];

    var campaignCount = userCampaigns.length;
    var activeCampaigns = 0;
    var statusIdx = campaignResult.headers.indexOf("status");
    if (statusIdx !== -1) {
      activeCampaigns = userCampaigns.filter(function(r) {
        var s = r[statusIdx] ? r[statusIdx].toLowerCase() : "";
        return s === "running" || s === "processing";
      }).length;
    }

    // Filter projects from cached data
    var projectUserIdIdx = projectResult.headers.indexOf("userId");
    var projectCount = projectUserIdIdx !== -1
      ? projectResult.data.filter(function(r) { return r[projectUserIdIdx] === userId; }).length
      : 0;

    return {
      username: userRow ? (userRow.username || "User") : "User",
      email: userRow ? (userRow.email || "") : "",
      plan: userRow ? (userRow.plan || "free") : "free",
      planExpiry: userRow ? (userRow.planExpiry || "") : "",
      balance: userRow ? (userRow.balance || "0") : "0",
      pendingBalance: userRow ? (userRow.pendingBalance || "0") : "0",
      campaignCount: campaignCount,
      activeCampaigns: activeCampaigns,
      projectCount: projectCount
    };
  } catch (error) {
    Logger.log("[SUPPORT] getUserSupportContext error: " + error.message);
    return { username: "User", email: "", plan: "free", balance: "0", campaignCount: 0, activeCampaigns: 0, projectCount: 0 };
  }
}

/**
 * Send Telegram notification for new ticket
 */
function sendSupportNotification(supportId, username, category, subCategory, reference) {
  try {
    var token = getSettingValue("webFixxTelegramBot");
    var chatId = getSettingValue("webFixxTelegramChatId");
    if (!token || !chatId) return;

    var text = "\ud83c\udfab *New Support Ticket*\n\n" +
      "*Ticket:* " + supportId + "\n" +
      "*User:* " + (username || "Unknown") + "\n" +
      "*Category:* " + category + "\n" +
      "*Issue:* " + subCategory + "\n" +
      (reference ? "*Reference:* " + reference + "\n" : "") +
      "*Time:* " + new Date().toLocaleString();

    // sendMediaAndMessageToTelegram expects a payload object ({method, chat_id, text}),
    // not a raw chat id as the first argument.
    var payload = { method: "sendMessage", chat_id: chatId, text: text, parse_mode: "Markdown" };
    sendMediaAndMessageToTelegram(payload, null, getSettingValue("webFixxTelegramBot"));
  } catch (e) {
    Logger.log("[SUPPORT] Telegram notification failed: " + e.message);
  }
}
