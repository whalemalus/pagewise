# PageWise v3.0.0 Release Notes

> **Release Date**: May 16, 2026  
> **Codename**: BookmarkGraph  
> **Milestone**: 92 rounds of iteration — from prototype to production-grade Chrome extension

---

## 🎉 Overview

PageWise v3.0.0 is a landmark release representing 92 rounds of continuous development. This version delivers a comprehensive suite of AI-powered knowledge management features, a mature bookmark knowledge graph system, robust testing infrastructure, and polished user experience across light and dark themes.

---

## 🏗️ Core Architecture

- **Chrome Extension Manifest V3** — modern, service-worker-based architecture
- **Pure JavaScript ES Modules** — no build tools, no TypeScript, direct Chrome extension loading
- **IndexedDB local storage** — all data stored locally, zero backend dependencies
- **35+ library modules** — modular, well-documented, JSDoc-annotated codebase
- **70+ test files** — comprehensive test coverage using Node.js built-in test runner

---

## ✨ Feature Highlights

### 🤖 AI Chat & Intelligence
- **Multi-provider AI support**: Claude, OpenAI, DeepSeek, Ollama, and any OpenAI-compatible API
- **Streaming responses**: Real-time token-by-token AI output with markdown rendering
- **Multi-turn conversation**: Context-aware dialogue with conversation branching (up to 10 branches)
- **Code execution sandbox**: Run HTML/JavaScript code from AI responses directly in the sidebar
- **Code syntax highlighting**: Automatic syntax coloring in code blocks with copy buttons
- **Stop generation**: AbortController-based interruption of in-progress AI responses
- **Token window management**: Real-time token usage estimation and warnings
- **Cost estimator**: Track and display estimated API costs per conversation
- **Screenshot visual QA**: Capture page screenshots for visual AI understanding
- **Prompt template library**: 5 built-in + up to 20 custom prompt templates
- **Multi-page analysis**: Analyze up to 5 tabs simultaneously

### 📚 Knowledge Base
- **IndexedDB-powered local knowledge base**: Fast, persistent, offline-capable storage
- **Full-text search with inverted index**: High-performance search across all entries
- **Semantic search**: Bigram vector cosine similarity for intelligent retrieval
- **Knowledge correlation engine**: Automatically discover relationships between entries
- **Knowledge graph visualization**: Canvas force-directed graph showing knowledge connections
- **Batch management**: Bulk select, delete, tag, and export operations
- **Knowledge deduplication**: Automatic detection of duplicate entries on save
- **Learning path generation**: AI-generated personalized learning routes from knowledge base
- **Spaced repetition (SM-2)**: Algorithm-based flashcard review system with streak tracking

### 🔖 Bookmark Knowledge Graph (R60-R92)
- **17 bookmark modules**: BookmarkCollector, BookmarkIndexer, BookmarkGraphEngine, BookmarkVisualizer, BookmarkDetailPanel, BookmarkSearch, BookmarkRecommender, BookmarkClusterer, BookmarkStatusManager, BookmarkTagger, BookmarkDedup, BookmarkFolderAnalyzer, BookmarkGapDetector, BookmarkImportExport, BookmarkTagEditor, BookmarkLearningPath, BookmarkLinkChecker
- **Interactive graph visualization**: Explore bookmarks as a force-directed knowledge graph
- **Multi-dimensional search**: Filter by title, URL, folder, and tags
- **Similar bookmark recommendations**: AI-powered suggestions for related bookmarks
- **Bookmark clustering**: Automatic grouping by topic and domain
- **Gap detection**: Identify missing topics in your bookmark collection
- **Deduplication**: Detect and merge duplicate bookmarks
- **Link checking**: Verify bookmark URLs are still accessible
- **Folder analysis**: Statistical analysis of bookmark folder structure
- **Import/Export**: Full bookmark data portability
- **Popup integration**: Bookmark graph entry point from extension popup
- **Sidebar bookmark tab**: Dedicated bookmark management in the side panel
- **Options page integration**: Full-screen graph visualization experience

### 📝 Highlights & Annotation
- **Page text highlighting**: Select and highlight text on any webpage
- **Cross-visit persistence**: Highlights survive page reloads and revisits
- **Selection toolbar**: Quick action toolbar on text selection
- **Highlight store**: Centralized management of all highlights

### 📖 Wiki System
- **Personal wiki**: Build a structured knowledge wiki from your browsing
- **Wiki store**: IndexedDB-backed wiki with full CRUD operations
- **Cross-referencing**: Link wiki entries to bookmarks and knowledge items

### 🎓 Learning & Review
- **Learning path generation**: AI-curated study paths from your knowledge base
- **Spaced repetition system**: SM-2 algorithm for optimal review scheduling
- **Review sessions**: Structured flashcard review with performance tracking
- **Streak tracking**: Monitor consecutive days of review activity

### 🧩 Skills & Plugins
- **Skill engine**: 7 built-in skills for specialized page analysis
- **Custom skills**: Create up to 20 user-defined skills
- **Plugin system**: Extensible architecture for third-party integrations

### 📄 Page Understanding
- **6 page types**: Automatic detection for web pages, API docs, GitHub repos, YouTube, PDFs, code repositories
- **Reader Mode extraction**: Intelligent content extraction from web pages
- **API documentation mode**: Endpoint listing with method grouping
- **GitHub repo analysis**: README, directory structure, and language statistics
- **YouTube transcript extraction**: DOM-based caption extraction with fallback strategies
- **PDF reading**: Multi-strategy text extraction for Chrome PDF viewer
- **Page content preview**: Transparent view of what the AI sees
- **Page summarizer**: One-click page summarization

### 🎨 User Interface
- **Dark theme**: CSS variable-based theming with system preference detection
- **Internationalization (i18n)**: Full Chinese and English interface support
- **AxonHub-style API configuration**: Provider card selector with model discovery
- **Multi-profile management**: Save, switch, and delete multiple API configurations
- **Floating text selection toolbar**: Quick ask on selected text
- **Statistics dashboard**: Usage stats with streak tracking and trend charts
- **Onboarding flow**: First-install guided setup with smart environment detection
- **Toast notification system**: Animated info/success/error/warning notifications
- **Virtual scrolling**: High-performance rendering for large knowledge lists
- **Lazy message rendering**: Reduced memory usage for large conversation histories
- **Animations**: Smooth CSS transitions and animations throughout the UI

### ⌨️ Keyboard & Accessibility
- **Keyboard shortcuts**: Ctrl+Shift+Y (sidebar), Ctrl+Shift+S (summarize), Ctrl+Shift+X (toggle), Ctrl+J (explore), Ctrl+K (chat)
- **ARIA labels**: Full accessibility markup throughout the UI
- **Keyboard navigation**: Complete tab-order and focus management
- **Focus management**: Proper focus trapping in modals and dialogs

### 💾 Data Management
- **Import/Export**: Markdown, JSON, and plain text formats
- **Backup & restore**: Full data backup capability
- **Conversation history**: IndexedDB-persisted with search and time filtering
- **Conversation export**: Export as Markdown files
- **Session management**: chrome.storage.session with 24-hour auto-expiry

### 🛡️ Error Handling & Reliability
- **Global error capture**: Comprehensive try-catch with user-friendly messages
- **Smart retry**: Automatic retry on network failures with exponential backoff
- **Error handler module**: Centralized error processing and reporting
- **Performance monitoring**: Response time tracking with real-time display

### 🔧 Context Menus
- **Right-click "Ask PageWise"**: Quick AI query on selected text
- **Right-click "Summarize page"**: One-click page summarization

---

## 🧪 Testing

| Metric | Value |
|--------|-------|
| Test files | 70+ |
| Test suites | 150+ |
| Test cases | 2600+ |
| Framework | Node.js built-in test runner |
| External dependencies | Zero |
| Chrome API mock | tests/helpers/chrome-mock.js |
| IndexedDB mock | tests/helpers/indexeddb-mock.js |

### Test Categories
- **Unit tests**: Core library modules (utils, page-sense, skill-engine, knowledge-base, ai-client, etc.)
- **Integration tests**: Chrome API, IndexedDB, service worker ↔ content script communication
- **Compatibility tests**: Module system, Chrome APIs, manifest validation
- **Reliability tests**: Service worker lifecycle, edge cases, error handling
- **QA depth tests**: Deep testing of all major features (bookmarks, i18n, shortcuts, etc.)
- **E2E tests**: End-to-end workflow validation

---

## 📦 Chrome Web Store Preparation

- **Permissions**: Minimal set (storage, sidePanel, contextMenus, tabs, activeTab, bookmarks)
- **i18n**: Chinese and English descriptions via `_locales`
- **Privacy policy**: PRIVACY.md
- **Store listing**: STORE-LISTING.md
- **Build script**: scripts/build.sh for one-click Chrome Web Store package generation

---

## 📁 Project Statistics

| Metric | Value |
|--------|-------|
| Library modules | 35+ |
| Test files | 70+ |
| Total iterations | 92 rounds |
| Languages | JavaScript (ES Modules) |
| Build tools | None (pure JS) |
| Backend dependencies | None (local-only) |

---

## 🙏 Acknowledgments

This release represents the culmination of 92 iterative development cycles, each building upon the last to create a comprehensive, production-ready AI knowledge management tool. Every feature has been thoroughly tested, documented, and polished for the best possible user experience.

---

*PageWise — Intelligent reading, structured knowledge.*
