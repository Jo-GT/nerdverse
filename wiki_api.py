#!/usr/bin/env python3
"""
Wiki and Fandom API integration for ComicHelper.
Provides reliable external data from Wikipedia and comic fandom wikis.
"""

import json
import urllib.request
import urllib.parse

USER_AGENT = 'ComicHelper/1.0'
WIKIPEDIA_SEARCH_URL = 'https://en.wikipedia.org/w/api.php'
WIKIPEDIA_SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary'
MARVEL_FANDOM_API = 'https://marvel.fandom.com/api.php'
DC_FANDOM_API = 'https://dc.fandom.com/api.php'
DUCKDUCKGO_LOOKUP_URL = 'https://api.duckduckgo.com/'


def _http_get_json(url, params=None, timeout=15):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Wiki API request failed for {url}: {e}")
        return {}


def _get_first_search_title(search_data):
    search_results = search_data.get('query', {}).get('search', [])
    if not search_results:
        return None
    return search_results[0].get('title')


def search_wikipedia(query, limit=3):
    return _http_get_json(WIKIPEDIA_SEARCH_URL, {
        'action': 'query',
        'list': 'search',
        'srsearch': query,
        'srlimit': limit,
        'format': 'json',
        'utf8': 1
    })


def get_wikipedia_summary(title):
    title_encoded = urllib.parse.quote(title, safe='')
    return _http_get_json(f"{WIKIPEDIA_SUMMARY_URL}/{title_encoded}")


def search_fandom(query, wiki='marvel', limit=3):
    api_url = MARVEL_FANDOM_API if wiki == 'marvel' else DC_FANDOM_API
    return _http_get_json(api_url, {
        'action': 'query',
        'list': 'search',
        'srsearch': query,
        'srlimit': limit,
        'format': 'json',
        'utf8': 1
    })


def get_fandom_summary(title, wiki='marvel'):
    api_url = MARVEL_FANDOM_API if wiki == 'marvel' else DC_FANDOM_API
    data = _http_get_json(api_url, {
        'action': 'query',
        'prop': 'extracts',
        'explaintext': 1,
        'exintro': 1,
        'titles': title,
        'format': 'json',
        'utf8': 1,
        'redirects': 1
    })

    pages = data.get('query', {}).get('pages', {})
    for page in pages.values():
        if page.get('extract'):
            return {
                'title': page.get('title', ''),
                'extract': page.get('extract', ''),
                'pageid': page.get('pageid', 0)
            }
    return None


def search_duckduckgo(query):
    return _http_get_json(DUCKDUCKGO_LOOKUP_URL, {
        'q': query,
        'format': 'json',
        'no_html': 1,
        'skip_disambig': 1
    })


def get_internet_context(query):
    query = query.strip()
    if not query:
        return {
            'query': query,
            'title': '',
            'summary': '',
            'source': 'Internet Search',
            'url': ''
        }

    result = search_duckduckgo(query)
    if not result:
        return {
            'query': query,
            'title': '',
            'summary': '',
            'source': 'Internet Search',
            'url': ''
        }

    summary = result.get('AbstractText', '').strip()
    source_url = result.get('AbstractURL', '')

    if not summary:
        related = result.get('RelatedTopics', [])
        for item in related[:4]:
            if isinstance(item, dict) and item.get('Text'):
                summary = item.get('Text').strip()
                source_url = item.get('FirstURL', source_url)
                break
            if isinstance(item, dict) and item.get('Topics'):
                first_topic = item.get('Topics')[0]
                if first_topic and first_topic.get('Text'):
                    summary = first_topic.get('Text').strip()
                    source_url = first_topic.get('FirstURL', source_url)
                    break

    return {
        'query': query,
        'title': result.get('Heading', query),
        'summary': summary,
        'source': 'DuckDuckGo Search',
        'url': source_url
    }


def get_wiki_context(query):
    query = query.strip()
    if not query:
        return {
            'query': query,
            'title': '',
            'summary': '',
            'source': 'Wikipedia',
            'url': ''
        }

    q_lower = query.lower()
    preferred_sources = []
    if any(keyword in q_lower for keyword in ['marvel', 'spider-man', 'iron man', 'x-men', 'avengers', 'wolverine', 'thor', 'loki', 'black panther', 'hulk', 'captain america']):
        preferred_sources.append('marvel')
    if any(keyword in q_lower for keyword in ['dc', 'batman', 'superman', 'wonder woman', 'justice league', 'flash', 'aquaman', 'joker', 'harley quinn']):
        preferred_sources.append('dc')

    # Always include Wikipedia as a fallback.
    preferred_sources.append('wikipedia')

    for source in preferred_sources:
        if source == 'marvel':
            search_data = search_fandom(query, wiki='marvel')
            title = _get_first_search_title(search_data)
            if title:
                summary_data = get_fandom_summary(title, wiki='marvel')
                if summary_data and summary_data.get('extract'):
                    return {
                        'query': query,
                        'title': summary_data.get('title', title),
                        'summary': summary_data.get('extract', ''),
                        'source': 'Marvel Fandom',
                        'url': f'https://marvel.fandom.com/wiki/{urllib.parse.quote(summary_data.get("title", title).replace(" ", "_"))}'
                    }
        elif source == 'dc':
            search_data = search_fandom(query, wiki='dc')
            title = _get_first_search_title(search_data)
            if title:
                summary_data = get_fandom_summary(title, wiki='dc')
                if summary_data and summary_data.get('extract'):
                    return {
                        'query': query,
                        'title': summary_data.get('title', title),
                        'summary': summary_data.get('extract', ''),
                        'source': 'DC Fandom',
                        'url': f'https://dc.fandom.com/wiki/{urllib.parse.quote(summary_data.get("title", title).replace(" ", "_"))}'
                    }
        else:
            search_data = search_wikipedia(query)
            title = _get_first_search_title(search_data)
            if title:
                summary_data = get_wikipedia_summary(title)
                if summary_data and summary_data.get('extract'):
                    return {
                        'query': query,
                        'title': summary_data.get('title', title),
                        'summary': summary_data.get('extract', ''),
                        'source': 'Wikipedia',
                        'url': summary_data.get('content_urls', {}).get('desktop', {}).get('page', '')
                    }

    internet_context = get_internet_context(query)
    return {
        'query': query,
        'title': internet_context.get('title', ''),
        'summary': internet_context.get('summary', ''),
        'source': internet_context.get('source', 'Internet Search'),
        'url': internet_context.get('url', '')
    }
