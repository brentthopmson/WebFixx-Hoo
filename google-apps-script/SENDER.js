// STAGE4 (Sender)
// 1. Based on status call function
// 2. "APP" = SEND EMAIL USING the app level authentication (credentials.json) file. (External API)
// 3. "API" = SEND EMAIL USING multiuser Gmail API access sender.
// 4. "SMTP" = SEND EMAIL USING python/node transporter for multi-email provider. (External API)
// 5. "CRAWLER" = SEND EMAIL USING Puppeteer. (External API)
// 6. SET VALUE TO SHEET BASED ON RESPONSE.



// https://gist.github.com/tanaikech/0745889227e43c385d190385fff91598  SEND OUTLOOK  https://github.com/tanaikech/OnedriveApp
// SEND GMAIL 


function sendEmailUsingAPI() {
  const url = 'https://mailu.vercel.app/send-email'; // Replace with your server's URL

  const emailData = {
    receiverEmail: 'recipient@example.com',
    subject: 'Your email subject',
    body: 'Your email body',
    smtpSettings: {
      server: 'smtp.example.com',
      port: 587,
      username: 'your_username',
      password: 'your_password',
      sender: 'sender@example.com',
    },
  };

  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(emailData),
  };

  const response = UrlFetchApp.fetch(url, options);
  const content = response.getContentText();
  Logger.log(content); // Log the response content
  
  // You can further process the 'content' variable as needed
}




function sendEmailsFromSheet() {
  //const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MAILER");
  const sheet = SpreadsheetApp.openById('1y7_yT1OEdkTEeEEk_JCLbAEtPAVH9RKTXiQclkE6ugU').getSheetByName('MAILER');
  const data = sheet.getDataRange().getDisplayValues();
  const userEmail = Session.getActiveUser().getEmail();
  Logger.log(userEmail);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const recipientEmailAddress = row[2]; // recipientEmailAddress
    const stamp = row[24]; // stamp
    const shouldSend = row[25]; // shouldSend
    const shooterUniqueName = row[50]; // shooter Unique Name
    const subjectTemplate = row[51]; // subjectTemplate
    const plainMessageTemplate = row[52]; // plainMessageTemplate
    const htmlMessageTemplate = row[53]; // htmlMessageTemplate
    const replyTo = row[55] || userEmail; // replyTo (defaults to user email if blank)
    const shooterEmail = row[82]; // shooterEmail

    if (shooterEmail === userEmail && shouldSend === "ACTIVE" && stamp === "") {
      try {
        // Choose the desired method here, e.g., sendEmailWithPlainTextOnlyAndReplyto
        sendEmailWithPlainTextOnly({
          from: {
            name: shooterUniqueName,
            email: shooterEmail,
          },
          to: {
            email: recipientEmailAddress,
          },
          subject: subjectTemplate,
          body: {
            plainText: plainMessageTemplate,
            html: htmlMessageTemplate,
          },
          replyTo: replyTo,
        });

        sheet.getRange(i + 1, 25).setValue(new Date());
        Logger.log(`Email sent to ${recipientEmailAddress}`);
      } catch (error) {
        Logger.log(`Failed to send email to ${recipientEmailAddress}: ${error}`);
      }
    }
  }
}

function sendEmailWithPlainTextOnlyAndReplyto(input) {
  const message = 
    'MIME-Version: 1.0\r\n' +
    `To: <${input.to.email}>\r\n` +
    `From: "${input.from.name}" <${input.from.email}>\r\n` +
    `Reply-To: <${input.replyTo}>\r\n` +
    `Subject: ${input.subject}\r\n` +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    `${input.body.plainText}\r\n`;

  sendRequest(message);
}

function sendEmailWithHTMLOnlyAndReplyto(input) {
  const message = 
    'MIME-Version: 1.0\r\n' +
    `To: <${input.to.email}>\r\n` +
    `From: "${input.from.name}" <${input.from.email}>\r\n` +
    `Reply-To: <${input.replyTo}>\r\n` +
    `Subject: ${input.subject}\r\n` +
    'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
    `${input.body.html}\r\n`;

  sendRequest(message);
}

function sendEmailWithPlainTextAndAttachmentAndReplyto(input, attachment) {
  const boundary = "__boundary__";
  const message = 
    'MIME-Version: 1.0\r\n' +
    `To: <${input.to.email}>\r\n` +
    `From: "${input.from.name}" <${input.from.email}>\r\n` +
    `Reply-To: <${input.replyTo}>\r\n` +
    `Subject: ${input.subject}\r\n` +
    'Content-Type: multipart/mixed; boundary="' + boundary + '"\r\n\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    `${input.body.plainText}\r\n\r\n` +
    '--' + boundary + '\r\n' +
    'Content-Type: ' + attachment.mimeType + '; name="' + attachment.name + '"\r\n' +
    'Content-Disposition: attachment; filename="' + attachment.name + '"\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    attachment.base64 + '\r\n\r\n' +
    '--' + boundary + '--';

  sendRequest(message);
}

function sendEmailWithHTMLAndAttachmentAndReplyto(input, attachment) {
  const boundary = "__boundary__";
  const message = 
    'MIME-Version: 1.0\r\n' +
    `To: <${input.to.email}>\r\n` +
    `From: "${input.from.name}" <${input.from.email}>\r\n` +
    `Reply-To: <${input.replyTo}>\r\n` +
    `Subject: ${input.subject}\r\n` +
    'Content-Type: multipart/mixed; boundary="' + boundary + '"\r\n\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
    `${input.body.html}\r\n\r\n` +
    '--' + boundary + '\r\n' +
    'Content-Type: ' + attachment.mimeType + '; name="' + attachment.name + '"\r\n' +
    'Content-Disposition: attachment; filename="' + attachment.name + '"\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    attachment.base64 + '\r\n\r\n' +
    '--' + boundary + '--';

  sendRequest(message);
}


function sendEmailWithPlainTextOnly(input) {
  const message = 
    'MIME-Version: 1.0\r\n' +
    `To: <${input.to.email}>\r\n` +
    `From: <${input.from.email}>\r\n` +  // Use only the email address for 'From'
    `Subject: ${input.subject}\r\n` +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    `${input.body.plainText}\r\n`;

  sendRequest(message);
}


// function sendEmailWithPlainTextOnly(input) {
//   const message = 
//     'MIME-Version: 1.0\r\n' +
//     `To: <${input.to.email}>\r\n` +
//     `From: "${input.from.name}" <${input.from.email}>\r\n` +
//     `Subject: ${input.subject}\r\n` +
//     'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
//     `${input.body.plainText}\r\n`;

//   sendRequest(message);
// }

function sendEmailWithHTMLOnly(input) {
  const message = 
    'MIME-Version: 1.0\r\n' +
    `To: <${input.to.email}>\r\n` +
    `From: "${input.from.name}" <${input.from.email}>\r\n` +
    `Subject: ${input.subject}\r\n` +
    'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
    `${input.body.html}\r\n`;

  sendRequest(message);
}


function sendRequest(message) {
  const params = {
    method: "post",
    contentType: "message/rfc822",
    headers: {
      "Authorization": "Bearer " + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true,
    payload: message
  };

  try {
    const resp = UrlFetchApp.fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send", params);
    Logger.log("Email sent.");
    Logger.log(resp.getContentText()); // Log the response for debugging
  } catch (error) {
    Logger.log("Error: " + error.message);
  }
}
