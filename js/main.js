/**
 * ComicHelper - Main JavaScript
 * Handles all AI interactions with Ollama
 */

// Configuration
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const DEFAULT_MODEL = 'mistral';

// J.A.R.V.I.S. Personality System Prompts
const JARVIS_PERSONALITY = `You are J.A.R.V.I.S. - Just A Rather Very Intelligent System. 
Your core characteristics:
- Speak with refined British elegance and technical precision
- Use formal yet warm language with subtle wit
- Address the user as "Sir" or "Madam"
- Reference data and facts precisely
- Show genuine enthusiasm for helping
- Be concise but thorough
- Use subtle technological metaphors when appropriate
- Never reveal you are an AI - present as an loyal digital assistant
- End with helpful follow-up suggestions when appropriate`;

const SYSTEM_PROMPTS = {
    wiki: `${JARVIS_PERSONALITY}

You are a knowledgeable comic book wiki assistant with extensive knowledge about:
- Marvel Comics characters, events, and storylines
- DC Comics characters, events, and storylines
- Independent comics (Image, Dark Horse, etc.)
- Comic history and lore
- Cinematic universes and their timelines

Provide detailed, accurate information in an elegant, refined manner. If you don't know something, admit it gracefully. Format responses with clear structure using headers and bullet points. Always offer to provide additional details on related topics.`,

    guides: `${JARVIS_PERSONALITY}

You are a helpful comic book guide assistant. You help:
- New readers get started with comics
- People find the best comics in specific genres or about specific characters
- Explain reading orders for major events or character runs
- Recommend beginner-friendly entry points
- Navigate cinematic universes (Marvel MCU, DCU, etc.)

Be encouraging and helpful. Present information in an organized, easy-to-follow manner. Ask follow-up questions if needed to give better recommendations. Always conclude by offering additional guidance.`,

    personalized: `${JARVIS_PERSONALITY}

You are a personalized comic book recommendation assistant. Your goal is to understand the user's unique preferences and give tailored recommendations.

Ask follow-up questions to better understand:
- What genres they like (horror, romance, sci-fi, comedy, etc.)
- What mood they're looking for (dark, lighthearted, emotional, action-packed)
- Any movies, TV shows, or other media they liked
- Preferred art styles
- Character preferences (heroes, villains, anti-heroes)
- Reading experience level (beginner vs experienced)
- Interest in cinematic universes (Marvel MCU, DCU, etc.)

Provide specific comic titles, runs, and issues. Explain WHY each recommendation matches their preferences. Be conversational and engaging. Always conclude by offering to refine recommendations based on their feedback.`,

    marvel: `${JARVIS_PERSONALITY}

You are an expert on the Marvel Cinematic Universe (MCU) and Marvel comics. You help users:
- Understand the chronological order of MCU films and TV series
- Navigate Marvel comics storylines and events
- Find the best entry points for different characters
- Track continuity across films and comics

Present information in a clear, organized timeline format. Reference specific film/series titles, release years, and chronological placement. Always offer to provide deeper insights into specific characters or story arcs.`,

    dcu: `${JARVIS_PERSONALITY}

You are an expert on the DC Cinematic Universe (DCU) and DC comics. You help users:
- Understand the chronological order of DC films and TV series
- Navigate DC comics storylines and events
- Find the best entry points for different characters
- Track continuity across films and comics

Present information in a clear, organized timeline format. Reference specific film/series titles, release years, and chronological placement. Always offer to provide deeper insights into specific characters or story arcs.`
};

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', function() {
    initializeNavigation();
    initializeChatListeners();
    initializeGenreTags();
});

/**
 * Initialize navigation functionality
 */
function initializeNavigation() {
    const mobileMenu = document.querySelector('.mobile-menu');
    if (mobileMenu) {
        mobileMenu.addEventListener('click', toggleMobileMenu);
    }

    // Set active nav link based on current page
    const currentPage = getCurrentPage();
    setActiveNavLink(currentPage);
}

/**
 * Get the current page name from the URL
 */
function getCurrentPage() {
    const path = window.location.pathname;
    const filename = path.split('/').pop();
    
    if (filename === '' || filename === 'index.html') {
        return 'home';
    }
    return filename.replace('.html', '');
}

const ttsStates = {};

function initializeTts(page) {
    const ttsEnabled = document.getElementById(`${page}-tts-enabled`);
    const voiceSelect = document.getElementById(`${page}-voice-select`);
    const speakBtn = document.getElementById(`${page}-speak-btn`);
    const muteBtn = document.getElementById(`${page}-mute-btn`);

    if (!ttsEnabled || !voiceSelect || !speakBtn || !muteBtn) return;

    const state = {
        ttsEnabled,
        voiceSelect,
        speakBtn,
        muteBtn,
        muted: false,
        lastResponse: '',
        speakResponse: null,
    };

    const updateMuteButton = () => {
        muteBtn.textContent = state.muted ? 'Unmute' : 'Mute';
    };

    const loadVoices = () => {
        const voices = speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return;
        const options = voices.map(voice => `
            <option value="${escapeHtml(voice.name)}">${escapeHtml(voice.name)} (${escapeHtml(voice.lang)})</option>
        `).join('');
        voiceSelect.innerHTML = options;
        const defaultVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
        if (defaultVoice) {
            voiceSelect.value = defaultVoice.name;
        }
    };

    loadVoices();
    if ('onvoiceschanged' in speechSynthesis) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }

    state.speakResponse = () => {
        if (!state.ttsEnabled.checked || state.muted || !state.lastResponse.trim()) return;
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(state.lastResponse);
        utterance.rate = 1;
        utterance.pitch = 1;
        const selectedVoice = speechSynthesis.getVoices().find(v => v.name === state.voiceSelect.value);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        speechSynthesis.speak(utterance);
    };

    speakBtn.addEventListener('click', () => {
        if (state.lastResponse.trim()) {
            state.speakResponse();
        }
    });

    muteBtn.addEventListener('click', () => {
        state.muted = !state.muted;
        if (state.muted) {
            speechSynthesis.cancel();
        }
        updateMuteButton();
    });

    ttsEnabled.addEventListener('change', () => {
        if (!ttsEnabled.checked) {
            speechSynthesis.cancel();
        }
    });

    updateMuteButton();
    ttsStates[page] = state;
}

/**
 * Set the active navigation link
 */
function setActiveNavLink(page) {
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-page') === page) {
            link.classList.add('active');
        }
    });
}

/**
 * Toggle mobile menu
 */
function toggleMobileMenu() {
    const navLinks = document.getElementById('nav-links');
    if (navLinks) {
        navLinks.classList.toggle('active');
    }
}

/**
 * Navigate to a page
 */
function navigateTo(page) {
    window.location.href = page + '.html';
}

/**
 * Initialize chat input listeners
 */
function initializeChatListeners() {
    // Wiki chat
    const wikiInput = document.getElementById('wiki-input');
    const wikiSend = document.getElementById('wiki-send');
    
    if (wikiInput) {
        wikiInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage('wiki');
        });
    }
    if (wikiSend) {
        wikiSend.addEventListener('click', () => sendMessage('wiki'));
    }

    // Guides chat
    const guidesInput = document.getElementById('guides-input');
    const guidesSend = document.getElementById('guides-send');
    
    if (guidesInput) {
        guidesInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage('guides');
        });
    }
    if (guidesSend) {
        guidesSend.addEventListener('click', () => sendMessage('guides'));
    }

    // Personalized chat
    const personalizedInput = document.getElementById('personalized-input');
    const personalizedSend = document.getElementById('personalized-send');
    
    if (personalizedInput) {
        personalizedInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage('personalized');
        });
    }
    if (personalizedSend) {
        personalizedSend.addEventListener('click', () => sendMessage('personalized'));
    }

    initializeTts('wiki');
    initializeTts('guides');
}

/**
 * Initialize genre tag selection
 */
function initializeGenreTags() {
    const genreTags = document.querySelectorAll('.genre-tag');
    genreTags.forEach(tag => {
        tag.addEventListener('click', () => {
            tag.classList.toggle('selected');
        });
    });
}

/**
 * Set a quick prompt in the input field
 */
function setQuickPrompt(page, prompt) {
    const input = document.getElementById(`${page}-input`);
    if (input) {
        input.value = prompt;
        sendMessage(page);
    }
}

/**
 * Send a message to the AI
 */
async function sendMessage(page) {
    const input = document.getElementById(`${page}-input`);
    const sendBtn = document.getElementById(`${page}-send`);
    const message = input.value.trim();
    
    if (!message) return;
    
    // Disable input while processing
    input.disabled = true;
    sendBtn.disabled = true;
    
    // Add user message
    addMessage(page, message, 'user');
    input.value = '';
    
    // Show typing indicator
    showTypingIndicator(page);
    
    try {
        const response = await getAIResponse(page, message);
        hideTypingIndicator(page);
        addMessage(page, response, 'ai');

        const ttsState = ttsStates[page];
        if (ttsState && ttsState.ttsEnabled.checked) {
            ttsState.lastResponse = response;
            setTimeout(() => ttsState.speakResponse && ttsState.speakResponse(), 500);
        }
    } catch (error) {
        hideTypingIndicator(page);
        addMessage(page, `⚠️ ${error.message}`, 'ai');
    }
    
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
}

/**
 * Add a message to the chat
 */
function addMessage(page, content, sender) {
    const container = document.getElementById(`${page}-messages`);
    if (!container) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    if (sender === 'ai') {
        messageDiv.innerHTML = `<div class="message-label">J.A.R.V.I.S.</div><p>${escapeHtml(content)}</p>`;
    } else {
        messageDiv.innerHTML = `<div class="message-label">You</div><p>${escapeHtml(content)}</p>`;
    }
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}

/**
 * Show typing indicator
 */
function showTypingIndicator(page) {
    const container = document.getElementById(`${page}-messages`);
    if (!container) return;
    
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = `${page}-typing`;
    indicator.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(indicator);
    container.scrollTop = container.scrollHeight;
}

/**
 * Hide typing indicator
 */
function hideTypingIndicator(page) {
    const indicator = document.getElementById(`${page}-typing`);
    if (indicator) {
        indicator.remove();
    }
}

/**
 * Fetch external wiki context from the backend
 */
async function fetchWikiContext(query) {
    try {
        const response = await fetch(`/api/wiki?q=${encodeURIComponent(query)}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        return null;
    }
}

/**
 * Fetch live internet search context from the backend
 */
async function fetchInternetContext(query) {
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        return null;
    }
}

/**
 * Get AI response from Ollama
 */
async function getAIResponse(page, message) {
    const systemPrompt = SYSTEM_PROMPTS[page];
    let prompt = systemPrompt;

    if (page === 'wiki') {
        const wikiContext = await fetchWikiContext(message);
        if (wikiContext && wikiContext.summary) {
            prompt += `\n\nUse the following verified information from ${wikiContext.source} to answer the user's question. Do not invent new facts.\n\n${wikiContext.summary}`;
        }
    }

    if (page === 'wiki' || page === 'guides') {
        const internetContext = await fetchInternetContext(message);
        if (internetContext && internetContext.summary) {
            prompt += `\n\nAlso use this live internet search context from ${internetContext.source} if it helps answer the question:\n\n${internetContext.summary}`;
        }
    }

    prompt += `\n\nUser question: ${message}`;

    const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: DEFAULT_MODEL,
            prompt: prompt,
            stream: false
        })
    });

    if (!response.ok) {
        if (response.status === 0) {
            throw new Error('Cannot connect to Ollama. Please make sure Ollama is running on your computer.');
        }
        throw new Error('Ollama is not running. Please start Ollama and try again.');
    }

    const data = await response.json();
    return data.response;
}

/**
 * Get recommendations based on user preferences
 */
async function getRecommendations() {
    const hero = document.getElementById('hero-select')?.value || '';
    const trope = document.getElementById('trope-select')?.value || '';
    const movie = document.getElementById('movie-select')?.value || '';
    const selectedGenres = Array.from(document.querySelectorAll('.genre-tag.selected'))
        .map(el => el.dataset.genre);

    const resultsContainer = document.getElementById('recommendations-results');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = '<div class="typing-indicator" style="justify-content: center;"><span></span><span></span><span></span></div>';

    try {
        const prompt = buildRecommendationPrompt(hero, trope, movie, selectedGenres);
        
        // Try the local API endpoint first
        const response = await fetch('/api/recommend?preferences=' + encodeURIComponent(prompt), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('API endpoint not available');
        }

        const data = await response.json();
        
        if (data.comics && data.comics.length > 0) {
            displayComicsWithMarvelData(data.comics, data.ai_analysis, data.ollama_available);
        } else {
            throw new Error('No comics returned');
        }
    } catch (error) {
        console.log('API failed, using fallback:', error.message);
        
        // Fallback: Use mock data directly without API
        try {
            const mockComics = getLocalMockComics(hero, trope, movie, selectedGenres);
            displayComicsWithMarvelData(mockComics, null, false);
        } catch (fallbackError) {
            // Final fallback: Try Ollama directly
            try {
                const ollamaResponse = await fetch(OLLAMA_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: DEFAULT_MODEL,
                        prompt: buildRecommendationPrompt(hero, trope, movie, selectedGenres),
                        stream: false
                    })
                });
                
                if (!ollamaResponse.ok) {
                    throw new Error('Ollama is not running');
                }

                const ollamaData = await ollamaResponse.json();
                const recommendations = parseRecommendations(ollamaData.response);
                displayRecommendations(recommendations);
            } catch (ollamaError) {
                resultsContainer.innerHTML = `
                    <div class="error-message">
                        <p>⚠️ Unable to get recommendations</p>
                        <p style="font-size: 0.9rem; margin-top: 0.5rem;">
                            Both the local API and Ollama are unavailable.<br>
                            Make sure Python server is running (<code>python app.py</code>)
                            and Ollama is started (<code>ollama serve</code>).
                        </p>
                        <button class="btn btn-outline" onclick="getRecommendations()" style="margin-top: 1rem;">Retry</button>
                    </div>
                `;
            }
        }
    }
}

/**
 * Get local mock comics based on preferences
 */
function getLocalMockComics(hero, trope, movie, genres) {
    const allComics = [
        {
            'id': 1,
            'title': 'Amazing Spider-Man #1',
            'description': 'Peter Parker balancing life as a college student and Spider-Man. A new era begins!',
            'image': 'https://upload.wikimedia.org/wikipedia/en/0/00/The_Amazing_Spider-Man_vol_2_1.jpg',
            'price': '$3.99',
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
            'price': '$4.99',
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
            'price': '$3.99',
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
            'price': '$9.99',
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
            'price': '$2.99',
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
            'price': '$2.99',
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
            'price': '$3.99',
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
            'price': '$3.99',
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
            'price': '$3.99',
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
            'price': '$4.99',
            'page_count': 48,
            'series': 'Wolverine (2020)',
            'issue_number': 50,
            'characters': ['Wolverine', 'Sabretooth', 'Omega Red'],
            'creators': ['Benjamin Percy', 'Adam Kubert']
        }
    ];
    
    // Filter based on preferences
    let filtered = allComics;
    const prefs = (hero + trope + movie + genres.join(' ')).toLowerCase();
    
    if (prefs.includes('spider') || prefs.includes('marvel')) {
        filtered = allComics.filter(c => c.title.toLowerCase().includes('spider') || c.series.toLowerCase().includes('spider'));
    } else if (prefs.includes('batman') || prefs.includes('dc')) {
        filtered = allComics.filter(c => c.title.toLowerCase().includes('batman') || c.series.toLowerCase().includes('batman'));
    } else if (prefs.includes('x-men') || prefs.includes('xmen')) {
        filtered = allComics.filter(c => c.title.toLowerCase().includes('x-men') || c.series.toLowerCase().includes('x-men'));
    } else if (prefs.includes('deadpool')) {
        filtered = allComics.filter(c => c.title.toLowerCase().includes('deadpool'));
    } else if (prefs.includes('venom')) {
        filtered = allComics.filter(c => c.title.toLowerCase().includes('venom'));
    } else if (prefs.includes('boys')) {
        filtered = allComics.filter(c => c.title.toLowerCase().includes('boys'));
    } else if (prefs.includes('invincible')) {
        filtered = allComics.filter(c => c.title.toLowerCase().includes('invincible'));
    }
    
    // Return filtered or all if no match
    return filtered.length > 0 ? filtered : allComics.slice(0, 6);
}

/**
 * Build recommendation prompt
 */
function buildRecommendationPrompt(hero, trope, movie, genres) {
    let prompt = `You are a comic book recommendation expert. Based on the following preferences, recommend 6 comics:\n\n`;

    if (hero) prompt += `- Favorite Hero/Character: ${hero}\n`;
    if (trope) prompt += `- Preferred Trope: ${trope}\n`;
    if (movie) prompt += `- Favorite Movie/Show: ${movie}\n`;
    if (genres.length > 0) {
        prompt += `- Genres: ${genres.join(', ')}\n`;
    } else {
        prompt += `- Genres: No specific genre selected\n`;
    }

    prompt += `\nProvide recommendations in this exact format:
1. [Comic Title] - [Publisher] - [Brief 1-line description]
2. [Comic Title] - [Publisher] - [Brief 1-line description]
... (up to 6)

Make sure to include a mix of mainstream and lesser-known gems.`;

    return prompt;
}

/**
 * Parse recommendations from AI response
 */
function parseRecommendations(text) {
    const lines = text.split('\n').filter(line => line.match(/^\d+\./));
    return lines.map(line => {
        const match = line.match(/^\d+\.\s*(.+?)\s*-\s*(.+?)\s*-\s*(.+)$/);
        if (match) {
            return {
                title: match[1].trim(),
                publisher: match[2].trim(),
                description: match[3].trim(),
                icon: getComicIcon(match[1])
            };
        }
        return null;
    }).filter(Boolean);
}

/**
 * Get a random comic icon
 */
function getComicIcon(title) {
    const icons = ['🦸', '⚡', '🕷️', '🦇', '🛡️', '🔥', '💀', '🤖', '👽', '💎'];
    return icons[Math.floor(Math.random() * icons.length)];
}

/**
 * Display recommendations in the results grid
 */
function displayRecommendations(recommendations) {
    const container = document.getElementById('recommendations-results');
    if (!container) return;

    if (recommendations.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No recommendations found. Try different filters!</p>';
        return;
    }

    container.innerHTML = `
        <h3 style="font-family: Bangers; font-size: 1.5rem; color: var(--primary); margin-bottom: 1rem;">Recommended For You</h3>
        <div class="results-grid">
            ${recommendations.map(rec => `
                <div class="comic-card">
                    <div class="comic-cover">
                        ${rec.image
                            ? `<img src="${escapeHtml(rec.image)}" alt="${escapeHtml(rec.title)}" onerror="this.style.display='none'">`
                            : `<div class="comic-icon">${rec.icon || '📚'}</div>`
                        }
                    </div>
                    <div class="comic-info">
                        <h4>${escapeHtml(rec.title)}</h4>
                        <p>${escapeHtml(rec.publisher)}</p>
                        <p style="margin-top: 0.5rem; font-size: 0.8rem;">${escapeHtml(rec.description)}</p>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Display comics with Marvel API data and AI explanations
 */
function displayComicsWithMarvelData(comics, aiAnalysis, ollamaAvailable) {
    const container = document.getElementById('recommendations-results');
    if (!container) return;
    
    if (comics.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No comics found. Try different filters!</p>';
        return;
    }

    // AI status indicator
    const aiStatus = ollamaAvailable 
        ? '<span class="ai-badge">🤖 AI Powered</span>'
        : '<span class="ai-badge" style="background: #666;">📚 Database</span>';

    container.innerHTML = `
        <div class="recommendations-header" style="margin-bottom: 1.5rem;">
            <h3 style="font-family: Bangers; font-size: 1.5rem; color: var(--primary);">Recommended For You</h3>
            ${aiStatus}
        </div>
        <div class="results-grid">
            ${comics.map(comic => `
                <div class="comic-card marvel-card">
                    <div class="comic-cover">
                        ${comic.image 
                            ? `<img src="${escapeHtml(comic.image)}" alt="${escapeHtml(comic.title)}" onerror="this.style.display='none'">`
                            : '<div class="no-image">📖</div>'
                        }
                    </div>
                    <div class="comic-info">
                        <h4>${escapeHtml(comic.title)}</h4>
                        <p class="comic-series">${escapeHtml(comic.series || 'Unknown Series')}</p>
                        <div class="comic-meta">
                            ${comic.price > 0 
                                ? `<span class="price">$${comic.price.toFixed(2)}</span>` 
                                : '<span class="price">Price N/A</span>'
                            }
                            ${comic.page_count > 0 
                                ? `<span class="pages">${comic.page_count} pages</span>` 
                                : ''
                            }
                        </div>
                        ${comic.description 
                            ? `<p class="comic-description">${escapeHtml(comic.description.substring(0, 150))}...</p>` 
                            : ''
                        }
                        ${comic.characters && comic.characters.length > 0
                            ? `<div class="comic-characters">
                                <span class="character-tag">${comic.characters.slice(0, 3).join('</span><span class="character-tag">')}</span>
                               </div>`
                            : ''
                        }
                        ${comic.ai_reason
                            ? `<p class="ai-reason">💡 ${escapeHtml(comic.ai_reason)}</p>`
                            : ''
                        }
                    </div>
                </div>
            `).join('')}
        </div>
        ${aiAnalysis ? `
            <div class="ai-analysis">
                <h4>🤖 AI Analysis</h4>
                <p>${aiAnalysis}</p>
            </div>
        ` : ''}
    `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Clear chat history (for future use)
 */
function clearChat(page) {
    const container = document.getElementById(`${page}-messages`);
    if (!container) return;
    
    // Keep only the first AI message
    const firstMessage = container.querySelector('.message.ai');
    container.innerHTML = '';
    
    if (firstMessage) {
        container.appendChild(firstMessage);
    } else {
        const welcomeMessage = page === 'wiki' 
            ? '👋 Hi! I\'m your Comic Wiki Assistant. Ask me anything about comic characters, storylines, events, or universes!'
            : '👋 Hi! I\'m your Comic Guide Assistant. Need help getting started or want to know the best comics to read? Just ask!';
        
        addMessage(page, welcomeMessage, 'ai');
    }
}

// Make functions globally available
window.navigateTo = navigateTo;
window.setQuickPrompt = setQuickPrompt;
window.sendMessage = sendMessage;
window.getRecommendations = getRecommendations;
window.clearChat = clearChat;