#!/usr/bin/env python3
"""
ComicHelper - AI Comic Assistant Web Application
Run this script to start the local web server
"""

import http.server
import socketserver
import webbrowser
import os
import json
import urllib.parse
from comic_vine_api import (
    get_mock_recommendations, 
    get_recommendations_with_comic_vine,
    search_issues,
    format_comic_data
)
from ollama_integration import (
    check_ollama_status,
    chat_with_ai_about_comics,
    analyze_preferences_with_ai,
    get_ai_explanation
)

# Configuration
PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class ComicHelperHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def do_GET(self):
        """Handle GET requests including API endpoints"""
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        
        # API Endpoints
        if path == '/api/comics':
            self.handle_comics_api()
        elif path == '/api/ollama-status':
            self.handle_ollama_status()
        elif path == '/api/chat':
            self.handle_chat_api()
        elif path == '/api/recommend':
            self.handle_recommend_api()
        else:
            # Serve static files
            super().do_GET()
    
    def do_POST(self):
        """Handle POST requests"""
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        
        if path == '/api/chat':
            self.handle_chat_post()
        elif path == '/api/recommend':
            self.handle_recommend_post()
        else:
            self.send_error(404, 'Not Found')
    
    def handle_comics_api(self):
        """Return comic data from Comic Vine API or mock data"""
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        search_term = query.get('q', [''])[0]
        
        # Get recommendations based on search term
        if search_term:
            comics = get_recommendations_with_comic_vine(search_term)
        else:
            comics = get_mock_recommendations(search_term)
        
        self.send_json_response(comics)
    
    def handle_ollama_status(self):
        """Check if Ollama is running"""
        status = check_ollama_status()
        self.send_json_response(status)
    
    def handle_chat_api(self):
        """Handle chat with AI"""
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        message = query.get('message', [''])[0]
        
        if message:
            response = chat_with_ai_about_comics(message)
            self.send_json_response({'response': response})
        else:
            self.send_json_response({'error': 'No message provided'})
    
    def handle_chat_post(self):
        """Handle POST chat requests"""
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        data = json.loads(post_data)
        
        message = data.get('message', '')
        context = data.get('context', '')
        
        if message:
            response = chat_with_ai_about_comics(message, context)
            self.send_json_response({'response': response})
        else:
            self.send_json_response({'error': 'No message provided'})
    
    def handle_recommend_api(self):
        """Get AI-powered recommendations"""
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        preferences = query.get('preferences', [''])[0]
        
        # Get comics from Comic Vine
        comics = get_recommendations_with_comic_vine(preferences)
        
        # Get AI analysis if Ollama is available
        status = check_ollama_status()
        if status['available'] and comics:
            ai_analysis = analyze_preferences_with_ai(preferences, comics)
            self.send_json_response({
                'comics': comics,
                'ai_analysis': ai_analysis,
                'ollama_available': True
            })
        else:
            self.send_json_response({
                'comics': comics,
                'ollama_available': False,
                'message': 'Ollama not available - showing mock data'
            })
    
    def handle_recommend_post(self):
        """Handle POST recommendation requests"""
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        data = json.loads(post_data)
        
        preferences = data.get('preferences', '')
        
        # Get comics
        comics = get_recommendations_with_comic_vine(preferences)
        
        # Get AI analysis
        status = check_ollama_status()
        if status['available'] and comics:
            ai_analysis = analyze_preferences_with_ai(preferences, comics)
            self.send_json_response({
                'comics': comics,
                'ai_analysis': ai_analysis,
                'ollama_available': True
            })
        else:
            self.send_json_response({
                'comics': comics,
                'ollama_available': False
            })
    
    def send_json_response(self, data):
        """Send a JSON response"""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))


def main():
    os.chdir(DIRECTORY)
    
    with socketserver.TCPServer(("", PORT), ComicHelperHandler) as httpd:
        print(f"\n🚀 ComicHelper is running!")
        print(f"   Local:   http://localhost:{PORT}")
        print(f"   API:     http://localhost:{PORT}/api/comics")
        print(f"   Chat:    http://localhost:{PORT}/api/chat")
        print(f"\n   Press Ctrl+C to stop the server\n")
        
        # Check Ollama status
        status = check_ollama_status()
        if status['available']:
            print(f"   🤖 Ollama: Connected ({len(status['models'])} models)")
        else:
            print(f"   ⚠️  Ollama: Not running (run 'ollama serve' to enable AI)")
        
        print(f"   📚 Comic Vine: API key configured\n")
        
        # Open browser automatically
        webbrowser.open(f"http://localhost:{PORT}")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Server stopped. Thanks for using ComicHelper!")

if __name__ == "__main__":
    main()