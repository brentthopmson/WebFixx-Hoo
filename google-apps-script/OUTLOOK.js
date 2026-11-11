// MOVE TO WEBFIXX DASHBOARD


//https://gist.github.com/tanaikech/45a5511cf2a4a42660b52b3409f7b537

function retrieveAllOutlookEmails() {
  // 1. Retrieve mail list using OnedriveApp.
  const obj = {
    select: ["createdDateTime", "sender", "subject", "bodyPreview"],
    orderby: "createdDateTime",
    order: "asc",
  };

  const prop = PropertiesService.getScriptProperties();
  const odapp = OnedriveApp.init(prop);
  const res = odapp.getEmailList(obj);

  // 2. Convert object to array for putting to Spreadsheet.
  const headers = ["createdDateTime", "sender", "subject", "bodyPreview", "id"];
  const values = res.reduce(
    (ar, e) =>
      ar.concat([
        headers.map((h) =>
          h == "createdDateTime"
            ? new Date(e[h])
            : h == "sender"
            ? e[h]
              ? `${e[h].emailAddress.address}(${e[h].emailAddress.name})`
              : ""
            : e[h] || ""
        ),
      ]),
    [headers]
  );

  // 3. Put the values to Spreadsheet.
  const ssId = "###"; // Please set the Spreadsheet ID.
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName("Sheet1"); // Please set the sheet name.
  sheet
    .clearContents()
    .getRange(1, 1, values.length, values[0].length)
    .setValues(values);
}





//Email of Microsoft Graph API
//These methods manage Email.


//1. Get Email message list
function getOutlookEmailMessageList() {
const obj = {
  numberOfEmails: 1,
  select: ["createdDateTime", "sender", "subject", "bodyPreview"],
  orderby: "createdDateTime",
  order: "desc",
  folderId: "###",
};

const prop = PropertiesService.getScriptProperties();
const odapp = OnedriveApp.init(prop);
const res = odapp.getEmailList(obj);
console.log(res);
}
//This method retrieves email list of your Microsoft account using Microsoft Graph API.

//About the properties of obj, you can see the following explanation.

//numberOfEmails: Number of output email in the list. If the properties of numberOfEmails and folderId are not used, all email messages are retrieved.
//select: Properties you want to retrieve for each email of list. When you use ["*"]`, all properties are retrieved. But in this case, the process time is longer. Please be careful this.
//orderby: When this is used, the list is ordered by the value of orderby.
//order: desc or asc.
//folderId: When you use this property, you can retrieve the email list from the specific folder of Email. About the method for retrieving the folder ID, please check "Forward Email messages". When you don't use this property, all emails are retrieved as a list.
//Sample script: This is a sample script for retrieving all emails from own emails of Microsoft and put to the Google Spreadsheet.


//2. Get Email messages
//This method retrieves email messages of your Microsoft account using message IDs with Microsoft Graph API. As an important point of this method, in this method, the multiple emails can be retrieved using the batch request.

function getOutlookEmailMessageByID() {
const ar = ["messageId1", "messageId2", , ,];

const prop = PropertiesService.getScriptProperties();
const odapp = OnedriveApp.init(prop);
const res = odapp.getEmailMessages(ar);
console.log(res);
}
//The argument of getEmailMessages(ar) is an array including the message IDs. You can retrieve the message IDs with the method of getEmailList.

//3. Send Email messages
//This method sends email messages using Microsoft Graph API with your Microsoft account. As an important point of this method, in this method, the multiple emails can be sent using the batch request.

function sendOutlookEmailMessage() {
const obj = [
  {
    to: [{ name: "### name ###", email: "### email address ###" }, , ,],
    subject: "sample subject 1",
    body: "sample text body",
    cc: [{ name: "name1", email: "emailaddress1" }, , ,],
  },
  {
    to: [{ name: "### name ###", email: "### email address ###" }, , ,],
    subject: "sample subject 2",
    htmlBody: "<u><b>sample html body</b></u>",
    attachments: [blob],
    bcc: [{ name: "name1", email: "emailaddress1" }, , ,],
  },
];

const prop = PropertiesService.getScriptProperties();
const odapp = OnedriveApp.init(prop);
const res = odapp.sendEmails(obj);
console.log(res);
}
//About the properties of obj, you can see the following explanation.

//to: Email address of recipient. You can set the values as an array. subject: Email subject. body: Text body. htmlBody: HTML body. In this case, as the current specification of Microsoft Graph API, it seems that both the text body and the HTML body cannot be used. So please use one of them. attachments: For example, when you want to use the file on Google Drive, you can use DriveApp.getFileById("### file ID ###").getBlob(). cc: Email addresses to CC. bcc: Email addresses to BCC.


//4. Reply Email messages
//This method replies email messages using Microsoft Graph API with your Microsoft account. As an important point of this method, in this method, the multiple emails can be replied using the batch request.

function replyOutlookEmailMessage() {
const obj = [
  {
    to: [{ name: "### name ###", email: "### email address ###" }],
    body: "Sample replying message",
    messageId: "###",
  },
];

const prop = PropertiesService.getScriptProperties();
const odapp = OnedriveApp.init(prop);
const res = odapp.replyEmails(obj);
console.log(res);
}
//About the properties of obj, you can see the following explanation.

//The properties of obj are the same with Send Email messages. But, in this case, please include messageId to reply to the email message.


//5. Forward Email messages
//This method forwards email messages using Microsoft Graph API with your Microsoft account. As an important point of this method, in this method, the multiple emails can be forwarded using the batch request.

function forwardOutlookEmailMessage() {
const obj = [
  {
    to: [{ name: "### name ###", email: "### email address ###" }],
    messageId: "###",
  },
];

const prop = PropertiesService.getScriptProperties();
const odapp = OnedriveApp.init(prop);
const res = odapp.forwardEmails(obj);
console.log(res);
}
//About the properties of obj, you can see the following explanation.

//The properties of obj are the same with Send Email messages. But, in this case, please include messageId to reply to the email message.


//6. Get Email folders
//This method retrieves the folders of Email of your Microsoft account.

function getOutlookEmailFolders() {
const prop = PropertiesService.getScriptProperties();
const odapp = OnedriveApp.init(prop);
const res = odapp.getEmailFolders();
console.log(res);
}

//7. Delete Email messages
//This method deletes the email messages of your Microsoft account. As an important point of this method, in this method, the multiple emails can be deleted using the batch request.

function deleteOutlookEmailMessage() {
const ar = ["messageId1", "messageId2", , ,];

const prop = PropertiesService.getScriptProperties();
const odapp = OnedriveApp.init(prop);
const res = odapp.deleteEmails(ar);
console.log(res);
}
//Please set the message IDs you want to delete. You can retrieve the message IDs with the method of getEmailList.


