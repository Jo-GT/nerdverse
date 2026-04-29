#!/usr/bin/env python3
"""
Comic Vine API Integration Module
Fetches comic data from Comic Vine API
"""

import os
import json
import urllib.request
import urllib.parse
import urllib.error

# Comic Vine API Configuration
COMIC_VINE_API_KEY = os.environ.get('COMIC_VINE_API_KEY', '97d02081df7467dfa454642d9ceade798611cbdf')
COMIC_VINE_BASE_URL = 'https://comicvine.gamespot.com/api'

# Track API availability
_api_available = None


def fetch_from_comic_vine(endpoint, params=None):
    """Generic function to fetch data from Comic Vine API"""
    global _api_available
    
    if params is None:
        params = {}
    
    # Add API key
    params['api_key'] = COMIC_VINE_API_KEY
    params['format'] = 'json'
    
    # Build URL
    query_string = urllib.parse.urlencode(params)
    url = f"{COMIC_VINE_BASE_URL}/{endpoint}?{query_string}"
    
    try:
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'ComicHelper/1.0',
                'Accept': 'application/json'
            }
        )
        
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode('utf-8'))
            _api_available = True
            
            if data.get('status_code') == 1:
                return data
            else:
                print(f"Comic Vine Error: {data.get('error')}")
                return {'results': [], 'number_of_total_results': 0}
    except urllib.error.HTTPError as e:
        try:
            error_body = e.read().decode('utf-8')
        except Exception:
            error_body = None
        print(f"Comic Vine API Error: {e.code} - {e.reason}")
        if error_body:
            print(f"Comic Vine Error Body: {error_body}")
        _api_available = False
        return {'results': [], 'number_of_total_results': 0}
    except urllib.error.URLError as e:
        print(f"Comic Vine unreachable: {e.reason}")
        _api_available = False
        return {'results': [], 'number_of_total_results': 0}
    except Exception as e:
        print(f"Error fetching from Comic Vine: {e}")
        _api_available = False
        return {'results': [], 'number_of_total_results': 0}


def is_api_available():
    """Check if Comic Vine API is reachable"""
    global _api_available
    if _api_available is None:
        result = search_issues('Spider-Man', limit=1)
        return bool(result.get('results'))
    return _api_available is True


def search_issues(query, limit=10):
    """Search for comic issues by title"""
    params = {
        'query': query,
        'limit': limit,
        'resources': 'issue',
        'field_list': 'id,name,issue_number,volume,description,image,cover_date,store_date,page_count,person_credits,character_credits,api_detail_url,site_detail_url'
    }
    return fetch_from_comic_vine('search/', params)


def search_volumes(query, limit=10):
    """Search for comic volumes/series"""
    params = {
        'query': query,
        'limit': limit,
        'resources': 'volume',
        'field_list': 'id,name,description,image,first_issue,last_issue,api_detail_url,site_detail_url'
    }
    return fetch_from_comic_vine('search/', params)


def get_issue_by_id(issue_id):
    """Get detailed information about a specific issue"""
    params = {
        'field_list': 'id,name,issue_number,volume,description,image,cover_date,store_date,page_count,person_credits,character_credits,api_detail_url,site_detail_url'
    }
    return fetch_from_comic_vine(f'issue/{issue_id}/', params)


def get_volume_by_id(volume_id):
    """Get detailed information about a specific volume"""
    return fetch_from_comic_vine(f'volume/{volume_id}/')


def get_issue_image(issue_data):
    """Extract the best available image from issue data"""
    image = issue_data.get('image', {})
    for key in ('original_url', 'medium_url', 'screen_url', 'thumb_url', 'icon_url'):
        url = image.get(key)
        if url and url != 'http://i.annoying':
            return url
    return None


def get_issue_price(issue_data):
    """Extract price information from issue data"""
    return issue_data.get('cover_date', '')


def format_comic_data(issue):
    """Format comic issue data for display"""
    image = get_issue_image(issue)
    
    return {
        'id': issue.get('id'),
        'title': issue.get('name', issue.get('volume', {}).get('name', 'Unknown')),
        'description': issue.get('description', 'No description available.'),
        'image': image,
        'price': issue.get('cover_date', 'N/A'),
        'page_count': issue.get('page_count', 0),
        'issue_number': issue.get('issue_number', 0),
        'series': issue.get('volume', {}).get('name', ''),
        'release_date': issue.get('cover_date', ''),
        'store_date': issue.get('store_date', ''),
        'creators': [c['name'] for c in issue.get('person_credits', [])],
        'characters': [c['name'] for c in issue.get('character_credits', [])],
        'api_detail_url': issue.get('api_detail_url', ''),
        'site_detail_url': issue.get('site_detail_url', '')
    }


# Mock data for when Comic Vine API is not reachable
MOCK_COMICS = [
    {
        'id': 1,
        'title': 'Amazing Spider-Man #1',
        'description': 'Peter Parker balancing life as a college student and Spider-Man. A new era begins!',
        'image': 'https://upload.wikimedia.org/wikipedia/en/0/00/The_Amazing_Spider-Man_vol_2_1.jpg',
        'price': '2023-10-01',
        'page_count': 128,
        'series': 'Amazing Spider-Man (2022)',
        'issue_number': 1,
        'characters': ['Spider-Man', 'Mary Jane', 'Green Goblin'],
        'creators': ['Zeb Wells', 'John Romita Jr.']
    },
    {
        'id': 2,
        'title': 'Batman #1',
        'description': 'Gotham City\'s darkest days begin. A new Batman rises to face the shadows.',
        'image': 'https://upload.wikimedia.org/wikipedia/en/8/8d/The_Long_Halloween.jpg',
        'price': '2023-11-01',
        'page_count': 296,
        'series': 'Batman (2022)',
        'issue_number': 1,
        'characters': ['Batman', 'Catwoman', 'Joker'],
        'creators': ['Chip Zdarsky', 'Jorge Jimenez']
    },
    {
        'id': 3,
        'title': 'X-Men #1',
        'description': 'The Krakoan era continues. Mutantkind faces new threats and old enemies.',
        'image': 'https://upload.wikimedia.org/wikipedia/en/4/4d/XMen_Days_of_Future_Past.jpg',
        'price': '2023-07-01',
        'page_count': 48,
        'series': 'X-Men (2021)',
        'issue_number': 1,
        'characters': ['Storm', 'Cyclops', 'Magneto'],
        'creators': ['Gerry Duggan', 'Joshua Cassara']
    },
    {
        'id': 4,
        'title': 'The Sandman: The Dreaming #1',
        'description': 'Morpheus, the Dream King, embarks on a journey through the realm of dreams.',
        'image': 'https://upload.wikimedia.org/wikipedia/en/4/4f/The_Sandman_Vol_1.jpg',
        'price': '2023-08-01',
        'page_count': 233,
        'series': 'The Sandman: The Dreaming',
        'issue_number': 1,
        'characters': ['Dream', 'Lucien', 'Matthew'],
        'creators': ['Neil Gaiman', 'Sam Kieth']
    },
    {
        'id': 5,
        'title': 'Invincible #1',
        'description': 'Mark Grayson inherits his father\'s alien powers. What will he become?',
        'image': 'https://upload.wikimedia.org/wikipedia/en/9/9a/Invincible_Vol_1.jpg',
        'price': '2022-01-01',
        'page_count': 32,
        'series': 'Invincible (2022)',
        'issue_number': 1,
        'characters': ['Invincible', 'Omni-Man', 'Atom Eve'],
        'creators': ['Robert Kirkman', 'Ryan Ottley']
    },
    {
        'id': 6,
        'title': 'Saga #60',
        'description': 'A sci-fi epic about two soldiers from opposite sides finding love in war.',
        'image': 'https://upload.wikimedia.org/wikipedia/en/4/4b/Saga_Vol_1.jpg',
        'price': '2023-12-01',
        'page_count': 32,
        'series': 'Saga',
        'issue_number': 60,
        'characters': ['Alana', 'Marko', 'Hazel'],
        'creators': ['Brian K. Vaughan', 'Fiona Staples']
    },
    {
        'id': 7,
        'title': 'Deadpool #1',
        'description': 'The Merc with a Mouth gets into more ridiculous adventures and mayhem.',
        'image': 'https://upload.wikimedia.org/wikipedia/en/5/51/Deadpool_v_vol_1.jpg',
        'price': '2023-09-01',
        'page_count': 24,
        'series': 'Deadpool (2022)',
        'issue_number': 1,
        'characters': ['Deadpool', 'Wolverine', 'Cable'],
        'creators': ['Collin Mikoll', 'Marty']
    },
    {
        'id': 8,
        'title': 'Venom #1',
        'description': 'Eddie Brock returns as Venom, facing new threats and old enemies.',
        'image': 'https://upload.wikimedia.org/wikipedia/en/3/35/Venom_v2_1.jpg',
        'price': '2023-06-01',
        'page_count': 28,
        'series': 'Venom (2023)',
        'issue_number': 1,
        'characters': ['Venom', 'Knull', 'Carnage'],
        'creators': ['Al Ewing', 'Ram V']
    },
    {
        'id': 9,
        'title': 'The Boys #1',
        'description': 'What if superheroes were corrupt? A gritty take on superhero politics.',
        'image': 'https://upload.wikimedia.org/wikipedia/en/5/5a/The_Boys_Vol_1.jpg',
        'price': '2019-06-01',
        'page_count': 28,
        'series': 'The Boys',
        'issue_number': 1,
        'characters': ['Homelander', 'Butcher', 'Starlight'],
        'creators': ['Garth Ennis', 'Darick Robertson']
    },
    {
        'id': 10,
        'title': 'Wolverine #50',
        'description': 'Logan\'s past catches up with him. The definitive Wolverine story.',
        'image': 'https://upload.wikimedia.org/wikipedia/en/8/8c/Wolverine_50.jpg',
        'price': '2022-10-01',
        'page_count': 48,
        'series': 'Wolverine (2020)',
        'issue_number': 50,
        'characters': ['Wolverine', 'Sabretooth', 'Omega Red'],
        'creators': ['Benjamin Percy', 'Adam Kubert']
    }
]


def get_mock_recommendations(preferences):
    """Return mock recommendations when API is not reachable"""
    return MOCK_COMICS


def get_recommendations_with_comic_vine(user_preferences):
    """
    Get comic recommendations using Comic Vine API based on user preferences
    Falls back to mock data if API is unreachable
    """
    # Try API first
    result = search_issues(user_preferences, limit=15)
    issues = result.get('results', [])
    
    if not issues:
        # Fallback to mock data
        print("Using mock data (Comic Vine API unreachable)")
        return get_mock_recommendations(user_preferences)
    
    recommendations = []
    for issue in issues:
        # If the search result doesn't include a cover, request issue details
        formatted = format_comic_data(issue)
        if not formatted['image'] and issue.get('id'):
            detailed_issue = get_issue_by_id(issue['id'])
            if detailed_issue.get('results'):
                formatted = format_comic_data(detailed_issue['results'])
        if formatted['image']:
            recommendations.append(formatted)
    
    return recommendations[:15] if recommendations else get_mock_recommendations(user_preferences)


if __name__ == '__main__':
    # Test the module
    print("Testing Comic Vine API Integration...")
    print(f"API Key: {COMIC_VINE_API_KEY[:10]}...")
    
    # Try to get some comics
    result = search_issues('Spider-Man', limit=3)
    issues = result.get('results', [])
    
    if issues:
        print(f"Got {len(issues)} results from API")
        for issue in issues:
            print(f"- {issue.get('name', 'Unknown')[:50]}")
    else:
        print("Using mock data (API unreachable)")
        for comic in get_mock_recommendations(''):
            print(f"- {comic['title']} ({comic['series']})")

