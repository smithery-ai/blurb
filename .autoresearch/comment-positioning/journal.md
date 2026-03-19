# Comment Positioning — Experiment Journal

## Baseline
- Metric: 172.8px average delta at 1920px
- Comment 1: 32px off (padding offset)
- Comment 2: 313px off (stale position + collision)

## Experiment 1: Fix coordinate space mismatch
- Hypothesis: positions computed relative to `.md-preview` but popovers inside `.md-preview-margin`, offset by 32px padding-top
- Change: use `.md-preview-inner` as reference container in `computePopoverPositions` call
- Result: **0px delta** at all widths on fresh load (KEPT)
- Notes: also fixed pill positioning to use `.md-preview-inner`

## Experiment 2: Add ResizeObserver for live resize
- Hypothesis: positions computed once on mount, never recomputed on viewport resize
- Change (2a): ResizeObserver on `.md-preview-inner` container
- Result: still 98px off after resize — observer on container didn't fire on content reflow
- Change (2b): ResizeObserver on content element + `window.resize` listener
- Result: **0px delta** across 1440→900→1100 resize without reload (KEPT)

## Final Results

| Viewport | Before | After |
|----------|--------|-------|
| 1440px | 172.8px avg | 0px |
| 1100px (resize) | ~60px avg | 0px |
| 900px (resize) | ~49px avg | 0px |
| 900px (fresh load) | 0px | 0px |
