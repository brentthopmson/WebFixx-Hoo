// MOVE TO WEBFIXX DASHBOARD

// Global variables
var batchSize = 20; // Set the batch size
var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Gmail Inbox');
var existingEmails = {}; // Use an object to store existing email subjects as keys for efficient lookup

function exportEmailsToSheet() {
  //var remainingQuota = GmailApp.getRemainingDailyQuota();
  //if (remainingQuota > 0) {
  var existingData = sheet.getDataRange().getValues();

  // Extract existing email subjects into the existingEmails object
  for (var i = 1; i < existingData.length; i++) {
    existingEmails[existingData[i][0]] = true; // Assuming email subjects are in the first column (adjust if needed)
  }

  processBatch();
  //} else {
    // Handle scenario when the quota is exhausted for the day
    //Logger.log("Quota exceeded for the day. Script will not run.");
  //}
}



function processBatch() {
  var threads = GmailApp.getInboxThreads();
  var newData = [];

  for (var i = 0; i < threads.length && newData.length < batchSize; i++) {
    var messages = threads[i].getMessages();

    for (var j = 0; j < messages.length && newData.length < batchSize; j++) {
      var msg = messages[j];
      var subject = msg.getSubject();

      if (!existingEmails[subject]) {
        var to = msg.getTo();
        var cc = msg.getCc();
        var bcc = msg.getBcc();
        var replyTo = msg.getReplyTo();
        var date = msg.getDate();
        var from = msg.getFrom();
        var body = msg.getPlainBody();
        var messageId = msg.getId();
        var htmlBody = msg.getBody();

        var attachments = msg.getAttachments();
        var attachmentLinks = [];

        for (var k = 0; k < attachments.length; k++) {
          var attachment = attachments[k];
          var attachmentLink = attachment.getUrl();
          attachmentLinks.push(attachmentLink);
        }

        newData.push([subject, body, from, to, cc, bcc, replyTo, date, messageId, htmlBody, attachmentLinks.join('\n')]);
        existingEmails[subject] = true;
      }
    }
  }

  if (newData.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newData.length, newData[0].length).setValues(newData);
    // Check if there are more threads left to process
    if (GmailApp.getInboxThreads().length > 0) {
      // Reschedule the function to run again after a certain interval (5 minutes in this case)
      ScriptApp.newTrigger("processBatch").timeBased().after(5 * 60 * 1000).create();
    }
  }
}
