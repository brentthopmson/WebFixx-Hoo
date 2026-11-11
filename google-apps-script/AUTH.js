function sendMediaAndMessageToTelegram(textPayload, mediaPayload, token) {
  if (!token) token = getSettingValue("webFixxTelegramBot");
  if (!token) {
    Logger.log("[sendMediaAndMessageToTelegram] No bot token provided or found in SETTINGS.");
    return null;
  }
  var apiUrl = 'https://api.telegram.org/bot' + token;
  var messageId = null;

  if (textPayload) {
    var textUrl = apiUrl + '/sendMessage';
    var textOptions = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(textPayload)
    };
    var textResponse = UrlFetchApp.fetch(textUrl, textOptions);
    var textContent = JSON.parse(textResponse.getContentText());
    messageId = textContent.result.message_id; // Extract message ID from the response
    Logger.log(textContent); // Log the text message response (optional)
  }

  if (mediaPayload) {
    var mediaUrl = apiUrl + '/sendDocument';
    var mediaOptions = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(mediaPayload)
    };
    var mediaResponse = UrlFetchApp.fetch(mediaUrl, mediaOptions);
    Logger.log(mediaResponse.getContentText()); // Log the media message response (optional)
  }

  return messageId;
}


// Function to delete a message on Telegram
function deleteTelegramMessage(messageId, token) {
  if (!token) token = getSettingValue("webFixxTelegramBot");
  if (!token) {
    Logger.log("[deleteTelegramMessage] No bot token provided or found in SETTINGS.");
    return null;
  }
  var apiUrl = 'https://api.telegram.org/bot' + token + '/deleteMessage';

  var deleteOptions = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify({
      'chat_id': '-1002084026677',  // Replace with your chat ID
      'message_id': messageId
    })
  };

  var deleteResponse = UrlFetchApp.fetch(apiUrl, deleteOptions);
  Logger.log(deleteResponse.getContentText()); // Log the delete message response (optional)
}




///// TWITER AUTH ///

const TWITTER_CLIENT_ID = 'bDAwQWtsUjNESFdweHRwQ2MtY2Y6MTpjaQ'
const TWITTER_CLIENT_SECRET = '4p2UISsJSQxB5TLKciLVFkgkUL5hCZ3LI0-RPVA1U2u46Mdp6g'
/**
 * Create the OAuth2 Twitter Service
 * @return OAuth2 service
 */
function getTwitterService(){
  var userProps = PropertiesService.getUserProperties();
  pkceChallengeVerifier();
  return OAuth2.createService('twitter')
        .setAuthorizationBaseUrl('https://twitter.com/i/oauth2/authorize')
        .setTokenUrl('https://api.twitter.com/2/oauth2/token?code_verifier=' + userProps.getProperty("code_verifier"))
  // Set the client ID and secret.
          .setClientId(TWITTER_CLIENT_ID)
          .setClientSecret(TWITTER_CLIENT_SECRET)
          .setCallbackFunction('authCallback')
  // Set the property store where authorized tokens should be persisted.
          .setPropertyStore(userProps)
          // Set the scopes to request (space-separated for Twitter services).
          .setScope('users.read tweet.read offline.access tweet.write')
    
          // Add parameters in the authorization url
          .setParam('response_type', 'code')
          .setParam('code_challenge_method', 'S256')
          .setParam('code_challenge', userProps.getProperty("code_challenge"))
  .setTokenHeaders({
            'Authorization': 'Basic ' + Utilities.base64Encode(TWITTER_CLIENT_ID + ':' + TWITTER_CLIENT_SECRET),
            'Content-Type': 'application/x-www-form-urlencoded'
          })
}
/**
 * Reset the OAuth2 Twitter Service
 */
function resetTwitter() {
  getTwitterService().reset();
  PropertiesService.getUserProperties().deleteProperty("code_challenge");
  PropertiesService.getUserProperties().deleteProperty("code_verifier");
}
/**
 * Generate PKCE Challenge Verifier for Permission for OAuth2 Twitter Service
 */
function pkceChallengeVerifier(){
  var userProps = PropertiesService.getUserProperties();
  if(!userProps.getProperty('code_verifier')){
    var verifier = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    for(var i =0;i<128 ;i++){
      verifier += possible.charAt(Math.floor(Math.random() * possible.length));
    }
  var sha256hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, verifier);
  var challenge = Utilities.base64Encode(sha256hash)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
  userProps.setProperty("code_verifier", verifier)
    userProps.setProperty("code_challenge", challenge)
  }
}
/**
 * Handles the OAuth callback.
 */
function authCallback(request) {
  var service = getTwitterService();
  var authorized = service.handleCallback(request);
  if (authorized) {
    return HtmlService.createHtmlOutput('Success!');
  } else {
    return HtmlService.createHtmlOutput('Denied');
  }
}







var GITHUB_CLIENT_ID = 'YOUR_GITHUB_CLIENT_ID';
var GITHUB_CLIENT_SECRET = 'YOUR_GITHUB_CLIENT_SECRET';
var VERCEL_CLIENT_ID = 'YOUR_VERCEL_CLIENT_ID';
var VERCEL_CLIENT_SECRET = 'YOUR_VERCEL_CLIENT_SECRET';

// Function to get the OAuth2 service for GitHub or Vercel
function getOAuth2Service(serviceName) {
  var clientId, clientSecret, authorizationBaseUrl, tokenUrl;
  
  if (serviceName === 'GitHub') {
    clientId = GITHUB_CLIENT_ID;
    clientSecret = GITHUB_CLIENT_SECRET;
    authorizationBaseUrl = 'https://github.com/login/oauth/authorize';
    tokenUrl = 'https://github.com/login/oauth/access_token';
  } else if (serviceName === 'Vercel') {
    clientId = VERCEL_CLIENT_ID;
    clientSecret = VERCEL_CLIENT_SECRET;
    authorizationBaseUrl = 'https://vercel.com/oauth/authorize';
    tokenUrl = 'https://api.vercel.com/v2/oauth/access_token';
  } else {
    throw new Error('Invalid service name');
  }
  
  return OAuth2.createService(serviceName)
      .setAuthorizationBaseUrl(authorizationBaseUrl)
      .setTokenUrl(tokenUrl)
      .setClientId(clientId)
      .setClientSecret(clientSecret)
      .setCallbackFunction(serviceName.toLowerCase() + 'AuthCallback')
      .setPropertyStore(PropertiesService.getUserProperties());
}

// Function to get the GitHub access token
function getGithubAccessToken() {
  var githubService = getOAuth2Service('GitHub');
  return githubService.getAccessToken();
}

// Function to get the Vercel access token
function getVercelAccessToken() {
  var vercelService = getOAuth2Service('Vercel');
  return vercelService.getAccessToken();
}


// Function to host project on GitHub
function hostOnGitHub(projectName, projectDescription, driveFolderUrl, githubToken) {
  // Fetch the code files from Google Drive folder
  var files = getDriveFolderFiles(driveFolderUrl);
  
  // GitHub API endpoint to create a new repository
  var apiUrl = "https://api.github.com/user/repos";
  
  // GitHub API request body
  var requestBody = {
    name: projectName,
    description: projectDescription,
    private: false, // or true for private repository
    auto_init: true, // Initialize the repository with a README
    files: files // Content of the code files
  };
  
  // GitHub API request options
  var options = {
    method: "post",
    headers: {
      Authorization: "token " + githubToken,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(requestBody)
  };
  
  // Make GitHub API request
  var response = UrlFetchApp.fetch(apiUrl, options);
  var responseData = JSON.parse(response.getContentText());
  
  // Return GitHub repository URL
  return responseData.html_url;
}

// Function to host project on Vercel
function hostOnVercel(projectName, projectDescription, driveFolderUrl, vercelToken) {
  // Fetch the code files from Google Drive folder
  var files = getDriveFolderFiles(driveFolderUrl);
  
  // Vercel API endpoint to deploy the project
  var apiUrl = "https://api.vercel.com/v1/projects/deployments";
  
  // Vercel API request body
  var requestBody = {
    name: projectName,
    description: projectDescription,
    files: files // Content of the code files
  };
  
  // Vercel API request options
  var options = {
    method: "post",
    headers: {
      Authorization: "Bearer " + vercelToken,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(requestBody)
  };
  
  // Make Vercel API request
  var response = UrlFetchApp.fetch(apiUrl, options);
  var responseData = JSON.parse(response.getContentText());
  
  // Return Vercel deployment URL
  return responseData.url;
}

// Function to get code files from a Google Drive folder
function getDriveFolderFiles(folderUrl) {
  var folderId = getIdFromUrl(folderUrl); // Extract folder ID from folder URL
  var folder = DriveApp.getFolderById(folderId); // Get folder by ID
  
  var files = [];
  var fileList = folder.getFiles();
  
  while (fileList.hasNext()) {
    var file = fileList.next();
    var fileContent = file.getBlob().getDataAsString();
    files.push({ name: file.getName(), content: fileContent });
  }
  
  return files;
}

// Function to extract ID from Google Drive folder URL
function getIdFromUrl(url) {
  return url.match(/[-\w]{25,}/)[0];
}

// OAuth2 callback function for GitHub
function githubAuthCallback(request) {
  var service = getOAuth2Service('GitHub');
  var authorized = service.handleCallback(request);
  if (authorized) {
    return HtmlService.createHtmlOutput('GitHub authorization successful! You can close this tab now.');
  } else {
    return HtmlService.createHtmlOutput('GitHub authorization denied.');
  }
}

// OAuth2 callback function for Vercel
function vercelAuthCallback(request) {
  var service = getOAuth2Service('Vercel');
  var authorized = service.handleCallback(request);
  if (authorized) {
    return HtmlService.createHtmlOutput('Vercel authorization successful! You can close this tab now.');
  } else {
    return HtmlService.createHtmlOutput('Vercel authorization denied.');
  }
}

// Logs the redirect URI to register for GitHub
function logGithubRedirectUri() {
  Logger.log(getOAuth2Service('GitHub').getRedirectUri());
}

// Logs the redirect URI to register for Vercel
function logVercelRedirectUri() {
  Logger.log(getOAuth2Service('Vercel').getRedirectUri());
}
