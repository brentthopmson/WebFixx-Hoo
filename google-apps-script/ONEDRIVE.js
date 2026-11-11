// MOVE TO WEBFIXX


//Drive of Microsoft Graph API
//These methods manage OneDrive.


//1. Retrieve file list on OneDrive
function retrieveOneDriveFileList() {
var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
var res = odapp.getFilelist("### folder name ###");
}
//Filenames and file IDs are returned.

//If "### folder name ###" is not inputted (var res = odapp.getFilelist()), files and folders on the root directory are retrieved.


//2. Delete files and folders on OneDrive.
//When a file is deleted,

function deleteOneDriveFileAndFolders() {
var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
var res = odapp.deleteItemByName("### filename ###");
//When a folder is deleted,

var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
var res = odapp.deleteItemByName("/### folder name ###/");
//In the case of folder, please enclose it in /.

//If you want to delete files and folders using item ID, please use as follows.

var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
var res = odapp.deleteItemById("### item ID ###");
//Note :
//If you delete a folder, the files in the folder are also deleted. Please be careful about this.
}

//3. Create folder on OneDrive.
function createOneDriveFolder() {
var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
var res = odapp.creatFolder("### foldername ###", "/### path ###/");
//Created folder name and ID are returned. If you want to create a folder of newfolder in the folder of /root/sample1/sample2/, please use as follows. If there is no folder sample2 on your OneDrive, following script creates sample2 and newfolder, simultaneously.

var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
var res = odapp.creatFolder("newfolder", "/sample1/sample2/");
}

//4. Download files from OneDrive to Google Drive.
function downloadFilesFromOneDriveToGoogleDrive() {
var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
//convert from Microsoft to Google (true or false)
var res = odapp.downloadFile("### file with path ###", true, "### Folder ID on Google Drive ###");
//Downloaded file name and ID on Google Drive are returned. When a file is downloaded from OneDrive to Google Drive, if the file is Microsoft Office Docs, you can select whether the file is converted to Google Docs. If you want to convert, you can use following sample.

var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
var res = odapp.downloadFile(
  "/SampleFolder/sample.xlsx",
  true,
  "### Folder ID on Google Drive ###"
);
//In this case, Excel file is converted to Google Spreadsheet, and imported to the folder ID. If you don't want to convert, you can use following sample. If the folder ID is not set, the file is created to root directory on your Google Drive.

var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
var res = odapp.downloadFile(
  "/SampleFolder/sample.xlsx",
  false,
  "### Folder ID on Google Drive ###"
);
//In this case, only an Excel file is downloaded to Google Drive.

//If you use following simple script, the file sample.xlsx is just created to root directory.

var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
var res = odapp.downloadFile("/SampleFolder/sample.xlsx");
//Note :
//From my previous experiences, I think that the maximum response size using URL Fetch is about 10 MB. And furthermore, there are the limitations for the download size in 1 day (URL Fetch data received 100MB / day). So when you use this download method, please be careful the file size.
}

//5. Upload files from Google Drive to OneDrive.
function uploadFilesFromGoogleDriveToOneDrive() {
var fileid = "### file id ###";
var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
var res = odapp.uploadFile(fileid, "/### folder name on OneDrive ###/");
//Uploaded filename and ID on OneDrive are returned. In the case of folder, please enclose it in /.

//When you want to upload a Spreadsheet on Google Drive to a folder of SampleFolder, the Spreadsheet is converted to Excel file and uploaded to OneDrive. As a sample, when it uploads Spreadsheet to /SampleFolder/ on OneDrive, the script is as follows.

var fileid = "### file id ###";
var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
var res = odapp.uploadFile(fileid, "/SampleFolder/sample.xlsx");
//At the following script, a file with the file id is uploaded to the root directory on OneDrive.

var fileid = "### file id ###";
var prop = PropertiesService.getScriptProperties();
var odapp = OnedriveApp.init(prop);
var res = odapp.uploadFile(fileid);
//Note :
//About this upload, in this library, the resumable upload is used for uploading files. So you can upload files with large size to OneDrive. But the chunk size is 10 MB, because of the limitation of URL Fetch POST size on Google. The file with large size is uploaded by separating by 10 MB. There are no limitations for upload size in one day.
}

//Utilities

//1. Get access token
function getOneDriveAccessToken() {
const accessToken = OnedriveApp.init(
  PropertiesService.getScriptProperties()
).getAccessToken();
console.log(accessToken);
}
//The access token is simply returned. When this access token is used, you can also test other methods of Microsoft Graph API.