
// WALLET

function getCurrentValue(amount) {
  try {
    const response = UrlFetchApp.fetch(`${API_URL}/get_exchange_rates?amount=${amount}`);
    const result = JSON.parse(response.getContentText());
    Logger.log(result)

    if (!result.success || !result.data) {
      return { success: false, error: "Invalid response from API." };
    }

    const data = result.data;
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      success: true,
      data: {
        orderId: orderId,
        usdAmount: amount,
        btcAmount: data.btcAmount,
        ethAmount: data.ethAmount,
        usdtAmount: data.usdtAmount,
        exchangeRates: {
          BTC: data.btcRate,
          ETH: data.ethRate,
          USDT: "1.00"
        }
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function generateWalletAddresses(userId, currency) {
  try {
    // Make request to Flask API to create a wallet for the specific currency
    const options = {
      method: 'POST',
      muteHttpExceptions: true,
      contentType: 'application/json',
      payload: JSON.stringify({ userId: userId, currency: currency })
    };
    
    const response = UrlFetchApp.fetch(`${API_URL}/create_wallet`, options);
    const responseText = response.getContentText();
    Logger.log("FastAPI /create_wallet raw response: " + responseText);
    const result = JSON.parse(responseText);
    Logger.log("FastAPI /create_wallet parsed result: " + JSON.stringify(result));
    
    if (!result.success) {
      throw new Error(result.error);
    }

    const walletData = {
      userId: userId,
      network: result.data.currency,
      address: result.data.address,
      privateKey: result.data.privateKey,
      createdAt: new Date().toISOString(),
      status: 'ACTIVE'
    };
    
    const storeResult = setRowDataByHeaderMap("wallet_addresses", walletData);
    if (!storeResult.success) {
      throw new Error(`Failed to store ${currency} wallet data`);
    }
    
    return { 
      success: true, 
      data: {
        address: walletData.address,
        currency: walletData.network,
        userId: userId
      }
    };
  } catch (error) {
    Logger.log("Wallet generation error: " + error.message);
    return { success: false, error: error.message };
  }
}

function initializePayment(params) {
  try {
    const { userId, amount, coinValue, currency, orderId } = params;
    
    // Generate a new wallet address for the specific currency
    const walletGenerationResult = generateWalletAddresses(userId, currency);
    if (!walletGenerationResult.success) {
      throw new Error(`Failed to generate wallet address: ${walletGenerationResult.error}`);
    }
    const userAddress = walletGenerationResult.data.address;
    
    // Create transaction record
    const txData = {
      transactionId: `tr_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: userId,
      type: 'CREDIT',
      purpose: 'add_funds',
      amount: amount, // USD amount
      coinValue: coinValue, // Crypto amount
      currency: currency,
      reference: orderId,
      address: userAddress,
      status: 'pending'
    };
    
    setRowDataByHeaderMap("transactions", txData);
    
    return {
      success: true,
      data: {
        ...txData,
        address: userAddress,
        timeRemaining: "30:00" // 30 minutes countdown
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// TODO----
function checkTransactionStatus() {
  const pendingTxs = getRowsByColumn("transactions", "status", "pending");
  console.log(pendingTxs);
  
  if (!pendingTxs.success || pendingTxs.count === 0) {
    console.log("No pending transactions found");
    return;
  }
  
  console.log(`Found ${pendingTxs.count} pending transactions to check`);
  
  // Get current time in UTC
  const currentTime = new Date();
  console.log(`Current time: ${currentTime.toISOString()}`);
  
  // Convert array data to objects with named properties using headers
  const transactions = pendingTxs.data.map(row => {
    const obj = {};
    pendingTxs.headers.forEach((header, index) => {
      // Skip empty header columns
      if (header && header.trim() !== '') {
        obj[header] = row[index];
      }
    });
    return obj;
  });
  
  transactions.forEach(tx => {
    try {
      console.log(`Processing transaction ${tx.transactionId}, timestamp: ${tx.timestamp}`);
      
      // First check if transaction should be expired based on timestamp
      // Parse the ISO timestamp correctly
      const createdTime = new Date(tx.timestamp);
      
      // Calculate time difference in milliseconds
      const timeDiffMs = currentTime.getTime() - createdTime.getTime();
      // Convert to hours
      const hoursDiff = timeDiffMs / (1000 * 60 * 60);
      
      console.log(`Transaction age: ${hoursDiff.toFixed(2)} hours (${timeDiffMs} ms)`);
      
      // IMPORTANT: Check if the parsed date is valid before proceeding
      if (isNaN(createdTime.getTime())) {
        console.error(`Invalid timestamp format for transaction ${tx.transactionId}: ${tx.timestamp}`);
        return; // Skip this transaction
      }
      
      // Debug the timestamps to check for issues
      console.log(`Created time: ${createdTime.toISOString()}`);
      console.log(`Current time: ${currentTime.toISOString()}`);
      console.log(`Difference: ${hoursDiff.toFixed(2)} hours`);
      
      // If transaction is older than 2 hours, mark as expired without checking blockchain
      if (hoursDiff >= 2) {
        console.log(`EXPIRING: Transaction ${tx.transactionId} is expired (age: ${hoursDiff.toFixed(2)} hours)`);
        setMultipleCellDataByColumnSearch("transactions", "id", tx.id, {
          status: "expired",
          updatedOn: new Date().toISOString(),
          found: "FALSE"
        });
        console.log(`Transaction ${tx.transactionId} marked as expired`);
        return; // Skip further processing for this transaction
      }
      
      console.log(`Transaction ${tx.transactionId} is not expired, checking blockchain status...`);
      
      // Only check blockchain for non-expired transactions
      const apiUrl = `${API_URL}/check_transaction`;
      const payload = {
        address: tx.address,
        amount: tx.coinValue,
        currency: tx.currency,
        transaction_id: tx.transactionId
      };
      
      const options = {
        'method': 'post',
        'contentType': 'application/json',
        'payload': JSON.stringify(payload)
      };
      
      console.log(`API POST request to: ${apiUrl} with payload:`, JSON.stringify(payload));
      const response = UrlFetchApp.fetch(apiUrl, options);
      const result = JSON.parse(response.getContentText());
      console.log(response.getContentText())
      console.log(result)
      
      if (!result.success) {
        console.error(`API error for transaction ${tx.transactionId}: ${result.error}`);
        return;
      }
      
      const status = result.data;
      
      // Handle confirmed transactions
      if (status.confirmed) {
        console.log(`Transaction ${tx.transactionId} is confirmed with hash ${status.txHash}`);
        
        // Check if we've already processed this transaction hash
        if (status.txHash) {
          const isDuplicate = checkExistingTransaction(status.txHash);
          if (isDuplicate) {
            console.log(`Transaction ${tx.transactionId} is a duplicate (txHash: ${status.txHash})`);
            setMultipleCellDataByColumnSearch("transactions", "id", tx.id, {
              status: "expired",
              updatedOn: new Date().toISOString(),
              found: "FALSE"
            });
            return; // Skip further processing for this transaction
          }
        }
        
        // Update transaction status
        setMultipleCellDataByColumnSearch("transactions", "id", tx.id, {
          status: "completed",
          txHash: status.txHash,
          updatedOn: new Date().toISOString(),
          found: "TRUE"
        });
        
        console.log(`Transaction ${tx.transactionId} marked as completed with hash ${status.txHash}`);
      } else {
        console.log(`Transaction ${tx.transactionId} still pending (age: ${hoursDiff.toFixed(2)} hours)`);
      }
    } catch (error) {
      console.error(`Error checking transaction ${tx.transactionId}:`, error);
      console.error(`Error stack: ${error.stack}`);
    }
  });
}

function checkExistingTransaction(txHash) {
  const existingTx = getRowsByColumn("transactions", "txHash", txHash);
  return existingTx.success && existingTx.count > 0;
}

function testGenerateWalletAddresses() {
  Logger.log("--- Starting testGenerateWalletAddresses ---");
  const testUserId = "testUser123";
  const testCurrency = "ETH"; // Or 'BTC', 'USDT'

  const result = generateWalletAddresses(testUserId, testCurrency);

  if (result.success) {
    Logger.log(`Successfully generated wallet for ${testCurrency}:`);
    Logger.log(`Address: ${result.data.address}`);
    Logger.log(`Currency: ${result.data.currency}`);
    Logger.log(`User ID: ${testUserId}`); // userId is passed to generateWalletAddresses, not returned in result.data
  } else {
    Logger.log(`Failed to generate wallet: ${result.error}`);
  }
  Logger.log("--- Finished testGenerateWalletAddresses ---");
}
