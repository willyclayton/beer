# 🍺 Beer Style Atlas

An interactive, zoomable map of beer styles — nested and grouped by similarity.

**Live:** https://willyclayton.github.io/beer/

- **Explore:** tap a bubble to zoom in (Family → Group → Style → Sub-style). Pinch/scroll to zoom, drag to pan, tap empty space to zoom out.
- **Details:** tap a style to see its general recipe (malts, hops, yeast, adjuncts), ABV / IBU / SRM ranges, and the top 3 best-selling examples worldwide.
- **Search:** find a style by name, by a beer (e.g. "Guinness"), or by an ingredient (e.g. "Citra").
- Bubble colors show each style's typical beer color (SRM). Links are shareable: each style has its own `#id` URL.

## Data

`data/beers.json` holds the full style tree. Style stats follow the
[BJCP 2021 Style Guidelines](https://www.bjcp.org/style/2021/beer/) where available, then the
[Brewers Association Beer Style Guidelines](https://www.brewersassociation.org/edu/brewers-association-beer-style-guidelines/).
Each style lists its sources. Top-seller lists are best-effort: per-style global sales figures are rarely published, so each style carries a confidence rating (high / medium / low).

## Stack

Static HTML/CSS/JS + [D3 v7](https://d3js.org/) (circle packing + zoom). No build step — served directly by GitHub Pages from `main`.
