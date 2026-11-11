

// https://script.google.com/macros/s/AKfycbzQZxwzDMuGgu5PdkyYTMkaoLXHM4MR1SNBNqR17zXQA6QE_oPxogTW8Gi_OgUBuUu9/exec?action=getData&sheetname=SM-Content-F&range=A1:Z

// https://script.google.com/macros/s/AKfycbzmbtSU6CbG-GMMZfnWwoNGsC9Y4kehMuo8zmtvHbA/dev?action=getData&sheetname=Accounts&range=A1:BD

function doGet(e) {
  if (e.parameter.action === 'getData') {
    return getSheetData(e);
  } else {
    // return HtmlService.createTemplateFromFile(CONFIG.INDEX)
    //   .evaluate()
    //   .setTitle(CONFIG.NAME)
    //   .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}



function getSheetData(e) {
  try {
    const sheetName = e.parameter.sheetname;
    const range = e.parameter.range;

    if (!sheetName) throw new Error('Sheet name is required.');
    if (!range) throw new Error('Range is required.');

    const sheet = SpreadsheetApp.openById(CONFIG.DB_ID).getSheetByName(sheetName);
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);

    let data;
    
    if (range.toUpperCase() === 'CELL') {
      const cellAddress = e.parameter.cell;
      if (!cellAddress) throw new Error('Cell address is required for cell data.');
      data = sheet.getRange(cellAddress).getValue();
    } else {
      data = sheet.getRange(range).getValues();
    }

    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: error.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}