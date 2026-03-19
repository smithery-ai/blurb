# Program: Comment Popover Positioning

## Metric

Average absolute pixel delta between each comment popover's visual top and its anchor highlight's visual top, measured across 3 viewport widths (1440, 1100, 900px). Lower is better. Target: < 5px average delta.

## Measurement

Use Chrome DevTools MCP to:
1. Navigate to the test artifact
2. For each viewport width, evaluate JS that computes the delta between each highlight's `getBoundingClientRect().top` and its popover's `getBoundingClientRect().top`
3. Average all deltas across all viewports

## What to modify

- `sono-editor/src/comments/popoverPositioning.ts` — the position computation
- `sono-editor/src/preview/MarkdownPreview.tsx` — how positions are passed to popovers
- `sono-editor/src/styles/sono-editor.css` — margin/padding that affects offset

## What NOT to touch

- The measurement code itself
- Comment anchoring logic (how anchors are stored/resolved)
- Source mode layout
- The test artifact content

## Strategy

### Direction 1: Fix the coordinate space mismatch
Popovers are positioned `absolute` inside `.md-preview-margin` (position: relative). But `computePopoverPositions` computes tops relative to `.md-preview` (the flex parent). The margin is offset from the preview by padding-top (32px). Subtract that offset.

### Direction 2: Compute relative to margin directly
Pass `.md-preview-margin` as the reference container to `computePopoverPositions` instead of `.md-preview`.

### Direction 3: Account for scroll position
The preview content scrolls inside `.editor-container.preview-scroll`. The margin scrolls with it. Make sure scroll offset is handled correctly.

## Budget

5 experiments max. This is a known offset bug, not an open-ended search.
