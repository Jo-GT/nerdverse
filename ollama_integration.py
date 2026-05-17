#!/usr/bin/env python3
"""
Ollama AI Integration for Comic Recommendations
Combines Ollama AI with external comic data sources to generate chat responses,
recommendations, and preference analysis.
"""

import json
import urllib.request
import urllib.parse
import urllib.error

# Ollama Configuration — Ollama must be running locally via `ollama serve`.
# This module sends prompts to the local Ollama HTTP API and parses responses.
OLLAMA_BASE_URL = 'http://localhost:11434'
DEFAULT_MODEL = 'gpt-oss:120b-cloud'

def call_ollama(prompt, model=None, system_prompt=None):
    """Send a prompt to Ollama and return the text response.

    This function builds the JSON payload for Ollama, sends it to the
    /api/generate endpoint, and returns the `response` field from the result.
    It also handles connection errors and HTTP failures gracefully.
    """
    if model is None:
        model = DEFAULT_MODEL

    payload = {
        'model': model,
        'prompt': prompt,
        'stream': False  # stream=False means we wait for the full response before returning
    }

    if system_prompt:
        payload['system'] = system_prompt

    url = f"{OLLAMA_BASE_URL}/api/generate"

    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=data,
            headers={'Content-Type': 'application/json'}
        )

        # 60-second timeout: generation for longer prompts can take 20-40s on modest hardware
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result.get('response', '')
    except urllib.error.HTTPError as e:
        return f"Error: Ollama server returned {e.code}"
    except urllib.error.URLError as e:
        return f"Error: Could not connect to Ollama - {e.reason}"
    except Exception as e:
        return f"Error: {str(e)}"

def check_ollama_status():
    """Check if Ollama is running by hitting /api/tags (the model list endpoint).

    Uses a 5-second timeout to verify the local Ollama server is available and
    retrieves the list of installed models.
    """
    url = f"{OLLAMA_BASE_URL}/api/tags"

    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                models = data.get('models', [])
                return {
                    'available': True,
                    'models': [m.get('name', '') for m in models]
                }
    except:
        pass

    return {'available': False, 'models': []}

def analyse_preferences_with_ai(user_input, available_comics):
    """
    Use Ollama to analyse user preferences and explain recommendations.

    Builds a prompt containing the user's stated preferences and a short summary
    of the available comics, then asks Ollama to explain why the top matches
    are a good fit.
    """
    # Build context about available comics
    comic_context = "Available comics:\n"
    for comic in available_comics[:10]:
        comic_context += f"- {comic.get('title', 'Unknown')}: "
        comic_context += f"${comic.get('price', 0)} - "
        comic_context += f"{comic.get('page_count', 0)} pages - "
        comic_context += f"Characters: {', '.join(comic.get('characters', [])[:3])}\n"
    
    system_prompt = """You are a helpful comic book recommendation assistant. 
Analyse the user's preferences and explain which comics would be perfect for them.
Be specific about WHY each recommendation matches their interests.
Keep responses concise but informative."""
    
    prompt = f"""User said: "{user_input}"

{comic_context}

Based on the user's preferences and the available comics above, recommend the best 3-5 comics.
Explain your reasoning for each recommendation. Format your response as a numbered list."""
    
    return call_ollama(prompt, system_prompt=system_prompt)

def generate_personalized_recommendation(user_profile, marvel_comics):
    """
    Generate a personalized recommendation using AI.

    Converts the user's profile into a prompt and asks Ollama to score the top
    comics with match reasons. This is used for richer recommendation output.
    """
    # Build user profile summary
    profile_text = f"User likes: {user_profile.get('heroes', 'various')}, "
    profile_text += f"Genres: {user_profile.get('genres', 'all')}, "
    profile_text += f"Mood: {user_profile.get('mood', 'any')}"
    
    # Create comic catalog for AI to work with
    comic_catalog = []
    for comic in marvel_comics[:20]:
        comic_catalog.append({
            'title': comic.get('title', ''),
            'price': comic.get('price', 0),
            'image': comic.get('image', ''),
            'description': comic.get('description', '')[:200],
            'characters': comic.get('characters', [])[:3],
            'series': comic.get('series', '')
        })
    
    system_prompt = """You are a comic book expert. Given a user's preference profile and a list of available comics,
recommend the best matches. Return your response as a JSON array with this exact format:
[
  {"reason": "why this matches", "match_score": 85}
]
Where match_score is 0-100. Only return the JSON, nothing else."""
    
    prompt = f"""User Profile: {profile_text}

Available Comics:
{json.dumps(comic_catalog, indent=2)}

Recommend the top 5 comics for this user. Return JSON only."""
    
    result = call_ollama(prompt, system_prompt=system_prompt)
    
    # Try to parse JSON response
    try:
        # Find JSON in response
        start = result.find('[')
        end = result.rfind(']') + 1
        if start >= 0 and end > start:
            recommendations = json.loads(result[start:end])
            
            # Attach recommendations to comics
            for i, rec in enumerate(recommendations):
                if i < len(marvel_comics):
                    marvel_comics[i]['ai_reason'] = rec.get('reason', '')
                    marvel_comics[i]['match_score'] = rec.get('match_score', 0)
    except:
        # If JSON parsing fails, just use the comics as-is
        pass
    
    return marvel_comics

def get_ai_explanation(comic_title, user_preferences):
    """
    Get an AI-generated explanation of why a comic matches user preferences.

    This helper generates concise user-facing reasoning for a single comic.
    """
    system_prompt = """You are a comic book expert. Provide brief, engaging explanations 
about why comics match user preferences. Keep it to 2-3 sentences."""
    
    prompt = f"""Why would someone who likes "{user_preferences}" enjoy "{comic_title}"?
Give a short, compelling reason."""
    
    return call_ollama(prompt, system_prompt=system_prompt)

def chat_with_ai_about_comics(message, context=None):
    """
    General chat endpoint for discussing comics with AI.

    This helper wraps user input in a friendly system prompt and optionally
    includes additional context such as comic metadata or chat history.
    """
    system_prompt = """You are ComicHelper, an enthusiastic comic book assistant.
You help users discover new comics, explain storylines, and give recommendations.
Be friendly, knowledgeable, and keep responses engaging. If you mention specific 
comics, note that real pricing and availability may vary."""
    
    prompt = message
    if context:
        prompt = f"Context: {context}\n\nUser: {message}"
    
    return call_ollama(prompt, system_prompt=system_prompt)


# Demo function to show how it works
def demo():
    """Demo the AI integration"""
    print("🤖 Ollama AI Comic Assistant Demo")
    print("=" * 50)
    
    # Check status
    status = check_ollama_status()
    print(f"\nOllama Status: {'✅ Available' if status['available'] else '❌ Not Running'}")
    if status['available']:
        print(f"Available Models: {', '.join(status['models'][:5])}")
    
    # Test chat
    print("\n" + "-" * 50)
    print("Testing AI Chat:")
    response = chat_with_ai_about_comics("What are some good Spider-Man comics?")
    print(f"AI: {response[:200]}...")

if __name__ == '__main__':
    demo()