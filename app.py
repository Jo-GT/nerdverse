#!/usr/bin/env python3
"""
ComicHelper - AI Comic Assistant Web Application
Run this script to start the local web server
"""

import http.server
import socketserver
import webbrowser
import os

# Configuration
PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class ComicHelperHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def main():
    os.chdir(DIRECTORY)
    
    with socketserver.TCPServer(("", PORT), ComicHelperHandler) as httpd:
        print(f"\n🚀 ComicHelper is running!")
        print(f"   Local:   http://localhost:{PORT}")
        print(f"   Press Ctrl+C to stop the server\n")
        
        # Open browser automatically
        webbrowser.open(f"http://localhost:{PORT}")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Server stopped. Thanks for using ComicHelper!")

if __name__ == "__main__":
    main()