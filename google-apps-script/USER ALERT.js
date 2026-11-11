function alertUsers() {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
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

// Function to send a message via Telegram
function sendTelegramMessage(chatId, message) {
  var payload = {
    method: "post",
    payload: {
      chat_id: chatId,
      text: message
    }
  };
  var botToken = getSettingValue("webFixxTelegramBot");
  if (!botToken) { Logger.log("[sendTelegramMessage] No bot token in SETTINGS"); return; }
  UrlFetchApp.fetch("https://api.telegram.org/bot" + botToken + "/sendMessage", payload);
}

// Function to send an email
function sendEmail(emailAddress, subject, body) {
  MailApp.sendEmail(emailAddress, subject, body);
}





/// TELEGRAM MEDIA /// NOTIFY ADVERTS AND EXPIRY
function sendMediaAndMessageToTelegramTEST() {
  var token = getSettingValue("webFixxTelegramBot");
  var chatId = 'RECIPIENT_CHAT_ID'; // The chat ID of the recipient

  var apiUrl = 'https://api.telegram.org/bot' + token + '/sendDocument'; // Change the method to suit the type of media

  var mediaFile = UrlFetchApp.fetch('DIRECT_URL_TO_YOUR_MEDIA').getBlob(); // Replace with the direct URL to your media

  var messageText = 'This is your message text'; // Replace with your desired message
  var caption = 'Caption for your media'; // Replace with your desired caption
  var parseMode = 'Markdown'; // Optional: Change to 'HTML' for HTML formatting
  var replyMarkup = {
    'keyboard': [
      ['Button 1', 'Button 2'],
      ['Button 3']
    ],
    'resize_keyboard': true
  }; // Optional: Replace with your desired reply markup

  var payload = {
    'method': 'post',
    'payload': {
      'chat_id': chatId,
      'document': mediaFile,
      'caption': caption,
      'parse_mode': parseMode,
      'reply_markup': replyMarkup,
      'text': messageText // Adding the text message along with the media
      // Add more optional parameters as needed (e.g., 'video', 'photo', 'caption_entities', etc.)
    }
  };

  var response = UrlFetchApp.fetch(apiUrl, payload);
  Logger.log(response.getContentText()); // Log the response (optional)
}





/// DISCORD ///
function sendDiscordMessage() {
  var discordToken = 'MTE4ODIyNjI3Nzc4Njc3OTY4OA.Gda7Tb.v2MWH4LGJNB3WSsPUroSkABMUhC4VTW_f28RVo'; // Replace with your bot token
  var userId = 'communitygovr'; // Replace with the user's ID

  var message = {
    content: 'Hello, friend! This is a direct message from Google Apps Script.' // Your message here
  };

  var url = 'https://discord.com/api/v10/users/@me/channels';
  var params = {
    method: 'POST',
    headers: {
      'Authorization': 'Bot ' + discordToken,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ recipient_id: userId }),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, params);
  var responseData = JSON.parse(response.getContentText());
  var channelId = responseData.id;

  // Send message to the created DM channel
  url = 'https://discord.com/api/v10/channels/' + channelId + '/messages';
  params.payload = JSON.stringify(message);

  UrlFetchApp.fetch(url, params);
}





/// DISCORD ///
function sendDiscordMessage() {
  var discordToken = 'MTE4ODIyNjI3Nzc4Njc3OTY4OA.Gda7Tb.v2MWH4LGJNB3WSsPUroSkABMUhC4VTW_f28RVo'; // Replace with your bot token
  var userId = 'communitygovr'; // Replace with the user's ID

  var message = {
    content: 'Hello, friend! This is a direct message from Google Apps Script.' // Your message here
  };

  var url = 'https://discord.com/api/v10/users/@me/channels';
  var params = {
    method: 'POST',
    headers: {
      'Authorization': 'Bot ' + discordToken,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ recipient_id: userId }),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, params);
  var responseData = JSON.parse(response.getContentText());
  var channelId = responseData.id;

  // Send message to the created DM channel
  url = 'https://discord.com/api/v10/channels/' + channelId + '/messages';
  params.payload = JSON.stringify(message);

  UrlFetchApp.fetch(url, params);
}
