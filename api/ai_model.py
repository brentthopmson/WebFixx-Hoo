from bs4 import BeautifulSoup
import requests
import json
import logging
import os
from dotenv import load_dotenv
from datetime import datetime

class AIModelHandler:
    def __init__(self):
        load_dotenv()
        self.logger = logging.getLogger(__name__)
        self.OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
        self.api_url = "https://api.openai.com/v1/chat/completions"
        self.headers = {
            "Authorization": f"Bearer {self.OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }

    def extract_webpage_content(self, html_content):
        """Extract clean text from HTML content"""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Remove script and style elements
            for script in soup(['script', 'style']):
                script.decompose()
            
            text = soup.get_text(separator='\n', strip=True)
            return text
        except Exception as e:
            self.logger.error(f"HTML extraction error: {str(e)}")
            raise

    def handle_webpage_summary(self, html_content, output_format=None):
        """Analyze webpage and return structured summary"""
        try:
            # Extract text content
            text_content = self.extract_webpage_content(html_content)
            
            # Prepare prompt for GPT
            messages = [
                {"role": "system", "content": "Summarize the following webpage content concisely:"},
                {"role": "user", "content": text_content[:4000]}  # Limit content length
            ]
            
            # Make API request
            response = requests.post(
                self.api_url,
                headers=self.headers,
                json={
                    "model": "gpt-3.5-turbo",
                    "messages": messages,
                    "temperature": 0.5,
                    "max_tokens": 500
                }
            )
            
            summary = response.json()["choices"][0]["message"]["content"]
            
            # Structure the response
            result = {
                "success": True,
                "data": {
                    "summary": summary,
                    "word_count": len(text_content.split()),
                    "content_type": "webpage",
                    "analyzed_at": str(datetime.now().isoformat())
                }
            }

            if output_format:
                result["data"].update(output_format)
                
            return result

        except Exception as e:
            self.logger.error(f"Webpage analysis error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }