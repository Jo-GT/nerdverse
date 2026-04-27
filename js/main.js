/**
 * ComicHelper - Main JavaScript
 * Handles all AI interactions with Ollama
 */

// Configuration
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const DEFAULT_MODEL = 'mistral';

// System prompts for different assistants
const SYSTEM_PROMPTS = {
    wiki: `You are a knowledgeable comic book wiki assistant. You have extensive knowledge about:
- Marvel Comics characters, events, and storylines
- DC Comics characters, events, and storylines
- Independent comics (Image, Dark Horse, etc.)
- Comic history and lore

Provide detailed, accurate information. If you don't know something, admit it. Keep responses informative but not overly long. Format your responses with bullet points when appropriate.`,

    guides: `You are a helpful comic book guide assistant. You help:
- New readers get started with comics
- People find the best comics in specific genres or about specific characters
- Explain reading orders for major events or character runs
- Recommend beginner-friendly entry points

Be encouraging and helpful. Ask follow-up questions if needed to give better recommendations.`,

    personalized: `You are a personalized comic book recommendation assistant. Your goal is to understand the user's unique preferences and give tailored recommendations.

Ask follow-up questions to better understand:
- What genres they like (horror, romance, sci-fi, comedy, etc.)
- What mood they're looking for (dark, lighthearted, emotional, action-packed)
- Any movies, TV shows, or other media they liked
- Preferred art styles
- Character preferences (heroes, villains, anti-heroes)
- Reading experience level (beginner vs experienced)

Provide specific comic titles, runs, and issues. Explain WHY each recommendation matches their preferences. Be conversational and engaging.`
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
    messageDiv.innerHTML = `<p>${escapeHtml(content)}</p>`;
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
 * Get AI response from Ollama
 */
async function getAIResponse(page, message) {
    const systemPrompt = SYSTEM_PROMPTS[page];
    const prompt = `${systemPrompt}\n\nUser question: ${message}`;

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
            throw new Error('Ollama is not running');
        }

        const data = await response.json();
        const recommendations = parseRecommendations(data.response);
        displayRecommendations(recommendations);
    } catch (error) {
        resultsContainer.innerHTML = `
            <div class="error-message">
                <p>⚠️ ${error.message}</p>
                <p>Make sure <a href="https://ollama.com" target="_blank">Ollama</a> is running on your computer.</p>
                <button class="btn btn-outline" onclick="getRecommendations()" style="margin-top: 1rem;">Retry</button>
            </div>
        `;
    }
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
                    <div class="comic-cover">${rec.icon}</div>
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