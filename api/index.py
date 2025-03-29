from flask import Flask, request, redirect, render_template, jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from redirect_handler import RedirectHandler
from pagetemplate_handler import PageTemplateHandler
from externalapis_handler import ExternalApisHandler
import random


app = Flask(__name__)

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

if __name__ == '__main__':
    app.run(debug=True)

# Add this line for Vercel
app = app