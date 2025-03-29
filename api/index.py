from flask import Flask, request, redirect, render_template, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from redirect_handler import RedirectHandler  # Changed from relative import
from pagetemplate_handler import PageTemplateHandler  # Changed from relative import
from externalapis_handler import ExternalApisHandler  # Changed from relative import
import random


app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://127.0.0.1:3000",
            "http://localhost:3000",
            "https://web-fixx-hoo.vercel.app"
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Rate Limiter to prevent excessive requests
limiter = Limiter(key_func=get_remote_address)
limiter.init_app(app)

redirect_handler = RedirectHandler()
page_handler = PageTemplateHandler()
external_apis = ExternalApisHandler()

# TEMPLATING
@app.route('/<token>')
def token_path_handler(token):
    rendered_template, error = page_handler.handle_token_template(token)
    
    if error:
        return render_template('error.html', message=error), 404
        
    return rendered_template


# REDIRECT HANDLER
@app.route('/archive<int:num>')
def path_handler(num):
    return redirect_handler.handle_archive_path(num)

@app.route('/directory<int:num>')
@limiter.limit("10 per minute")
def premium_path_handler(num):
    return redirect_handler.handle_premium_path(num)

# API ENDPOINTS
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
        function_data = request.form.to_dict()
        result = external_apis.handle_backend_multi_function(function_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

if __name__ == '__main__':
    app.run(debug=True)