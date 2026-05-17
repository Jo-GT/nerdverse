/**
 * NerdVerse — Main JavaScript
 *
 * Sections in this file (in order):
 *  1. Configuration constants
 *  2. Startup — model check, navigation, Clerk auth
 *  3. Image attachment helpers
 *  4. Navigation & Clerk auth
 *  5. Tracker — add / load / save / display / progress
 *  6. Comic Vine search & image identification
 *  7. Chat & AI response pipeline
 *  8. Context helpers (wiki, internet, Comic Vine)
 *  9. Recommendations page
 * 10. Utility functions
 */

// ─── 1. Configuration ─────────────────────────────────────────────────────────
// Ollama runs locally; text model (gpt-oss:120b-cloud) and vision-capable models are
// loaded on demand — qwen3-vl:235b-cloud is preferred, with llava as a fallback.
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const DEFAULT_MODEL = 'gpt-oss:120b-cloud';
const PREFERRED_TEXT_MODELS = ['gpt-oss:120b-cloud', 'llama3.2:latest', 'llama3.1', 'llama2'];
const VISION_MODEL = 'qwen3-vl:235b-cloud';
const FALLBACK_VISION_MODELS = ['qwen3-vl:235b-cloud', 'llava']; // install the first available model locally
const IMAGE_ATTACHMENT_NOTE = 'An image attachment is included with the user request. Use it as supplementary context for the comic question.';
// Clerk auth keys — tied to the working-cowbird-13 Clerk instance
const CLERK_PUBLISHABLE_KEY = 'pk_test_d29ya2luZy1jb3diaXJkLTEzLmNsZXJrLmFjY291bnRzLmRldiQ';
const CLERK_DOMAIN = 'working-cowbird-13.clerk.accounts.dev';

// ─── 2. Runtime state ─────────────────────────────────────────────────────────
// availableModels is populated at startup; functions check it before deciding
// which Ollama model to use (text vs vision). Fallback to [DEFAULT_MODEL] ensures
// the UI still works even when Ollama is offline.
let availableModels = [];
let clerkClient = null;
let clerkUserId = null;

function getAvailableVisionModel() {
    return FALLBACK_VISION_MODELS.find(model => availableModels.includes(model)) || null;
}

function getAvailableTextModel() {
    return PREFERRED_TEXT_MODELS.find(model => availableModels.includes(model)) || DEFAULT_MODEL;
}

async function checkAvailableModels() {
    try {
        const response = await fetch('http://localhost:11434/api/tags');
        if (response.ok) {
            const data = await response.json();
            availableModels = data.models?.map(m => m.name) || [];
        }
    } catch (error) {
        console.warn('Could not check available Ollama models:', error);
        // Fallback keeps DEFAULT_MODEL in the list so later checks don't skip AI entirely
        availableModels = [DEFAULT_MODEL];
    }
}

let trackedComics = [];

async function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

async function getImageAttachment(file) {
    const dataUrl = await readFileAsDataURL(file);
    const base64Data = dataUrl.split(',')[1];

    return {
        name: file.name,
        type: file.type,
        data: base64Data,
        fullDataUrl: dataUrl
    };
}

async function getMessageImageData(page) {
    const fileInput = document.getElementById(`${page}-image-upload`);
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        return null;
    }

    try {
        return await getImageAttachment(fileInput.files[0]);
    } catch (error) {
        console.warn(`Could not read image attachment for ${page}:`, error);
        return null;
    }
}

// Clerk auth helpers: load the Clerk SDK, wait for the auth state to settle,
// and redirect users to login if they are not authenticated.
async function loadClerkClient() {
    if (clerkClient) {
        return clerkClient;
    }
    if (!window.Clerk) {
        throw new Error('Clerk library is not loaded');
    }
    await Clerk.load({ 
        publishableKey: CLERK_PUBLISHABLE_KEY,
        domain: CLERK_DOMAIN
    });
    clerkClient = window.Clerk || Clerk;
    return clerkClient;
}

// Poll Clerk for a signed-in user until the timeout expires.
async function waitForClerkUser(timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (window.Clerk?.user || window.Clerk?.isSignedIn) {
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return window.Clerk?.user;
}

// Ensure the tracker page is only visible to authenticated users.
// If authentication is missing, redirect to login.html.
async function ensureAuthenticated() {
    try {
        const clerk = await loadClerkClient();
        let user = clerk.user || window.Clerk?.user;
        const wasSignedIn = window.Clerk?.isSignedIn;
        console.debug('[main.js] ensureAuthenticated start', { user, wasSignedIn });

        if (!user && wasSignedIn !== true) {
            user = await waitForClerkUser();
            console.debug('[main.js] waited for user', { user, wasSignedIn: window.Clerk?.isSignedIn });
        }

        if (!user && window.Clerk?.isSignedIn) {
            user = await waitForClerkUser();
            console.debug('[main.js] second waitForClerkUser', { user, isSignedIn: window.Clerk?.isSignedIn });
        }

        if (!user) {
            console.debug('[main.js] redirecting to login.html because no user', { user, isSignedIn: window.Clerk?.isSignedIn });
            window.location.href = 'login.html';
            return false;
        }

        clerkUserId = user.id;
        console.debug('[main.js] authenticated user', { clerkUserId });
        return true;
    } catch (error) {
        console.error('Clerk auth failed:', error);
        window.location.href = 'login.html';
        return false;
    }
}

// Build a storage key that is scoped to each Clerk user.
function getTrackedComicsStorageKey() {
    return clerkUserId ? `nerdverseTrackedComics:${clerkUserId}` : 'nerdverseTrackedComics';
}

// Sign the user out and clear their local tracker cache.
async function signOutClerk() {
    try {
        console.debug('[main.js] signOutClerk start', { isSignedIn: window.Clerk?.isSignedIn, user: window.Clerk?.user });
        if (window.Clerk?.signOut) {
            await Clerk.signOut();
        } else {
            const clerk = await loadClerkClient();
            if (clerk?.signOut) {
                await clerk.signOut();
            }
        }
    } catch (error) {
        console.warn('Clerk sign out failed:', error);
    }

    clerkUserId = null;
    localStorage.removeItem(getTrackedComicsStorageKey());
    console.debug('[main.js] signOutClerk redirecting to login.html');
    window.location.href = 'login.html';
}

// Show a preview card for the selected tracker image file.
function showTrackerImagePreview(file) {
    const preview = document.getElementById('tracker-image-preview');
    if (!preview) return;

    if (!file) {
        preview.innerHTML = '';
        return;
    }

    const previewUrl = URL.createObjectURL(file);
    preview.innerHTML = `
        <div class="image-preview-card">
            <img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(file.name)} preview" />
            <div class="image-preview-meta">
                <strong>${escapeHtml(file.name)}</strong>
                <span>${Math.round(file.size / 1024)} KB</span>
            </div>
        </div>
    `;
}

// Extract a JSON object from model text output when the response contains extra words.
function parseJsonFromText(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;

    const substring = text.slice(start, end + 1);
    try {
        return JSON.parse(substring);
    } catch (e) {
        return null;
    }
}

// Reset the image upload field and preview for the given page.
function clearImageUpload(page) {
    const fileInput = document.getElementById(`${page}-image-upload`);
    const preview = document.getElementById(`${page}-image-preview`);
    if (fileInput) fileInput.value = '';
    if (preview) preview.innerHTML = '';
}

// Set up image upload listeners and preview rendering for chat pages.
function initialiseImageUpload(page) {
    const fileInput = document.getElementById(`${page}-image-upload`);
    const preview = document.getElementById(`${page}-image-preview`);
    if (!fileInput || !preview) return;

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) {
            preview.innerHTML = '';
            return;
        }

        const previewUrl = URL.createObjectURL(file);
        const visionNote = getAvailableVisionModel()
            ? '<span style="color: var(--secondary);">🤖 AI will analyze this image</span>'
            : '<span style="color: var(--text-secondary);">📎 Image attached (install vision models for AI analysis)</span>';

        preview.innerHTML = `
            <div class="image-preview-card">
                <img src="${previewUrl}" alt="${escapeHtml(file.name)} preview">
                <div class="image-preview-meta">
                    <strong>${escapeHtml(file.name)}</strong>
                    <span>${Math.round(file.size / 1024)} KB</span>
                    <br>
                    ${visionNote}
                </div>
            </div>
        `;
    });
}

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
 * Initialise the application
 */
// Application bootstrap: run core setup when the DOM is ready.
// This includes model discovery, navigation, chat listeners, image uploads,
// tracker initialization, and recommendations if present.
document.addEventListener('DOMContentLoaded', function() {
    checkAvailableModels(); // Check available models first
    initialiseNavigation();
    initialiseChatListeners();
    initialiseGenreTags();
    initialiseImageUpload('wiki');
    initialiseImageUpload('guides');
    initialiseImageUpload('personalized');
    initialiseTrackingPage();
    if (document.getElementById('recommendations-results')) {
        getRecommendations();
    }
});

/**
 * Initialise navigation functionality
 */
function initialiseNavigation() {
    const mobileMenu = document.querySelector('.mobile-menu');
    if (mobileMenu) {
        mobileMenu.addEventListener('click', toggleMobileMenu);
    }

    loadClerkAndUpdateNav();

    // Set active nav link based on current page
    const currentPage = getCurrentPage();
    setActiveNavLink(currentPage);
}

function addLoginIconToNav() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks || document.getElementById('nav-auth-li')) return;

    const li = document.createElement('li');
    li.id = 'nav-auth-li';

    const loginBtn = document.createElement('a');
    loginBtn.id = 'nav-login-btn';
    loginBtn.href = 'login.html';
    loginBtn.className = 'nav-login-link';
    loginBtn.textContent = 'Login';

    li.appendChild(loginBtn);
    navLinks.appendChild(li);

    loadClerkAndUpdateNav();
}

function injectClerkScript() {
    if (window.Clerk) return Promise.resolve();
    if (document.querySelector('script[data-clerk-publishable-key]')) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-clerk-publishable-key]');
            if (existing.dataset.loaded) return resolve();
            existing.addEventListener('load', () => { existing.dataset.loaded = '1'; resolve(); });
            existing.addEventListener('error', reject);
        });
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://${CLERK_DOMAIN}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`;
        script.setAttribute('data-clerk-publishable-key', CLERK_PUBLISHABLE_KEY);
        script.crossOrigin = 'anonymous';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function loadClerkAndUpdateNav() {
    try {
        await injectClerkScript();
        await Clerk.load({ publishableKey: CLERK_PUBLISHABLE_KEY });
        if (Clerk.user) renderNavUserInfo();
    } catch (e) {
        // Clerk unavailable — login button remains
    }
}

function renderNavUserInfo() {
    const li = document.getElementById('nav-auth-li');
    if (!li || !window.Clerk?.user) return;

    const user = Clerk.user;
    const displayName = user.firstName
        || user.emailAddresses?.[0]?.emailAddress?.split('@')[0]
        || 'User';

    li.innerHTML = '';
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.gap = '0.5rem';

    if (user.imageUrl) {
        const img = document.createElement('img');
        img.src = user.imageUrl;
        img.alt = 'avatar';
        img.className = 'nav-avatar';
        li.appendChild(img);
    }

    const nameLink = document.createElement('a');
    nameLink.href = 'tracking.html';
    nameLink.className = 'nav-username-link';
    nameLink.textContent = displayName;
    li.appendChild(nameLink);

    const signOutLink = document.createElement('a');
    signOutLink.href = '#';
    signOutLink.className = 'nav-login-link nav-signout-link';
    signOutLink.textContent = 'Sign Out';
    signOutLink.addEventListener('click', (e) => { e.preventDefault(); signOutClerk(); });
    li.appendChild(signOutLink);
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

function initialiseTts(page) {
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
 * Initialise chat input listeners
 */
function initialiseChatListeners() {
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

    initialiseTts('wiki');
    initialiseTts('guides');
}

/**
 * Initialise genre tag selection
 */
function initialiseGenreTags() {
    const genreTags = document.querySelectorAll('.genre-tag');
    genreTags.forEach(tag => {
        tag.addEventListener('click', () => {
            tag.classList.toggle('selected');
        });
    });
}

// Track page startup: restrict access, wire up search/image buttons, and load saved comics.
async function initialiseTrackingPage() {
    if (!document.getElementById('tracking-page')) return;

    const authed = await ensureAuthenticated();
    if (!authed) return;

    const searchInput = document.getElementById('tracker-search-input');
    const searchBtn = document.getElementById('tracker-search-btn');
    const addBtn = document.getElementById('tracker-add-btn');
    const signOutBtn = document.getElementById('clerk-sign-out-btn');

    if (signOutBtn) {
        signOutBtn.addEventListener('click', signOutClerk);
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') fetchTrackerSearch();
        });
    }

    if (searchBtn) {
        searchBtn.addEventListener('click', fetchTrackerSearch);
    }

    const imageInput = document.getElementById('tracker-image-upload');
    if (imageInput) {
        imageInput.addEventListener('change', () => {
            const file = imageInput.files?.[0];
            if (file) {
                showTrackerImagePreview(file);
            } else {
                showTrackerImagePreview(null);
            }
        });
    }

    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const file = document.getElementById('tracker-image-upload')?.files?.[0];
            if (!file) return;

            await identifyComicFromImage(file);
        });
    }

    loadTrackedComics();
    displayTrackerCards();
}

async function fetchTrackerSearch() {
    const query = document.getElementById('tracker-search-input')?.value.trim();
    const resultsContainer = document.getElementById('tracker-search-results');
    if (!resultsContainer) return;
    if (!query) {
        resultsContainer.innerHTML = '<p class="tracker-help-text">Type a comic title or issue to search Comic Vine.</p>';
        return;
    }

    resultsContainer.innerHTML = '<div class="typing-indicator" style="justify-content: flex-start;"><span></span><span></span><span></span></div>';

    try {
        const response = await fetch(`/api/comics?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search failed');
        const results = await response.json();
        renderTrackerSearchResults(Array.isArray(results) ? results.slice(0, 6) : []);
    } catch (error) {
        resultsContainer.innerHTML = `<p class="tracker-help-text">Unable to search Comic Vine: ${escapeHtml(error.message)}</p>`;
    }
}

function renderTrackerSearchResults(results, aiSuggestion = null) {
    const resultsContainer = document.getElementById('tracker-search-results');
    if (!resultsContainer) return;
    if (!results || results.length === 0) {
        resultsContainer.innerHTML = '<p class="tracker-help-text">No comic issues found. Try a different search phrase.</p>';
        return;
    }

    resultsContainer.innerHTML = results.map((comic, index) => {
        const imageUrl = comic.image || comic.image?.medium_url || '';
        const title = comic.title || comic.name || comic.volume?.name || 'Unknown Title';
        const issue = comic.issue_number ? `Issue ${comic.issue_number}` : '';
        const series = comic.series || comic.volume || '';
        const description = comic.description ? comic.description.replace(/<[^>]+>/g, '').slice(0, 120) : 'No description available.';
        const isAiSuggestion = aiSuggestion && title.toLowerCase().includes(aiSuggestion.toLowerCase());

        return `
            <div class="tracker-search-card ${isAiSuggestion ? 'ai-suggested' : ''}">
                ${isAiSuggestion ? '<div class="ai-badge">🤖 AI Suggested</div>' : ''}
                <img src="${escapeHtml(imageUrl || 'images/placeholder.png')}" alt="${escapeHtml(title)}">
                <div class="tracker-search-body">
                    <div class="tracker-search-title">${escapeHtml(title)}</div>
                    <div class="tracker-search-meta">${escapeHtml(series)} ${escapeHtml(issue)}</div>
                    <div class="tracker-search-meta">${escapeHtml(description)}</div>
                    <div class="tracker-card-actions">
                        <button class="btn btn-primary" onclick="addTrackedComicFromSearch(${index})">Add to Tracker</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    window.currentSearchResults = results;
}

function addTrackedComicFromSearch(index) {
    const results = window.currentSearchResults || [];
    const comic = results[index];
    if (!comic) return;

    const tracked = {
        id: comic.id || Date.now(),
        title: comic.title || comic.name || comic.volume?.name || 'Unknown Title',
        series: comic.series || comic.volume || '',
        issue_number: comic.issue_number || '',
        description: comic.description ? comic.description.replace(/<[^>]+>/g, '') : 'No description available.',
        image: comic.image || comic.image?.medium_url || '',
        release_date: comic.release_date || comic.cover_date || '',
        progress: 0,
        // page_count comes from Comic Vine API; current_page lets users track exactly where they are
        page_count: comic.page_count || 0,
        current_page: 0,
        characters: comic.character_credits || [],
        creators: comic.person_credits || []
    };

    addTrackedComic(tracked);
}

function addTrackedComic(comic) {
    const exists = trackedComics.some(item => item.title === comic.title && item.issue_number === comic.issue_number);
    if (exists) {
        alert('This comic is already in your tracker.');
        return;
    }

    trackedComics.unshift(comic);
    saveTrackedComics();
    displayTrackerCards();
}

function loadTrackedComics() {
    const saved = localStorage.getItem(getTrackedComicsStorageKey());
    if (saved) {
        try {
            trackedComics = JSON.parse(saved);
        } catch (error) {
            trackedComics = [];
        }
    }
}

function saveTrackedComics() {
    localStorage.setItem(getTrackedComicsStorageKey(), JSON.stringify(trackedComics));
}

function displayTrackerCards() {
    const container = document.getElementById('tracker-cards');
    const summary = document.getElementById('tracker-summary');
    if (!container || !summary) return;

    if (!trackedComics.length) {
        summary.textContent = 'You have no tracked comics yet. Add one from Comic Vine or manual entry.';
        container.innerHTML = '';
        return;
    }

    summary.textContent = `You are tracking ${trackedComics.length} ${trackedComics.length === 1 ? 'comic' : 'comics'} now.`;
    container.innerHTML = trackedComics.map((comic, index) => {
        const imageUrl = comic.image || 'images/placeholder.png';
        const issue = comic.issue_number ? `Issue ${comic.issue_number}` : comic.release_date || '';
        return `
            <div class="tracker-card">
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(comic.title)}">
                <div class="tracker-card-body">
                    <div class="tracker-card-title">${escapeHtml(comic.title)}</div>
                    <div class="tracker-card-meta">${escapeHtml(comic.series)} ${escapeHtml(issue)}</div>
                    <div class="tracker-card-meta">${escapeHtml(comic.description.slice(0, 110))}...</div>
                    <div class="tracker-card-progress">
                        ${comic.page_count > 0
                            // When Comic Vine supplied a real page count, show an exact page input
                            ? `<label>Page <input type="number" class="tracker-page-input" min="0" max="${comic.page_count}" value="${comic.current_page || 0}" onchange="updateComicPage(${index}, this.value)"> of ${comic.page_count} &nbsp;(${comic.progress}%)</label>`
                            // Fallback: no page count available, keep the simple percentage label
                            : `<label>Progress: ${comic.progress}%</label>`
                        }
                        <div class="progress-track"><div class="progress-fill" style="width: ${comic.progress}%"></div></div>
                    </div>
                    <div class="tracker-card-actions">
                        ${comic.page_count > 0
                            // Page-count mode: jump buttons move by whole pages (10% of total)
                            ? `<button class="btn btn-secondary" onclick="updateComicPage(${index}, Math.max(0, (${comic.current_page || 0}) - Math.ceil(${comic.page_count} * 0.1)))">-10%</button>
                               <button class="btn btn-primary" onclick="updateComicPage(${index}, Math.min(${comic.page_count}, (${comic.current_page || 0}) + Math.ceil(${comic.page_count} * 0.1)))">+10%</button>`
                            // Fallback: plain percentage buttons
                            : `<button class="btn btn-secondary" onclick="updateComicProgress(${index}, -10)">-10%</button>
                               <button class="btn btn-primary" onclick="updateComicProgress(${index}, 10)">+10%</button>`
                        }
                        <button class="btn btn-secondary" onclick="openJarvisForComic(${index})">Discuss with Jarvis</button>
                        <button class="btn btn-secondary" onclick="removeTrackedComic(${index})">Remove</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function updateComicProgress(index, delta) {
    if (!trackedComics[index]) return;
    trackedComics[index].progress = Math.min(100, Math.max(0, trackedComics[index].progress + delta));
    saveTrackedComics();
    displayTrackerCards();
}

// Updates reading position when page_count is known; recalculates % from actual pages
function updateComicPage(index, page) {
    const comic = trackedComics[index];
    if (!comic || !comic.page_count) return;
    comic.current_page = Math.min(comic.page_count, Math.max(0, parseInt(page) || 0));
    comic.progress = Math.round((comic.current_page / comic.page_count) * 100);
    saveTrackedComics();
    displayTrackerCards();
}

function removeTrackedComic(index) {
    trackedComics.splice(index, 1);
    saveTrackedComics();
    displayTrackerCards();
}

function openJarvisForComic(index) {
    const comic = trackedComics[index];
    if (!comic) return;
    const query = encodeURIComponent(comic.title);
    window.location.href = `jarvis_comic.html?comic=${query}`;
}

// Identify a comic from a cover image using the available vision model.
// If the model returns text, the app turns it into search queries against Comic Vine.
async function identifyComicFromImage(file) {
    const resultsContainer = document.getElementById('tracker-search-results');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = '<div class="typing-indicator" style="justify-content: flex-start;"><span></span><span></span><span></span></div>';

    try {
        const imageData = await getImageAttachment(file);
        const availableVisionModel = getAvailableVisionModel();
        const visionModelAvailable = Boolean(availableVisionModel);

        // Vision prompt: tells the vision model to read actual text from the cover rather than guess visually.
        // Being explicit about what to look for (title size, issue number format, publisher logo position)
        // dramatically reduces hallucinated results.
        const aiPrompt = visionModelAvailable
            ? `You are an expert comic book scanner. Look VERY carefully at this comic book cover image. Read ALL visible text on the cover: the title (usually the largest text), issue number (look for "#XX", "ISSUE XX", or a small number near the top or bottom), publisher name or logo (Marvel, DC, Image, Dark Horse, IDW, BOOM!, etc.), and any series subtitle. Do NOT guess — only report what you can actually read from the image. If you are unsure of a value, return an empty string for that key. Return ONLY a valid JSON object with these exact keys: title, issue, publisher, series, description. Example: {"title":"Batman","issue":"50","publisher":"DC","series":"Batman (2016)","description":"Batman standing on a rooftop"}`
            : `You are a comic book expert. The user attached an image of a comic cover, but the app cannot analyze it directly. Based on common knowledge, suggest the best search query for finding this comic using a likely title, issue number, and publisher. Return only valid JSON with keys: title, issue, publisher, series, description, query.`;

        const requestBody = {
            model: availableVisionModel || getAvailableTextModel(),
            prompt: aiPrompt,
            stream: false
        };

        if (visionModelAvailable) {
            requestBody.images = [imageData.data];
        }

        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error('AI analysis failed');

        const data = await response.json();
        const aiResponse = data.response || '';
        const parsed = parseJsonFromText(aiResponse) || {};

        let suggestedTitle = (parsed.title || '').trim();
        let suggestedIssue = (parsed.issue || '').trim();
        let suggestedPublisher = (parsed.publisher || '').trim();
        const fallbackQuery = (parsed.query || '').trim();

        // Regex fallbacks in case the model returned plain text instead of JSON
        if (!suggestedTitle) {
            const titleMatch = aiResponse.match(/Title:\s*(.+)/i);
            if (titleMatch) suggestedTitle = titleMatch[1].trim();
        }
        if (!suggestedIssue) {
            const issueMatch = aiResponse.match(/Issue:\s*(.+)/i);
            if (issueMatch) suggestedIssue = issueMatch[1].trim();
        }

        if (!suggestedTitle && !fallbackQuery) {
            resultsContainer.innerHTML = `<p class="tracker-help-text">The cover AI could not identify a usable search query. Try a clearer image or search manually.</p>`;
            return;
        }

        // Show what the AI detected so the user can judge accuracy before results load
        const identifiedParts = [
            suggestedTitle,
            suggestedIssue ? `#${suggestedIssue}` : '',
            suggestedPublisher ? `(${suggestedPublisher})` : ''
        ].filter(Boolean);
        if (identifiedParts.length) {
            resultsContainer.innerHTML = `<p class="tracker-ai-banner">🤖 AI identified: <strong>${escapeHtml(identifiedParts.join(' '))}</strong> — searching Comic Vine...</p>`;
        }

        // Progressive search: try increasingly broad queries so a specific issue match is preferred
        // but we still get results if only the title was recognised
        const searchAttempts = [
            suggestedTitle && suggestedIssue ? `${suggestedTitle} ${suggestedIssue}` : null,
            suggestedTitle && suggestedPublisher ? `${suggestedTitle} ${suggestedPublisher}` : null,
            suggestedTitle || fallbackQuery
        ].filter(Boolean);

        let searchResults = null;
        for (const query of searchAttempts) {
            const searchResponse = await fetch(`/api/comics?q=${encodeURIComponent(query)}`);
            if (!searchResponse.ok) continue;
            const results = await searchResponse.json();
            if (Array.isArray(results) && results.length > 0) {
                searchResults = results;
                break;
            }
        }

        if (!searchResults || searchResults.length === 0) {
            resultsContainer.innerHTML = `<p class="tracker-help-text">No comics found for "${escapeHtml(suggestedTitle || fallbackQuery)}". Try a different image or search manually.</p>`;
            return;
        }

        renderTrackerSearchResults(searchResults.slice(0, 6), suggestedTitle || fallbackQuery);

    } catch (error) {
        resultsContainer.innerHTML = `<p class="tracker-help-text">Unable to identify comic from image: ${escapeHtml(error.message)}</p>`;
    }
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
    
    const imageData = await getMessageImageData(page);
    
    // Add user message with image if present
    addMessage(page, message, 'user', imageData);
    input.value = '';
    
    // Clear image upload after sending
    clearImageUpload(page);
    
    // Show typing indicator
    showTypingIndicator(page);
    
    try {
        const response = await getAIResponse(page, message, imageData);
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
function addMessage(page, content, sender, imageData = null) {
    const container = document.getElementById(`${page}-messages`);
    if (!container) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    let messageContent = '';
    if (sender === 'ai') {
        messageContent = `<div class="message-label">J.A.R.V.I.S.</div>${formatChatText(content)}`;
    } else {
        messageContent = `<div class="message-label">You</div>`;
        
        // Add image if present
        if (imageData) {
            const visionStatus = getAvailableVisionModel()
                ? '<span style="color: var(--secondary)">🤖 AI can analyze this</span>'
                : '<span style="color: var(--text-secondary)">📎 Image attached</span>';
            
            messageContent += `
                <div class="message-image">
                    <img src="${escapeHtml(imageData.fullDataUrl)}" alt="${escapeHtml(imageData.name)}" style="max-width: 200px; max-height: 200px; border-radius: 8px; margin-bottom: 0.5rem;">
                    <div class="image-caption">
                        📎 ${escapeHtml(imageData.name)} • ${visionStatus}
                    </div>
                </div>
            `;
        }
        
        messageContent += `<p>${escapeHtml(content)}</p>`;
    }
    
    messageDiv.innerHTML = messageContent;
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

function formatChatText(text) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    const paragraphs = escaped.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);
    return paragraphs.map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`).join('');
}

// ─── 8. Context helpers ───────────────────────────────────────────────────────
// These three helpers fetch supplementary context from the backend and return it
// as plain objects. getAIResponse() appends the results to the Ollama prompt so
// answers reflect current wiki/internet/Comic Vine data rather than the model's
// training cutoff. Each helper silently returns null on any network error so a
// slow external service never breaks the chat UI.

// Calls the backend /api/wiki route which tries Marvel Fandom → DC Fandom → Wikipedia
async function fetchWikiContext(query) {
    try {
        const response = await fetch(`/api/wiki?q=${encodeURIComponent(query)}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        return null;
    }
}

// Calls the backend /api/search route which uses DuckDuckGo for live snippets
async function fetchInternetContext(query) {
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        return null;
    }
}

// Calls the backend /api/comics route and formats the top 5 results as a text block
// so the AI can cite specific issues, series, and creators in its answer
async function fetchComicVineContext(query) {
    try {
        const response = await fetch(`/api/comics?q=${encodeURIComponent(query)}`);
        if (!response.ok) return null;
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) return null;
        const top = data.slice(0, 5);
        let summary = `Comic Vine search results for "${query}":\n`;
        top.forEach(comic => {
            summary += `- ${comic.title || 'Unknown'} (${comic.series || 'No series'})`;
            if (comic.issue_number) summary += ` #${comic.issue_number}`;
            if (comic.description) summary += ` — ${comic.description.replace(/\n/g, ' ').slice(0, 120)}...`;
            summary += `\n`;
        });
        return {
            source: 'Comic Vine',
            summary
        };
    } catch (error) {
        return null;
    }
}

/**
 * Get AI response from Ollama
 */
// Build the final Ollama prompt for the selected chat page and send it to the model.
// If an image is attached, prefer the available vision model and include the image bytes.
async function getAIResponse(page, message, attachment = null) {
    const systemPrompt = SYSTEM_PROMPTS[page];
    let prompt = systemPrompt;

    // Determine which model to use
    let modelToUse = getAvailableTextModel();
    let images = null;

    if (attachment) {
        const availableVisionModel = getAvailableVisionModel();
        if (availableVisionModel) {
            // Use vision model for image processing
            modelToUse = availableVisionModel;
            images = [attachment.data]; // Ollama expects base64 encoded images
            prompt += `\n\nThe user has attached an image. Analyze the image and use it as context to help answer their comic-related question. Describe what you see in the image and how it relates to comics if applicable.`;
        } else {
            // Fallback: mention the image in text prompt
            prompt += `\n\n${IMAGE_ATTACHMENT_NOTE}`;
            prompt += `\n\nThe user attached an image named ${attachment.name}. Although I cannot directly analyze images (vision models not available), please consider that an image has been attached and provide guidance on how images could help answer comic-related questions.`;
        }
    }

    if (page === 'wiki') {
        const wikiContext = await fetchWikiContext(message);
        if (wikiContext && wikiContext.summary) {
            prompt += `\n\nUse the following verified information from ${wikiContext.source} to answer the user's question. Do not invent new facts.\n\n${wikiContext.summary}`;
        }
    }

    // Internet and Comic Vine context added for all major chat pages so answers reflect current info
    if (page === 'wiki' || page === 'guides' || page === 'personalized' || page === 'marvel' || page === 'dcu') {
        const internetContext = await fetchInternetContext(message);
        if (internetContext && internetContext.summary) {
            prompt += `\n\nAlso use this live internet search context from ${internetContext.source} if it helps answer the question:\n\n${internetContext.summary}`;
        }
    }

    if (page === 'wiki' || page === 'guides' || page === 'personalized' || page === 'marvel' || page === 'dcu') {
        const comicVineContext = await fetchComicVineContext(message);
        if (comicVineContext && comicVineContext.summary) {
            prompt += `\n\nAlso use the following Comic Vine data to answer questions about comics, characters, series, or issues. Cite this information when relevant:\n\n${comicVineContext.summary}`;
        }
    }

    prompt += `\n\nUser question: ${message}`;

    const requestBody = {
        model: modelToUse,
        prompt: prompt,
        stream: false
    };

    // Add images if present and vision model is available
    if (images && getAvailableVisionModel()) {
        requestBody.images = images;
    }

    const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        if (response.status === 0) {
            throw new Error('Cannot connect to Ollama. Please make sure Ollama is running on your computer.');
        }
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
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