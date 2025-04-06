from web3 import Web3
import os
from dotenv import load_dotenv
from eth_account import Account
from bitcoin import *  # Using python-bitcoin instead of bitcoinlib
import secrets, json
from datetime import datetime
import requests
import blockcypher
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# USDT Contract ABI (minimal required functions)
USDT_ABI = json.loads('''[
    {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"},
    {"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"type":"function"}
]''')

class InfuraWeb3Handler:
    def __init__(self):
        load_dotenv()
        
        # Initialize Web3
        self.INFURA_URL = os.getenv("INFURA_URL")
        self.web3 = Web3(Web3.HTTPProvider(self.INFURA_URL))
        
        # Initialize USDT contract
        self.USDT_ADDRESS = os.getenv("USDT_CONTRACT_ADDRESS")
        self.usdt_contract = self.web3.eth.contract(
            address=self.USDT_ADDRESS, 
            abi=USDT_ABI
        )
        
        # Network settings
        self.BTC_NETWORK = os.getenv("BTC_NETWORK", "mainnet")
        self.BLOCKCYPHER_TOKEN = os.getenv("BLOCKCYPHER_TOKEN")
        
        # Main wallet setup
        self.MAIN_PRIVATE_KEY = os.getenv("MAIN_PRIVATE_KEY")
        self.MAIN_WALLET = Account.from_key(self.MAIN_PRIVATE_KEY)

    def get_exchange_rates(self, amount):
        """Get exchange rates for USD amount"""
        try:
            # Get crypto prices
            btc_price = self._get_btc_price()
            eth_price = self._get_eth_price()
            
            # Calculate amounts
            btc_amount = amount / btc_price if btc_price else 0
            eth_amount = amount / eth_price if eth_price else 0
            
            return {
                "success": True,
                "data": {
                    "btcAmount": f"{btc_amount:.8f}",
                    "btcRate": f"{btc_price:.2f}",
                    "ethAmount": f"{eth_amount:.8f}",
                    "ethRate": f"{eth_price:.2f}",
                    "usdtAmount": f"{amount:.2f}",
                    "exchangeRate": {
                        "BTC": f"{btc_price:.2f}",
                        "ETH": f"{eth_price:.2f}",
                        "USDT": "1.00"
                    }
                }
            }
        except Exception as e:
            logger.error(f"Exchange rate error: {str(e)}")
            return {"success": False, "error": str(e)}

    def create_wallet(self):
        """Create new BTC and ETH wallets"""
        try:
            # Create ETH wallet
            eth_private_key = '0x' + secrets.token_hex(32)
            eth_account = Account.from_key(eth_private_key)

            # Create BTC wallet using python-bitcoin
            btc_private_key = random_key()
            btc_public_key = privtopub(btc_private_key)
            btc_address = pubtoaddr(btc_public_key)
            
            return {
                "success": True,
                "data": {
                    "ethAddress": eth_account.address,
                    "ethPrivateKey": eth_private_key,
                    "btcAddress": btc_address,
                    "btcPrivateKey": btc_private_key,
                    "createdAt": str(datetime.now().isoformat())
                }
            }
        except Exception as e:
            logger.error(f"Wallet creation error: {str(e)}")
            return {"success": False, "error": str(e)}

    def check_transaction(self, address, expected_amount, currency='ETH'):
        """Verify crypto payment"""
        try:
            if currency == 'BTC':
                return self._check_btc_transaction(address, expected_amount)
            elif currency == 'USDT':
                return self._check_usdt_transaction(address, expected_amount)
            else:
                return self._check_eth_transaction(address, expected_amount)
        except Exception as e:
            logger.error(f"Transaction check error: {str(e)}")
            return {"success": False, "error": str(e)}

    def _check_btc_transaction(self, address, expected_amount):
        """Check BTC payment using BlockCypher"""
        try:
            # Get address details
            details = blockcypher.get_address_details(
                address,
                coin_symbol='btc',
                api_key=self.BLOCKCYPHER_TOKEN
            )
            
            # Check recent transactions
            for tx in details.get('txrefs', []):
                if (tx.get('value', 0) / 1e8) == float(expected_amount):  # Convert satoshis to BTC
                    return {
                        "success": True,
                        "data": {
                            "confirmed": True,
                            "txHash": tx['tx_hash'],
                            "confirmations": tx.get('confirmations', 0)
                        }
                    }
            
            return {"success": True, "data": {"confirmed": False}}
            
        except Exception as e:
            raise Exception(f"BTC transaction check failed: {str(e)}")

    def _check_usdt_transaction(self, address, expected_amount):
        """Check USDT payment"""
        try:
            block = self.web3.eth.get_block('latest', full_transactions=True)
            
            for tx in block.transactions:
                if tx['to'] and tx['to'].lower() == self.USDT_ADDRESS.lower():
                    # Decode USDT transfer
                    try:
                        transfer_data = self.usdt_contract.decode_function_input(tx['input'])
                        if transfer_data[0].fn_name == 'transfer':
                            to_address = transfer_data[1]['_to']
                            amount = transfer_data[1]['_value'] / 1e6  # USDT uses 6 decimals
                            
                            if (to_address.lower() == address.lower() and 
                                amount == float(expected_amount)):
                                return {
                                    "success": True,
                                    "data": {
                                        "confirmed": True,
                                        "txHash": tx['hash'].hex(),
                                        "confirmations": 1
                                    }
                                }
                    except:
                        continue
            
            return {"success": True, "data": {"confirmed": False}}
            
        except Exception as e:
            raise Exception(f"USDT transaction check failed: {str(e)}")

    def _check_eth_transaction(self, address, expected_amount):
        """Check ETH payment"""
        try:
            block = self.web3.eth.get_block('latest', full_transactions=True)
            
            for tx in block.transactions:
                if (tx['to'] and 
                    tx['to'].lower() == address.lower() and 
                    self.web3.from_wei(tx['value'], 'ether') == float(expected_amount)):
                    return {
                        "success": True,
                        "data": {
                            "confirmed": True,
                            "txHash": tx['hash'].hex(),
                            "confirmations": 1
                        }
                    }
            
            return {"success": True, "data": {"confirmed": False}}
            
        except Exception as e:
            raise Exception(f"ETH transaction check failed: {str(e)}")

    def _get_btc_price(self):
        """Get BTC price"""
        try:
            response = requests.get(
                'https://api.coingecko.com/api/v3/simple/price',
                params={
                    'ids': 'bitcoin',
                    'vs_currencies': 'usd',
                    'x_cg_demo_api_key': os.getenv('COINGECKO_API_KEY')
                }
            )
            return float(response.json()['bitcoin']['usd'])
        except Exception as e:
            raise Exception(f"Failed to get BTC price: {str(e)}")

    def _get_eth_price(self):
        """Get ETH price"""
        try:
            response = requests.get(
                'https://api.coingecko.com/api/v3/simple/price',
                params={
                    'ids': 'ethereum',
                    'vs_currencies': 'usd',
                    'x_cg_demo_api_key': os.getenv('COINGECKO_API_KEY')
                }
            )
            return float(response.json()['ethereum']['usd'])
        except Exception as e:
            raise Exception(f"Failed to get ETH price: {str(e)}")
