from web3 import Web3
import os
from dotenv import load_dotenv
from eth_account import Account
import secrets
from datetime import datetime

class InfuraWeb3Handler:
    def __init__(self):
        load_dotenv()
        self.INFURA_URL = os.getenv("INFURA_URL")
        self.web3 = Web3(Web3.HTTPProvider(self.INFURA_URL))
        
        # Main Wallet Setup
        self.MAIN_PRIVATE_KEY = os.getenv("MAIN_PRIVATE_KEY")
        # Use Account.from_key instead of privateKeyToAccount
        self.MAIN_WALLET = Account.from_key(self.MAIN_PRIVATE_KEY)

    def get_exchange_rates(self, amount):
        """Calculate exchange rates for USD amount"""
        try:
            # Get ETH price from an oracle or exchange API
            eth_price = self._get_eth_price()  # Implement this helper method
            eth_amount = amount / eth_price
            
            return {
                "success": True,
                "data": {
                    "ethAmount": f"{eth_amount:.8f}",
                    "ethRate": f"{eth_price:.2f}",
                    "usdtAmount": f"{amount:.2f}"
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def check_transaction(self, address, expected_amount):
        """Verify payment receipt"""
        try:
            txs = self.web3.eth.get_transactions(address)
            
            for tx in txs:
                if tx.value == self.web3.to_wei(expected_amount, "ether"):
                    return {
                        "success": True,
                        "data": {
                            "confirmed": True,
                            "txHash": tx.hash.hex()
                        }
                    }
            
            return {
                "success": True,
                "data": {
                    "confirmed": False
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def create_wallet(self):
        """Create a new Ethereum wallet"""
        try:
            # Generate a random private key
            private_key = '0x' + secrets.token_hex(32)
            
            # Create account from private key
            account = Account.from_key(private_key)
            
            # Get current ETH balance
            balance = self.web3.eth.get_balance(account.address)
            
            return {
                "success": True,
                "data": {
                    "address": account.address,
                    "privateKey": private_key,
                    "network": "ETH",
                    "balance": self.web3.from_wei(balance, 'ether'),
                    "createdAt": str(datetime.now().isoformat())
                }
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def _get_eth_price(self):
        """Helper method to get ETH price"""
        # Implement price fetching logic here
        pass