# Program: Comment Popover Transitions

## Goal

Make comment popover transitions feel polished and Notion-esque. Grounded in the Human Processor Model (Card, Moran, Newell 1983):

| Processor | Cycle time | Implication |
|---|---|---|
| Perceptual | 100ms (50–200ms) | < 100ms feels instant/jumpy, > 200ms feels sluggish |
| Cognitive | 70ms (25–170ms) | User needs ~70ms to "register" a change |
| Motor | 70ms (30–100ms) | User's click-to-expect-response time |
| Full loop | ~240ms | Max acceptable delay before feeling "slow" |
| Visual decay | 200ms half-life | Fading elements should complete within this |

**Sweet spot: 120–200ms** for transitions. Fast enough to feel responsive, slow enough to be perceived as smooth motion rather than a jump.

## Metric

Qualitative — measured via Chrome DevTools screenshots + human review. Score each experiment 1-5:
1. Jarring/jumpy
2. Functional but mechanical
3. Smooth (baseline Notion-like)
4. Polished, delightful
5. Perfect, invisible

Evaluate across these interactions:
- **Appear**: select text → click Comment → popover appears
- **Settle**: submit comment → popover settles into committed state
- **Hover**: hover highlight → popover gets emphasis
- **Highlight transition**: text highlight appearing/changing on hover

## Current Baseline (what to improve)

```css
/* Popover appear: opacity + small translateY, 120ms */
@keyframes popover-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
animation: popover-fade-in 0.12s ease-out;

/* Settle after submit: just opacity pulse, 200ms */
@keyframes popover-settle {
  from { opacity: 0.7; }
  to { opacity: 1; }
}

/* Hover emphasis: instant box-shadow */
.highlighted { box-shadow: 0 4px 8px -3px rgba(0, 0, 0, 0.15); }

/* Highlight: no transition, instant bg change */
[data-comment-highlight] { background: var(--highlight-bg); }

/* Comment pill: bg transition only, 100ms */
.comment-pill { transition: background 0.1s; }
```

Issues: appear animation is too subtle (only 4px translate). No exit animation. Highlight has no transition. Hover emphasis is not smooth.

## What to modify

- `sono-editor/src/styles/sono-editor.css` — all animation/transition CSS
- Optionally `MarkdownPreview.tsx` — if we need class toggling for exit animations

## What NOT to touch

- Positioning logic (already fixed)
- Comment anchoring
- Any JS measurement code

## Strategy (experiment order)

### Direction 1: Richer appear animation
- Increase translateY to 6-8px for more visible motion
- Add subtle scale (0.97 → 1.0) for a "growing in" feel
- Try cubic-bezier(0.16, 1, 0.3, 1) (Notion-style overshoot ease)
- Duration: 150-180ms (within perceptual sweet spot)

### Direction 2: Smooth highlight transitions
- Add `transition: background 150ms ease` to `[data-comment-highlight]`
- Consider a subtle highlight "pulse" on first appear

### Direction 3: Hover emphasis
- Transition box-shadow smoothly (150ms)
- Add subtle scale(1.01) on hover for "lift" feel
- Border color transition on active state

### Direction 4: Exit animation
- Fade out + translateY(4px) on removal
- Requires adding a CSS class before removing from DOM

### Direction 5: Comment pill polish
- Add scale + opacity animation on appear
- Subtle bounce ease on the pill button

## Budget

5 experiments. Deploy and screenshot each.

## Measurement function

Build sono-editor → build worker → deploy → reload Chrome → screenshot → evaluate visually.

```bash
cd /Users/arjun/Documents/github/sono-editor && npm run build 2>&1 | tail -2 && \
npx vite build 2>&1 | tail -2 && \
npx wrangler deploy 2>&1 | tail -3
```
Then reload + screenshot via Chrome DevTools MCP.
