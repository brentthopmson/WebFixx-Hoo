// https://github.com/twitterdev/Twitter-API-v2-sample-code/tree/main

// MAIN BOT

function contentBot() {
  // Replace 'YOUR_SPREADSHEET_ID' and 'Sheet1' with your actual spreadsheet ID and sheet name.
  var spreadsheet = SpreadsheetApp.openById('17cjaHx93z3ciGAdgJ4AvkjgIwI9gP3RsfJU5G7exp-U');
  var sheet = spreadsheet.getSheetByName('BOT');

  // Get all values from the sheet
  var data = sheet.getDataRange().getValues();

  // Define the start and end row for processing
  var startRow = 2;  // Start processing from row 2 (assuming headers are in row 1)
  var endRow = Math.min(data.length, 8761);  // Adjust the endRow based on your requirement

  // Process data in chunks
  for (var rowIndex = startRow - 1; rowIndex < endRow; rowIndex++) {
    var row = data[rowIndex];


    // Process Twitter if one row per execution if it meets a specific condition
    if (shouldProcessTwitterRow(row)) {
      //processTwitterRow(sheet, row, rowIndex + 1);

      // Log progress (optional)
      //Logger.log('Processed row ' + (rowIndex + 1));
    }
    // Process Discord if one row per execution if it meets a specific condition
    if (shouldProcessDiscordRow(row)) {
      //processDiscordRow(sheet, row, rowIndex + 1);

      // Log progress (optional)
      //Logger.log('Processed row ' + (rowIndex + 1));
    }
    // Process Discord if one row per execution if it meets a specific condition
    if (shouldProcessTelegramRow(row)) {
      processTelegramRow(sheet, row, rowIndex + 1);

      // Log progress (optional)
      //Logger.log('Processed row ' + (rowIndex + 1));
    }
    else{}
  }
}

// SHOULDS (Reasons to process row, in order to reduce numRow for faster execution time.)

function shouldProcessTwitterRow(row) {
  // Define your condition for processing a row

    var date = new Date();
    var dateAndTime = row[6];
    var sheetDate = new Date(dateAndTime);

    Sdate=Utilities.formatDate(date,"GMT+1", "MM/dd/yyyy HH:mm")
    SsheetDate=Utilities.formatDate(sheetDate,'GMT+1','MM/dd/yyyy HH:mm')

    //Logger.log(SToday+' =? '+postingDate )
  // For example, process only rows where the value in column A is greater than 10
  return (row[50] === "ACTIVE" && row[9] != "" && SsheetDate < Sdate && row[29] === "");
}

function shouldProcessDiscordRow(row) {
  // Define your condition for processing a row

    var date = new Date();
    var dateAndTime = row[6];
    var sheetDate = new Date(dateAndTime);

    Sdate=Utilities.formatDate(date,"GMT+1", "MM/dd/yyyy HH:mm")
    SsheetDate=Utilities.formatDate(sheetDate,'GMT+1','MM/dd/yyyy HH:mm')
  // For example, process only rows where the value in column A is greater than 10
  return (row[50] === "ACTIVE" && row[9] != "" && SsheetDate < Sdate && row[30] === "");
}

function shouldProcessTelegramRow(row) {
  // Define your condition for processing a row

    var date = new Date();
    var dateAndTime = row[6];
    var sheetDate = new Date(dateAndTime);

    Sdate=Utilities.formatDate(date,"GMT+1", "MM/dd/yyyy HH:mm")
    SsheetDate=Utilities.formatDate(sheetDate,'GMT+1','MM/dd/yyyy HH:mm')
  // For example, process only rows where the value in column A is greater than 10
  return (row[50] === "ACTIVE" && row[9] != "" && SsheetDate < Sdate && row[31] === "");
}



// PROCESSORS (For each Social environment provider).


// For Twitter


function processTwitterRow(sheet, row, rowIndex) {
  // Access different cell data in the row array
    
    var id = row[0]
    var catID = row[1]
    var ddMM = row[2]
    var postingDate = row[3]
    var postingDay = row[4]
    var postingTime = row[5]
    var dateAndTime = row[6]
    var contentClass = row[7]
    var topicORQuestion = row[8]
    var thread1 = row[9]
    var thread1Media = row[10]
    var thread2 = row[11]
    var thread2Media = row[12]
    var thread3 = row[13]
    var thread3Media = row[14]
    var thread4 = row[15]
    var thread4Media = row[16]
    var thread5 = row[17]
    var thread5Media = row[18]
    var relatedUrl = row[19]
    var description= row[20]
    var extraColumn = row[21]
    var extraColumn = row[22]
    var extraColumn = row[23]
    var extraColumn = row[24]
    var extraColumn = row[25]
    var extraColumn = row[26]
    var extraColumn = row[27]
    var extraColumn = row[28]
    var twitterSTAMP = row[29]
    var discordSTAMP = row[30]
    var extraColumn = row[31]
    var extraColumn = row[32]
    var extraColumn = row[33]
    var extraColumn = row[34]
    var extraColumn = row[35]
    var extraColumn = row[36]
    var extraColumn = row[37]
    var extraColumn = row[38]
    var extraColumn = row[39]
    var extraColumn = row[40]
    var extraColumn = row[41]
    var extraColumn = row[42]
    var extraColumn = row[43]
    var extraColumn = row[44]
    var extraColumn = row[45]
    var extraColumn = row[46]
    var extraColumn = row[47]
    var extraColumn = row[48]
    var extraColumn = row[49]
    var contentStatus = row[50]
    var extraColumn = row[51]
    var extraColumn = row[52]
    var extraColumn = row[53]
    var extraColumn = row[54]
    var extraColumn = row[55]
    var twitterID1 = row[56]
    var twitterID2 = row[57]
    var twitterID3 = row[58]
    var twitterID4 = row[59]
    var twitterID5 = row[60]
    var extraColumn = row[61]
    var extraColumn = row[62]
    var extraColumn = row[63]
    var extraColumn = row[64]
    var extraColumn = row[65]
    var extraColumn = row[66]
    var extraColumn = row[67]
    var extraColumn = row[68]
    var extraColumn = row[69]
    var extraColumn = row[70]

    var date = new Date();
    var sheetDate = new Date(dateAndTime);

    Sdate=Utilities.formatDate(date,"GMT+1", "MM/dd/yyyy HH:mm")
    SsheetDate=Utilities.formatDate(sheetDate,'GMT+1','MM/dd/yyyy HH:mm')
    SToday=Utilities.formatDate(date,"GMT+1", "MM/dd/yyyy")
    //Logger.log(SToday+' =? '+postingDate )

    var service = getTwitterService();

  // CHECK IF TWITTER HAS NO ACCESS (NEEDS AUTHORIZATION), RETURN CONFIRMATION URL
  if (!service.hasAccess()){
    var authorizationUrl = service.getAuthorizationUrl();
    Logger.log('Open the following URL and re-run the script: %s',
        authorizationUrl);
  }
  //// MAIN IF FUNCTION
  else if (thread1 != "" && postingDate  === SToday && SsheetDate < Sdate && twitterSTAMP  === "" &&  service.hasAccess()){

    //////////////////////////Upload Images///////////////////////////////////////////////////////
        if (thread1Media == 0 || thread1Media == null){                                     //If no image URLs are listed...                                                                            
          console.log("No images detected!");                                                   //Log no images detected  
        } else {                                                                                //If image URLs are listed...
          try{                                                                                  //Attempt to upload images from URLs
            var mediaId = new Array(0);                                                         //IDs for uploads, will be CSVs
            var imgs = thread1Media.split(",");                                               //Split URL string into individual links
            console.log(imgs.length + " images detected!");                                     //Log number of images to upload
            for (i in imgs){                                                                    //For each image detected...
              console.log("processing upload: " + imgs[i]);                                     //Log the upload
              var blob = UrlFetchApp.fetch(imgs[i]).getBlob();                                  //Get URL and convert to Blob format
              //var imageId = service.uploadMedia(blob);                                          //set imageID variable to pass through .uploadMedia
              
              // Upload the media file to Twitter.
              var imageId = UrlFetchApp.fetch('https://api.twitter.com/2/media/upload', {
                media: blob
              });

              if (imageId) {                                                                    //If imageId is valid...
                if (i == 0) {                                                                   //If it's the first image...
                  mediaId = mediaId + imageId.media_id_string;                                  //get media ID (used to tweet image)
                } else if (i < 4) {                                                             //If it's the second, third, or fourth image
                  mediaId = mediaId + "," + imageId.media_id_string;                            //get media ID
                  console.log(imageId.media_id_string + " uploaded");                           //log media ID number
                } else {                                                                        //If 4 images have already been added to mediaId...
                  console.log("Maximum Image (4) already attached! " + 
                          imageId.media_id_string + " NOT included");                          //Prevents tweet error for more than 4 images
                }
              } else {                                                                          //If imageId is not found...
                console.log("Image upload FAILED!");                                            //log failure
              }
            }                                                                                   //next image
            console.log("MEDIA ID(s): " + mediaId);                                             //Log number of successful uploads
            params.media_ids = mediaId;                                                         //set media_ids to string value containing uploaded IDs
          } catch (e) {                                                                         //If image upload fails (bad URL, etc)...  
            console.log("FAILURE! Error captured: " + e);                                       //Catch and log error             
          }            
      }

      
      // great. now we have our media ID
      //Logger.log(mediaid);

      // ...and append media from there


        // TWITTER PAY LOAD WITH MEDIA 
        // var payload = {
          // text:postBody,
          // "media": {
          //   "media_ids": mediaId
          // }
        // }
        var thread1 = thread1+" "+relatedUrl
        //Logger.log(thread1)

    // SEND FIRST TWEET //

        // TWITTER PAY LOAD
        var payload = {
          text:thread1
          }
        //Logger.log(payload)

        // https://developer.twitter.com/en/docs/twitter-api/users/lookup/api-reference/get-users-by-username-username
        var url = `https://api.twitter.com/2/tweets`;
        var response = UrlFetchApp.fetch(url, {
          method:'POST',
          'contentType': 'application/json',
          headers: {
            Authorization: 'Bearer ' + service.getAccessToken()
          },
          muteHttpExceptions: true,
          payload: JSON.stringify(payload)
        });
        var result = JSON.parse(response.getContentText());
        // Logger.log(result)

        var replyTo1 = result.data.id;
        //Logger.log(replyTo1)
        sheet.getRange(rowIndex, 57).setValue(replyTo1)




    // SEND SECOND TWEET //

      if (thread2  != "" &&  service.hasAccess()){

        // TWITTER PAY LOAD
        var payload = {
          "reply": {"in_reply_to_tweet_id": replyTo1},
          text:thread2 
          }
        //Logger.log(payload)

        // https://developer.twitter.com/en/docs/twitter-api/users/lookup/api-reference/get-users-by-username-username
        var url = `https://api.twitter.com/2/tweets`;
        var response = UrlFetchApp.fetch(url, {
          method:'POST',
          'contentType': 'application/json',
          headers: {
            Authorization: 'Bearer ' + service.getAccessToken()
          },
          muteHttpExceptions: true,
          payload: JSON.stringify(payload)
        });
        var result = JSON.parse(response.getContentText());
        //Logger.log(result)

        var replyTo2 = result.data.id;
        //Logger.log(replyTo2)
        sheet.getRange(rowIndex, 58).setValue(replyTo2)

      }


    // SEND THIRD TWEET //

      if (thread3 != "" &&  service.hasAccess()){

        // TWITTER PAY LOAD
        var payload = {
          "reply": {"in_reply_to_tweet_id": replyTo2},
          text:thread3
          }
        //Logger.log(payload)

        // https://developer.twitter.com/en/docs/twitter-api/users/lookup/api-reference/get-users-by-username-username
        var url = `https://api.twitter.com/2/tweets`;
        var response = UrlFetchApp.fetch(url, {
          method:'POST',
          'contentType': 'application/json',
          headers: {
            Authorization: 'Bearer ' + service.getAccessToken()
          },
          muteHttpExceptions: true,
          payload: JSON.stringify(payload)
        });
        var result = JSON.parse(response.getContentText());
        //Logger.log(result)

        var replyTo3 = result.data.id;
        //Logger.log(replyTo3)
        sheet.getRange(rowIndex, 59).setValue(replyTo3)

      }




    // SEND FOURTH TWEET //

      if (thread4 != "" &&  service.hasAccess()){

        // TWITTER PAY LOAD
        var payload = {
          "reply": {"in_reply_to_tweet_id": replyTo3},
          text:thread4
          }
        //Logger.log(payload)

        // https://developer.twitter.com/en/docs/twitter-api/users/lookup/api-reference/get-users-by-username-username
        var url = `https://api.twitter.com/2/tweets`;
        var response = UrlFetchApp.fetch(url, {
          method:'POST',
          'contentType': 'application/json',
          headers: {
            Authorization: 'Bearer ' + service.getAccessToken()
          },
          muteHttpExceptions: true,
          payload: JSON.stringify(payload)
        });
        var result = JSON.parse(response.getContentText());
        //Logger.log(result)

        var replyTo4 = result.data.id;
        //Logger.log(replyTo4)
        sheet.getRange(rowIndex, 60).setValue(replyTo4)

      }



    // SEND FIFTH TWEET //

      if (thread5 != "" &&  service.hasAccess()){

        // TWITTER PAY LOAD
        var payload = {
          "reply": {"in_reply_to_tweet_id": replyTo4},
          text:thread5
          }
        //Logger.log(payload)

        // https://developer.twitter.com/en/docs/twitter-api/users/lookup/api-reference/get-users-by-username-username
        var url = `https://api.twitter.com/2/tweets`;
        var response = UrlFetchApp.fetch(url, {
          method:'POST',
          'contentType': 'application/json',
          headers: {
            Authorization: 'Bearer ' + service.getAccessToken()
          },
          muteHttpExceptions: true,
          payload: JSON.stringify(payload)
        });
        var result = JSON.parse(response.getContentText());
        //Logger.log(result)

        var replyTo5 = result.data.id;
        //Logger.log(replyTo5)
        sheet.getRange(rowIndex, 61).setValue(replyTo5)

        }

      sheet.getRange(rowIndex, 30).setValue(Sdate)
     //Logger.log('SENT :'+emailAddress+'  '+subject+'  '+message);
  }
}


// For Discord

function processDiscordRow(sheet, row, rowIndex) {

  // Access different cell data in the row array
    
    var id = row[0]
    var catID = row[1]
    var ddMM = row[2]
    var postingDate = row[3]
    var postingDay = row[4]
    var postingTime = row[5]
    var dateAndTime = row[6]
    var contentClass = row[7]
    var topicORQuestion = row[8]
    var thread1 = row[9]
    var thread1Media = row[10]
    var thread2 = row[11]
    var thread2Media = row[12]
    var thread3 = row[13]
    var thread3Media = row[14]
    var thread4 = row[15]
    var thread4Media = row[16]
    var thread5 = row[17]
    var thread5Media = row[18]
    var relatedUrl = row[19]
    var trendingTags = row[20]
    var extraColumn = row[21]
    var extraColumn = row[22]
    var extraColumn = row[23]
    var extraColumn = row[24]
    var extraColumn = row[25]
    var extraColumn = row[26]
    var extraColumn = row[27]
    var extraColumn = row[28]
    var twitterSTAMP = row[29]
    var discordSTAMP = row[30]
    var extraColumn = row[31]
    var extraColumn = row[32]
    var extraColumn = row[33]
    var extraColumn = row[34]
    var extraColumn = row[35]
    var extraColumn = row[36]
    var extraColumn = row[37]
    var extraColumn = row[38]
    var extraColumn = row[39]
    var extraColumn = row[40]
    var extraColumn = row[41]
    var extraColumn = row[42]
    var extraColumn = row[43]
    var extraColumn = row[44]
    var extraColumn = row[45]
    var extraColumn = row[46]
    var extraColumn = row[47]
    var extraColumn = row[48]
    var extraColumn = row[49]
    var contentStatus = row[50]
    var extraColumn = row[51]
    var extraColumn = row[52]
    var extraColumn = row[53]
    var extraColumn = row[54]
    var extraColumn = row[55]
    var twitterID1 = row[56]
    var twitterID2 = row[57]
    var twitterID3 = row[58]
    var twitterID4 = row[59]
    var twitterID5 = row[60]
    var extraColumn = row[61]
    var extraColumn = row[62]
    var extraColumn = row[63]
    var extraColumn = row[64]
    var extraColumn = row[65]
    var extraColumn = row[66]
    var discordID1 = row[67]
    var extraColumn = row[68]
    var extraColumn = row[69]
    var extraColumn = row[70]

    var date = new Date();
    var sheetDate = new Date(dateAndTime);

    Sdate=Utilities.formatDate(date,"GMT+1", "MM/dd/yyyy HH:mm")
    SsheetDate=Utilities.formatDate(sheetDate,'GMT+1','MM/dd/yyyy HH:mm')
    SToday=Utilities.formatDate(date,"GMT+1", "MM/dd/yyyy")
    //Logger.log(SToday+' =? '+postingDate )

    var service = getTwitterService();

  // CHECK IF TWITTER HAS NO ACCESS (NEEDS AUTHORIZATION), RETURN CONFIRMATION URL
  if (!service.hasAccess()){
    var authorizationUrl = service.getAuthorizationUrl();
    Logger.log('Open the following URL and re-run the script: %s',
        authorizationUrl);
  }

  else if(thread1 != "" && postingDate  === SToday && SsheetDate < Sdate && discordSTAMP  === "" &&  service.hasAccess()){
      var discordWebhook = getSettingValue("discordWebhookURL");
      if (!discordWebhook) {
        Logger.log("[contentBot] discordWebhookURL not set in SETTINGS — skipping Discord post for row " + rowIndex);
        return;
      }
      const url = discordWebhook;
      const message = {
        content: thread1
      }
      const options = {
        'method': 'post',
        'payload': message
      }
      const res = UrlFetchApp.fetch(url,options)
    //Logger.log(res)
      sheet.getRange(rowIndex, 68).setValue(res)

      sheet.getRange(rowIndex, 31).setValue(Sdate)
     //Logger.log('SENT :'+emailAddress+'  '+subject+'  '+message);

  }
  else{}
}


// For Telegram

function processTelegramRow(sheet, row, rowIndex) {
    Logger.log('Processing TG MSG');

  // Access different cell data in the row array
    
    var id = row[0]
    var catID = row[1]
    var ddMM = row[2]
    var postingDate = row[3]
    var postingDay = row[4]
    var postingTime = row[5]
    var dateAndTime = row[6]
    var contentClass = row[7]
    var topicORQuestion = row[8]
    var thread1 = row[9]
    var thread1Media = row[10]
    var thread2 = row[11]
    var thread2Media = row[12]
    var thread3 = row[13]
    var thread3Media = row[14]
    var thread4 = row[15]
    var thread4Media = row[16]
    var thread5 = row[17]
    var thread5Media = row[18]
    var relatedUrl = row[19]
    var trendingTags = row[20]
    var urlTitle = row[52]
    var telegramSTAMP = row[31]
    var contentStatus = row[50]

    var chatId = getSettingValue("webFixxTelegramGroupChatId");
    if (!chatId) {
      Logger.log("[contentBot] webFixxTelegramGroupChatId not set in SETTINGS — skipping Telegram post for row " + rowIndex);
      return;
    }

    var date = new Date();
    var sheetDate = new Date(dateAndTime);

    Sdate=Utilities.formatDate(date,"GMT+1", "MM/dd/yyyy HH:mm")
    SsheetDate=Utilities.formatDate(sheetDate,'GMT+1','MM/dd/yyyy HH:mm')
    SToday=Utilities.formatDate(date,"GMT+1", "MM/dd/yyyy")

  if(thread1 != "" && postingDate === SToday && SsheetDate < Sdate && telegramSTAMP === ""){
    
      var textPayload = {
          'method': 'sendMessage',
          'chat_id': chatId,
          'text': thread1 + '\n\n' + thread2 + '\n\n' + thread3 + '\n\n' + thread4 + '\n\n<a href="' + relatedUrl + '">' + urlTitle + '</a>',
          'parse_mode': 'HTML'
      };

    var token = getSettingValue("webFixxTelegramBot");
      sendMediaAndMessageToTelegram(textPayload, null, token);

  }

  if(thread1Media != "" && postingDate === SToday && SsheetDate < Sdate && telegramSTAMP === ""){
    
      var mediaPayload = {
        'method': 'sendDocument',
        'chat_id': chatId,
        'document': thread1Media,
        'caption': contentClass,
        'parse_mode': 'Markdown'
      };

      //sendMediaAndMessageToTelegram(null, mediaPayload);

  }

      sheet.getRange(rowIndex, 32).setValue(Sdate)
}