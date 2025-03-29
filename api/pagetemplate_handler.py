import requests
import json
from flask import render_template_string
from flask_cors import cross_origin

class PageTemplateHandler:
    def __init__(self):
        self.PROJECTS_URL = "https://script.google.com/macros/s/AKfycbzpGDrsMrVbWe4xjt39a0AhJWPTmdqLvfSia1-gkSfNK5aTIQ95m83Q-kvIXukn_JxLXA/exec?action=getData&sheetname=projects&range=A1:BA"

    def fetch_project_data(self):
        try:
            response = requests.get(self.PROJECTS_URL)
            if response.status_code == 200:
                raw_data = response.json()
                if not isinstance(raw_data, list) or len(raw_data) < 2:
                    return []
                headers = raw_data[0]
                return [dict(zip(headers, row)) for row in raw_data[1:]]
        except Exception as e:
            print("Exception fetching project data:", str(e))
            return []

    @cross_origin()
    def handle_token_template(self, token):
        try:
            # Fetch project data
            projects = self.fetch_project_data()
            
            # Find matching project by token
            project = next((p for p in projects if p.get('token') == token), None)
            
            if not project:
                return None, "Token not found"
                
            # Extract required fields
            template_variables = json.loads(project.get('templateVariables', '{}'))
            post_request_url = project.get('postRequestURL', '')
            template_code = project.get('templateCode', '')
            
            # Add postRequestURL to template variables
            template_variables['postRequestURL'] = post_request_url
            
            # Render template with variables
            rendered_template = render_template_string(
                template_code,
                **template_variables
            )
            
            return rendered_template, None
            
        except json.JSONDecodeError as e:
            return None, f"Invalid template variables JSON: {str(e)}"
        except Exception as e:
            return None, f"Error processing template: {str(e)}"