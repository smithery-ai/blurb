# Comment Transitions — Experiment Journal

## Experiment 1: Richer appear + smooth highlights + hover emphasis
- **Changes:**
  - Popover appear: `translateY(-4px)` → `translateY(6px) scale(0.97)`, duration `0.12s ease-out` → `0.18s cubic-bezier(0.16, 1, 0.3, 1)`
  - Highlight: added `transition: background 0.15s ease`
  - Hover emphasis: added `transform: scale(1.01)`, deeper shadow
  - Settle: added `scale(0.98 → 1)` to the opacity animation
- **Timing rationale (Human Processor Model):**
  - 180ms appear: within perceptual cycle (100ms) to full loop (240ms) — fast enough to feel responsive, slow enough to perceive smooth motion
  - 150ms highlight transition: just above perceptual threshold — noticeable but not sluggish
  - cubic-bezier(0.16, 1, 0.3, 1): overshoot ease — starts fast, slight overshoot at end gives organic "settling" feel
- **Result:** CSS verified applied. Visual: popover slides up from below with subtle scale, highlights fade smoothly on hover. KEPT.
- **Score: 3/5** — smooth, functional. Missing: exit animation, pill appear animation.
