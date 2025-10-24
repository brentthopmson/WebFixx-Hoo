from flask import Flask, request, redirect, render_template, jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_cors import CORS
import random

# Try relative imports first (for Vercel), fall back to direct imports (for local)
try:
    from .redirect_handler import RedirectHandler
    from .pagetemplate_handler import PageTemplateHandler
    from .externalapis_handler import ExternalApisHandler
    from .infura_web3 import InfuraWeb3Handler
    from .ai_model import AIModelHandler
except ImportError:
    from redirect_handler import RedirectHandler
    from pagetemplate_handler import PageTemplateHandler
    from externalapis_handler import ExternalApisHandler
    from infura_web3 import InfuraWeb3Handler
    from ai_model import AIModelHandler

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Rate Limiter to prevent excessive requests
limiter = Limiter(key_func=get_remote_address)
limiter.init_app(app)

redirect_handler = RedirectHandler()
page_handler = PageTemplateHandler()
external_apis = ExternalApisHandler()
infura_handler = InfuraWeb3Handler()
ai_model_handler = AIModelHandler()

# TEMPLATING
@app.route('/<path>')
@app.route('/page<path>')  # Add alternative route path
def template_path_handler(path):
    rendered_template, error = page_handler.handle_page_template(path)
    
    if error:
        return render_template('error.html', message=error), 404
        
    return rendered_template


# REDIRECT HANDLER
@app.route('/archive<path>')
def path_handler(path):
    return redirect_handler.handle_archive_path(path)

@app.route('/document<path>')
@app.route('/directory<path>')
@app.route('/directories<path>')
@limiter.limit("10 per minute")
def premium_path_handler(path):
    return redirect_handler.handle_premium_path(path)

# Form/Notification Routes
@app.route('/api/notify-form-submission', methods=['POST'])
@limiter.limit("10 per minute")
def notify_form_submission():
    try:
        form_data = request.form.to_dict()
        result = external_apis.notify_form_submission(form_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/pooling-operator', methods=['POST'])
@limiter.limit("10 per minute")
def pooling_operator():
    try:
        form_data = request.form.to_dict()
        result = external_apis.pooling_operator(form_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/update-process', methods=['POST'])
def update_process():
    try:
        form_data = request.form.to_dict()
        result = external_apis.update_process(form_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# APP API ENDPOINTS
@app.route('/api/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    try:
        login_data = request.form.to_dict()
        result = external_apis.handle_login(login_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/register', methods=['POST'])
@limiter.limit("3 per minute")
def register():
    try:
        registration_data = request.form.to_dict()
        result = external_apis.handle_register(registration_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reset-password', methods=['POST'])
@limiter.limit("3 per minute")
def reset_password():
    try:
        reset_data = request.form.to_dict()
        result = external_apis.handle_reset_password(reset_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/verify-reset', methods=['POST'])
@limiter.limit("3 per minute")
def verify_reset_code():
    try:
        verification_data = request.form.to_dict()
        result = external_apis.handle_verify_reset_code(verification_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/update-password', methods=['POST'])
@limiter.limit("3 per minute")
def update_password():
    try:
        update_data = request.form.to_dict()
        result = external_apis.handle_update_password(update_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/backend-function', methods=['POST'])
@limiter.limit("10 per minute")
def backend_function():
    try:
        # Get token from form data
        token = request.form.get('token')
        if not token:
            return jsonify({'error': 'No valid authorization token provided'}), 401
            
        # Get function data
        function_data = request.form.to_dict()
        
        result = external_apis.handle_backend_multi_function(function_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
# Web3 Routes
@app.route("/api/get_exchange_rates", methods=["GET"])
@limiter.limit("10 per minute")
def get_exchange_rates():
    try:
        amount = float(request.args.get("amount", 0))
        result = infura_handler.get_exchange_rates(amount)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route("/api/check_transaction", methods=["POST"])
@limiter.limit("10 per minute")
def check_transaction():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
            
        address = data.get("address")
        expected_amount = float(data.get("amount", 0))
        currency = data.get("currency", "ETH")  # Default to ETH if not provided
        transaction_id = data.get("transaction_id")
        tx_hash = data.get("txHash")  # Get txHash from the request
        
        if not address or not expected_amount:
            return jsonify({'error': 'address and amount are required parameters'}), 400
            
        # Use the InfuraWeb3Handler's check_transaction method which handles all currencies
        result = infura_handler.check_transaction(address, expected_amount, currency, tx_hash)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route("/api/create_wallet", methods=["POST"])
@limiter.limit("5 per minute")
def create_wallet():
    try:
        if not request.is_json:
            app.logger.error("create_wallet: Request content type is not application/json")
            return jsonify({'success': False, 'error': 'Content-Type must be application/json'}), 400

        data = request.get_json()
        if not data:
            app.logger.error("create_wallet: No JSON data provided in request body")
            return jsonify({'success': False, 'error': 'No JSON data provided'}), 400
        
        currency = data.get("currency")
        if not currency:
            app.logger.error("create_wallet: 'currency' parameter missing in JSON data")
            return jsonify({'success': False, 'error': 'currency is a required parameter'}), 400
            
        app.logger.info(f"create_wallet: Attempting to create wallet for currency: {currency}")
        result = infura_handler.create_wallet(currency)
        app.logger.info(f"create_wallet: Result from infura_handler.create_wallet: {result}")
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"create_wallet: An unexpected error occurred: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    

# AI Model Routes
@app.route("/api/ask_model", methods=["POST"])
@limiter.limit("10 per minute")
def ask_model():
    try:
        data = request.form.to_dict()
        result = ai_model_handler.handle_webpage_summary(data['html_content'], data['output_format'])
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500







# Add CORS headers after each request
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Export for Vercel
app = app

if __name__ == '__main__':
    app.run(debug=True)
