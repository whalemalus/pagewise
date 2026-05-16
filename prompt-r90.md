R90: UI/UX 最终打磨 BookmarkFinalPolish

Create lib/bookmark-final-polish.js — animation/layout/interaction refinements:

1. animateNodeEntry(node, element) — smooth fade+scale for new graph nodes (200ms ease-out)
2. animateEdgeDraw(edge, canvas) — animated edge drawing with dash offset
3. optimizeLayout(bookmarks, container) — responsive grid layout with breakpoint detection
4. enhanceDragDrop(element, options) — smooth drag with ghost element and snap-to-grid
5. addRippleEffect(element, event) — Material-style ripple on click
6. showTooltip(element, content, position) — smart tooltip positioning (flip if near edge)
7. smoothScrollTo(element, target) — smooth scroll with easing

Rules: ES Module, no semicolons, JSDoc, try-catch, pure DOM utilities (no Chrome API).
Create tests/test-bookmark-final-polish.js with 20+ tests using node:test.
Mock DOM with simple objects. Run tests, git commit: feat(bookmark): R90 UI/UX final polish
