// Function to run when Google Sheets is edited
function processHubSheetData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('HUB');
  var startRow = 2;  // First row of data to process
  var numRows = sheet.getLastRow() - 1;   // Number of rows to process
  // Fetch the range of cells A2:B3
  var dataRange = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn());
  // Fetch values for each row in the Range.
  var data = dataRange.getValues(); // Use getValues to get raw data
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var projectName = row[3];
    var projectDescription = row[4];
    var driveFolderUrl = row[5];
    var githubToken = getGithubAccessToken(); // Get GitHub access token
    var vercelToken = getVercelAccessToken(); // Get Vercel access token
    var hostType = row[8]; // Assuming host type is in column H
    
    if (hostType == "GITHUB") {
      // Check if GitHub service has access
      var githubService = getOAuth2Service('GitHub');
      if (githubService.hasAccess()) {
        // Host project on GitHub
        var githubUrl = hostOnGitHub(projectName, projectDescription, driveFolderUrl, githubToken);
        sheet.getRange(startRow + i, 26).setValue(githubUrl); // Set GitHub URL in column Z
      } else {
        // Log GitHub redirect URI
        logGithubRedirectUri();
      }
    } else if (hostType == "VERCEL") {
      // Check if Vercel service has access
      var vercelService = getOAuth2Service('Vercel');
      if (vercelService.hasAccess()) {
        // Host project on Vercel
        var vercelUrl = hostOnVercel(projectName, projectDescription, driveFolderUrl, vercelToken);
        sheet.getRange(startRow + i, 26).setValue(vercelUrl); // Set Vercel URL in column Z
      } else {
        // Log Vercel redirect URI
        logVercelRedirectUri();
      }
    }
  }
}
