# ComicHelper - AI Comic Assistant

## Project Overview
- **Project Name**: ComicHelper
- **Type**: Web Application (Single Page App with multiple views)
- **Core Functionality**: AI-powered assistant for comic recommendations, wikis, and guides using Ollama
- **Target Users**: Comic book enthusiasts, new readers looking for recommendations

## UI/UX Specification

### Layout Structure
- **Navigation**: Fixed top navbar with logo and page links
- **Main Content**: Full-width hero section on landing, content cards for each assistant
- **Footer**: Minimal footer with credits

### Responsive Breakpoints
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

### Visual Design

#### Color Palette
- **Background**: `#0a0a0f` (deep space black)
- **Surface**: `#14141f` (card backgrounds)
- **Surface Elevated**: `#1e1e2e` (hover states)
- **Primary**: `#ff6b35` (vibrant orange - comic energy)
- **Secondary**: `#00d4aa` (teal accent)
- **Accent**: `#ffd700` (gold for highlights)
- **Text Primary**: `#ffffff`
- **Text Secondary**: `#a0a0b0`
- **Border**: `#2a2a3a`

#### Typography
- **Headings**: "Bangers", cursive (comic-style display font)
- **Body**: "Nunito", sans-serif
- **Monospace**: "JetBrains Mono" (for code/technical)

#### Font Sizes
- H1: 3.5rem
- H2: 2.5rem
- H3: 1.75rem
- Body: 1rem
- Small: 0.875rem

#### Spacing System
- Base unit: 8px
- Sections: 80px vertical padding
- Cards: 24px padding
- Elements: 16px gap

#### Visual Effects
- Card hover: translateY(-8px) with box-shadow glow
- Buttons: gradient backgrounds with pulse animation
- Page transitions: fade-in with slight scale
- Comic-style speech bubbles for AI responses
- Subtle comic dot pattern overlay on backgrounds

### Components

#### Navigation Bar
- Logo with comic-style text
- Links: Home, Wiki, Guides, Recommendations
- Active state: underline with primary color
- Mobile: hamburger menu

#### Hero Section (Home)
- Large animated title with comic-style font
- Tagline with typewriter effect
- Quick action buttons to each assistant
- Floating comic book illustrations

#### Assistant Cards
- Icon representing each assistant type
- Title and description
- "Launch" button with hover animation

#### Chat Interface
- Message bubbles (user right, AI left)
- Speech bubble styling with tail
- Typing indicator animation
- Input field with send button
- Character limit indicator

#### Recommendation Form
- Dropdown selectors for: Hero, Trope, Movie/Show
- Multi-select for genres
- "Get Recommendations" button
- Results displayed as comic covers in grid

## Functionality Specification

### Core Features

#### 1. Wiki Assistant
- User can ask questions about comic characters, storylines, events
- AI provides detailed responses using Ollama
- Conversation history maintained during session
- Quick prompt suggestions

#### 2. Guide Assistant
- Beginner guides for getting into comics
- Specific series recommendations
- Reading order help
- Timeline explanations

#### 3. Recommendations
- Filter by: Favorite Hero, Trope, Movie/Show Adaptation
- Genres: Superhero, Horror, Sci-Fi, Romance, Comedy, Manga
- AI generates personalized recommendations with explanations

### Ollama Integration
- Default model: llama3.2 (or mistral for variety)
- API endpoint: http://localhost:11434/api/generate
- Streaming responses for real-time display
- Error handling for connection issues

### User Interactions
- Click navigation to switch views
- Type message and press Enter or click Send
- Select filters and submit for recommendations
- Clear conversation button

### Edge Cases
- Ollama not running: Show connection error with retry button
- Empty input: Disable send button
- Long responses: Scrollable chat area
- Network timeout: Show error message

## Acceptance Criteria

1. ✅ Home page loads with animated hero and navigation
2. ✅ All three assistant pages are accessible via navigation
3. ✅ Chat interface displays messages correctly
4. ✅ Ollama integration works (when running locally)
5. ✅ Recommendations page shows filter options
6. ✅ Responsive design works on mobile/tablet/desktop
7. ✅ Visual design matches comic aesthetic
8. ✅ Animations are smooth and enhance UX