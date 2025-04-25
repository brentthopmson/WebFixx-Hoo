from langchain_community.llms import OpenAI
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.chains.summarize import load_summarize_chain
from bs4 import BeautifulSoup
import json
import logging
import os
from dotenv import load_dotenv
from datetime import datetime

class AIModelHandler:
    def __init__(self):
        load_dotenv()
        self.logger = logging.getLogger(__name__)
        self.llm = OpenAI(temperature=0.5)
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=2000,
            chunk_overlap=200
        )
        self.chain = load_summarize_chain(self.llm, chain_type="map_reduce")

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
            
            # Split text into chunks
            docs = self.text_splitter.create_documents([text_content])
            
            # Generate summary
            summary = self.chain.run(docs)
            
            # Structure the response
            response = {
                "success": True,
                "data": {
                    "summary": summary,
                    "word_count": len(text_content.split()),
                    "content_type": "webpage",
                    "analyzed_at": str(datetime.now().isoformat())
                }
            }

            if output_format:
                response["data"].update(output_format)
                
            return response

        except Exception as e:
            self.logger.error(f"Webpage analysis error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }