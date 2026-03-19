# Visual Polish — Artifact Rendering

## Metric

Visual quality score (1–10) assessed via Chrome DevTools full-page screenshots of the test artifact at `https://sono-worker.smithery.workers.dev/~/public/neat-hog-8412`.

Evaluate on: typography, spacing, chart sizing, widget containers, table styling, mermaid readability, overall visual harmony.

## Measurement

1. Rebuild koen: `cd ../sono && bun run build`
2. Rebuild + deploy blurb: `bun run deploy`
3. Navigate Chrome DevTools to test URL
4. Full-page screenshot
5. Score 1–10

## Scope

- `sono/src/styles/sono-editor.css` — primary target
- `sono/src/widgets/ChartWidget.ts` — chart sizing/defaults
- `sono/src/widgets/MermaidWidget.ts` — mermaid container styling

## Do NOT touch

- Markdown parser (`markedPositions.ts`)
- Widget registry / plugin system
- Comment system
- Any blurb app code

## Strategy

### Direction 1: Widget container polish
- Add subtle border-radius, background, padding to `.koen-widget-placeholder`
- Charts need more height and max-width

### Direction 2: Chart defaults
- Increase default chart height from 300px
- Better font sizing on axes
- More padding around charts

### Direction 3: Table styling
- Alternating row colors
- Better header styling
- Rounded corners on table container

### Direction 4: Typography & spacing
- More margin between sections (h2/h3)
- Better blockquote styling
- Horizontal rules as section dividers

### Direction 5: Mermaid improvements
- Larger font size in nodes
- More padding in the mermaid container

## Budget

8 experiments max.
