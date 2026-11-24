# 🍺 Beer Style Atlas

An interactive map of beer styles, drawn as a **Beer River**: every style sits on a timeline at the point it emerged, flowing in family streams, with lines tracing which styles descended from which.

**Live:** https://willyclayton.github.io/beer/

- **River (Sankey):** four fermentation sources (Wild, Ale, Hybrid, Lager) flow into family streams; ribbon width = number of styles. Streams widen where a family branched out.
- **Family tree:** curved lines connect parent → child styles (Porter → Stout → Imperial Stout, Pale Ale → IPA → Hazy IPA). Solid = descended, dashed = inspired by, dotted = modern revival. Tap a style to light up its whole ancestry and every descendant.
- **Trait overlay (Venn):** toggle Hoppy, Dark & roasty, Strong, Sour, Malty or Light & crisp. Each draws a soft region around matching styles; where regions overlap, styles share both traits (e.g. Black IPA sits in Hoppy ∩ Dark).
- **Details:** tap a style for its general recipe (malts, hops, yeast, adjuncts), ABV / IBU / SRM ranges, top 3 sellers worldwide, lineage with sources.
- **Search** by style, beer (e.g. "Guinness") or ingredient (e.g. "Citra"). Dot colour = typical beer colour (SRM). Each style has a shareable `#id` link.
- On phones the river runs top → bottom so you scroll down through history; on wider screens it runs left → right.

## Data

`data/beers.json` holds every style. Stats follow the
[BJCP 2021 Style Guidelines](https://www.bjcp.org/style/2021/beer/) where available, then the
[Brewers Association Beer Style Guidelines](https://www.brewersassociation.org/edu/brewers-association-beer-style-guidelines/).
Origin dates and lineage links come from documented brewing history (BJCP "History" sections, brewing historians); every link carries a source.
Top-seller lists are best-effort: per-style global sales figures are rarely published, so each style carries a confidence rating (high / medium / low).
Traits are computed from the stats (e.g. Hoppy = IBU midpoint ≥ 40).

## Stack

Static HTML/CSS/JS + [D3 v7](https://d3js.org/). No build step — served directly by GitHub Pages from `main`.
