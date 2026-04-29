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
    format_comic_data,
    is_api_available
)
from wiki_api import (
    get_wiki_context,
    get_internet_context
)
from ollama_integration import (
    check_ollama_status,
    chat_with_ai_about_comics,
    analyse_preferences_with_ai,
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
        elif path == '/api/comic-vine-status':
            self.handle_comic_vine_status()
        elif path == '/api/wiki':
            self.handle_wiki_api()
        elif path == '/api/search':
            self.handle_search_api()
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
        elif path == '/api/jarvis-comic':
            self.handle_jarvis_comic_chat()
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

    def handle_wiki_api(self):
        """Return wiki summary data for a search query"""
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        search_term = query.get('q', [''])[0]
        if search_term:
            wiki_data = get_wiki_context(search_term)
        else:
            wiki_data = {
                'query': '',
                'title': '',
                'summary': '',
                'source': 'Wikipedia',
                'url': ''
            }
        self.send_json_response(wiki_data)

    def handle_comic_vine_status(self):
        """Return whether Comic Vine is reachable"""
        self.send_json_response({'available': is_api_available()})

    def handle_search_api(self):
        """Return live internet search context for a query"""
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        search_term = query.get('q', [''])[0]
        if search_term:
            search_data = get_internet_context(search_term)
        else:
            search_data = {
                'query': '',
                'title': '',
                'summary': '',
                'source': 'Internet Search',
                'url': ''
            }
        self.send_json_response(search_data)

    def handle_recommend_api(self):
        """Get AI-powered recommendations"""
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        preferences = query.get('preferences', [''])[0]
        
        # Get comics from Comic Vine
        comics = get_recommendations_with_comic_vine(preferences)
        
        # Get AI analysis if Ollama is available
        status = check_ollama_status()
        if status['available'] and comics:
            ai_analysis = analyse_preferences_with_ai(preferences, comics)
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
            ai_analysis = analyse_preferences_with_ai(preferences, comics)
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
    
    def handle_jarvis_comic_chat(self):
        """Handle Jarvis comic chat requests"""
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        data = json.loads(post_data)
        
        comic = data.get('comic', {})
        message = data.get('message', '')
        history = data.get('history', [])
        
        # Build context about the comic
        comic_context = f"""You are discussing the comic "{comic.get('title', 'Unknown')}" 
        - Issue: {comic.get('issue', 'N/A')}
        - Year: {comic.get('year', 'N/A')}
        - Writer: {comic.get('writer', 'Unknown')}
        - Artist: {comic.get('artist', 'Unknown')}
        - Characters: {', '.join(comic.get('characters', []))}
        - Description: {comic.get('description', 'N/A')}
        
        Provide helpful, informative responses about this comic. Be friendly and enthusiastic."""
        
        # Check if Ollama is available
        status = check_ollama_status()
        if status['available']:
            response = chat_with_ai_about_comics(message, comic_context)
            self.send_json_response({'response': response})
        else:
            # Fallback response when Ollama is not available
            response = self.get_fallback_comic_response(message, comic)
            self.send_json_response({'response': response})
    
    def get_fallback_comic_response(self, message, comic):
        """Generate fallback responses when Ollama is not available"""
        lower_message = message.lower()
        
        if any(word in lower_message for word in ['story', 'plot', 'about', 'summary']):
            return f"<strong>Story Overview:</strong><br>{comic.get('description', 'No description available.')}"
        
        if any(word in lower_message for word in ['character', 'who', 'characters']):
            chars = comic.get('characters', [])
            return f"<strong>Characters in this comic:</strong><br>{', '.join(chars)}.<br><br>Would you like to know more about any specific character?"
        
        if any(word in lower_message for word in ['writer', 'author', 'artist', 'draw']):
            return f"<strong>Creative Team:</strong><br>• <strong>Writer:</strong> {comic.get('writer', 'Unknown')}<br>• <strong>Artist:</strong> {comic.get('artist', 'Unknown')}"
        
        if any(word in lower_message for word in ['issue', 'read', 'start', 'when']):
            return f"<strong>Reading Info:</strong><br>This series runs from {comic.get('issue', 'N/A')} published in {comic.get('year', 'N/A')}."
        
        if any(word in lower_message for word in ['hello', 'hi', 'hey', 'greetings']):
            return f"Hello! I'm Jarvis, your comic assistant. Ask me anything about <strong>{comic.get('title')}</strong>!"
        
        if any(word in lower_message for word in ['recommend', 'suggest', 'good', 'start']):
            return f"<strong>Recommendation:</strong><br>{comic.get('title')} is a great choice! It's known for {comic.get('description', 'its compelling story')}. I'd recommend starting from issue {comic.get('issue', 'the beginning')}."
        
        return f"That's a great question about <strong>{comic.get('title')}</strong>! <br><br>I can tell you about:<br>• The story and plot<br>• Characters<br>• The creative team (writer/artist)<br>• Reading order<br><br>What would you like to know?"
    
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
        
        comicvine_available = is_api_available()
        if comicvine_available:
            print("   📚 Comic Vine: Connected")
        else:
            print("   📚 Comic Vine: Not reachable or no results returned")
        print()
        
        # Open browser automatically
        webbrowser.open(f"http://localhost:{PORT}")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Server stopped. Thanks for using ComicHelper!")

if __name__ == "__main__":
    main()