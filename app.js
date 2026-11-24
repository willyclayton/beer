/* Beer Style Atlas — zoomable circle-packing explorer */
(() => {
  "use strict";

  // ---------- constants ----------
  const FAMILY_COLORS = {
    ales: "#E39B3A",
    belgian: "#C46A9E",
    wheat: "#E3C75F",
    "wild-sour": "#E2675A",
    lagers: "#5FB0C9",
    hybrid: "#8DBA6A",
    specialty: "#9C7FE0",
    historical: "#B59A78",
  };
  const FALLBACK_COLORS = ["#E39B3A", "#5FB0C9", "#C46A9E", "#8DBA6A", "#E2675A", "#9C7FE0", "#E3C75F", "#B59A78"];
  // Standard Reference Method → approximate beer color (SRM 1–40)
  const SRM_HEX = ["#FFE699","#FFD878","#FFCA5A","#FFBF42","#FBB123","#F8A600","#F39C00","#EA8F00","#E58500","#DE7C00",
    "#D77200","#CF6900","#CB6200","#C35900","#BB5100","#B54C00","#B04500","#A63E00","#A13700","#9B3200",
    "#952D00","#8E2900","#882300","#821E00","#7B1A00","#771900","#701400","#6A0E00","#660D00","#5E0B00",
    "#5A0A02","#600903","#520907","#4C0505","#470606","#440607","#3F0708","#3B0607","#3A070B","#36080A"];
  const S = 1000;              // pack layout size
  const FAMILY_GAP = 12;       // layout units between family circles
  const MIN_LEAF_R = 28;       // px: a selected leaf is never shown smaller than this on phones
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DUR = reduceMotion ? 0 : 750;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const sideMQ = window.matchMedia("(min-width: 900px), (min-width: 600px) and (max-height: 500px) and (orientation: landscape)");
  const sidePanel = () => sideMQ.matches;
  const FONT_STACK = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const svg = d3.select("#chart");
  const stage = $("stage");
  const topbar = $("topbar");
  const panel = $("panel");
  const panelBody = $("panelBody");
  const tooltip = $("tooltip");
  const crumbsNav = $("crumbs");
  const crumbsList = crumbsNav.querySelector("ol");
  const familiesNav = $("families");
  const searchInput = $("searchInput");
  const searchResults = $("searchResults");
  const hint = $("hint");

  // ---------- state ----------
  let root, nodes, leaves, byId = new Map();
  let W = 0, H = 0, fitK = 1, layoutAspect = 0;
  let transform = d3.zoomIdentity;
  let focus = null, selected = null, hovered = null, currentCrumb = null;
  let panelState = "closed";
  let gZoom, gLabels, circleSel, labelSel, zoom;

  // ---------- helpers ----------
  const isStyle = (d) => d.data.type === "style" || Array.isArray(d.data.abv);
  const hasKids = (d) => !!(d.children && d.children.length);
  const isLeaf = (d) => isStyle(d) && !hasKids(d);
  const mid = (r) => (Array.isArray(r) ? (r[0] + r[1]) / 2 : null);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function srmColor(v) {
    if (v == null || isNaN(v)) return "#B07A3A";
    if (v > 40) return "#140806";
    return SRM_HEX[Math.max(1, Math.round(v)) - 1];
  }
  const famOf = (d) => (d.depth === 0 ? d : d.ancestors().find((a) => a.depth === 1));
  const famColor = (d) => famOf(d).color;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtRange = (r, unit = "") => (Array.isArray(r) ? (r[0] === r[1] ? `${r[0]}${unit}` : `${r[0]}–${r[1]}${unit}`) : "—");
  const countStyles = (d) => d.descendants().filter((n) => n !== d && isStyle(n)).length;
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  function luminance(hex) {
    const c = d3.rgb(hex);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // ---------- theme ----------
  const darkTheme = () => {
    const t = document.documentElement.dataset.theme;
    if (t) return t === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  function syncThemeChrome() {
    const dark = darkTheme();
    $("themeBtn").setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#120f0c" : "#f7f2ea"));
  }
  const savedTheme = lsGet("beer-theme");
  if (savedTheme === "light" || savedTheme === "dark") document.documentElement.dataset.theme = savedTheme;
  syncThemeChrome();
  $("themeBtn").addEventListener("click", () => {
    const next = darkTheme() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    lsSet("beer-theme", next);
    syncThemeChrome();
    paint();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { syncThemeChrome(); paint(); });

  // ---------- load ----------
  fetch("data/beers.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch((err) => { $("loading").textContent = "Couldn't load beer data (" + err.message + ")"; console.error(err); });

  function init(data) {
    root = d3.hierarchy(data)
      .sum((d) => (d.children && d.children.length ? 0 : 1))
      .sort((a, b) => b.value - a.value || a.data.name.localeCompare(b.data.name));
    d3.pack().size([S, S]).padding((d) => (d.depth === 0 ? 16 : d.depth === 1 ? 9 : 5))(root);
    nodes = root.descendants();
    nodes.forEach((d, i) => {
      d.uid = d.data.id || slug(d.data.name) || "n" + i;
      if (byId.has(d.uid)) d.uid += "-" + i;
      byId.set(d.uid, d);
      d.srm = isStyle(d) ? mid(d.data.srm) : null;
    });
    leaves = nodes.filter(isLeaf);
    root.children.forEach((f, i) => {
      f.color = FAMILY_COLORS[f.data.id] || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      // remember every node's offset inside its family so families can be re-arranged per viewport
      f.descendants().forEach((n) => { n.ox = n.x - f.x; n.oy = n.y - f.y; });
      f.px = f.x - S / 2; f.py = f.y - S / 2;
    });
    root.color = "#999";
    measureLabels();

    buildChart();
    buildFamilies();
    buildSearch();
    const nStyles = countStyles(root);
    searchInput.placeholder = window.innerWidth < 420 ? `Search ${nStyles} styles…` : `Search ${nStyles} styles, beers, hops…`;
    $("loading").hidden = true;

    resize();
    window.addEventListener("resize", debounce(resize, 100));
    sideMQ.addEventListener("change", resize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureLabels(); update(); });

    const startId = decodeURIComponent(location.hash.slice(1));
    if (startId && byId.has(startId)) goTo(byId.get(startId), false);
    else { zoomTo(root, 0); entrance(); }
    window.addEventListener("hashchange", () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id && byId.has(id) && byId.get(id) !== selected) goTo(byId.get(id));
    });
    if (canHover) hint.textContent = "Click a bubble to explore · scroll to zoom, drag to pan";
    setTimeout(() => hint.classList.add("gone"), 7000);
  }

  // ---------- layout: arrange families to suit the viewport's shape ----------
  // Each family keeps its packed interior; only the family circles move. A tiny force
  // simulation packs them into a blob whose aspect matches the screen, then we keep the
  // candidate that lets the whole cluster be drawn largest.
  function layoutFamilies(aspect) {
    const fams = root.children;
    let best = null;
    for (const a of [0.45, 0.6, 0.8, 1, 1.25, 1.6, 2.1, 2.8]) {
      const pts = fams.map((f) => ({ f, r: f.r, x: f.px * Math.sqrt(aspect), y: f.py / Math.sqrt(aspect) }));
      const sim = d3.forceSimulation(pts)
        .force("x", d3.forceX(0).strength(0.05 * a))
        .force("y", d3.forceY(0).strength(0.05 / a))
        .force("collide", d3.forceCollide((p) => p.r + FAMILY_GAP / 2).strength(1).iterations(4))
        .stop();
      sim.tick(260);
      sim.force("x", null).force("y", null); // settle any residual overlap
      sim.alpha(0.3).tick(40);
      const x0 = d3.min(pts, (p) => p.x - p.r), x1 = d3.max(pts, (p) => p.x + p.r);
      const y0 = d3.min(pts, (p) => p.y - p.r), y1 = d3.max(pts, (p) => p.y + p.r);
      const k = Math.min(aspect / (x1 - x0), 1 / (y1 - y0));
      if (!best || k > best.k) best = { k, pts, x0, x1, y0, y1 };
    }
    const cx = (best.x0 + best.x1) / 2, cy = (best.y0 + best.y1) / 2;
    best.pts.forEach((p) => {
      p.f.x = S / 2 + p.x - cx; p.f.y = S / 2 + p.y - cy;
      p.f.descendants().forEach((n) => { n.x = p.f.x + n.ox; n.y = p.f.y + n.oy; });
    });
    root.x = S / 2; root.y = S / 2;
    root.box = { x0: S / 2 - (best.x1 - best.x0) / 2, x1: S / 2 + (best.x1 - best.x0) / 2, y0: S / 2 - (best.y1 - best.y0) / 2, y1: S / 2 + (best.y1 - best.y0) / 2 };
    layoutAspect = aspect;
    if (circleSel) circleSel.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
  }

  // ---------- labels: measure once, pick the best 1–3 line wrap per zoom ----------
  const measureCtx = document.createElement("canvas").getContext("2d");
  function measureLabels() {
    const width = (str, weight) => { measureCtx.font = `${weight} 100px ${FONT_STACK}`; return measureCtx.measureText(str).width / 100; };
    nodes.forEach((d) => {
      if (!d.depth) return;
      const weight = d.depth === 1 ? 800 : hasKids(d) ? 700 : 600;
      const wraps = (name) => wrapOptions(name).map((lines) => ({ lines, w: d3.max(lines, (l) => width(l, weight)) }));
      d.wraps = wraps(d.data.name);
      // "Hazy IPA (New England IPA)" → "Hazy IPA" when the full name can't fit
      const short = d.data.name.replace(/\s*\(.*?\)\s*/g, " ").trim();
      d.shortWraps = short && short !== d.data.name ? wraps(short) : null;
    });
  }
  function wrapOptions(name) {
    const words = name.split(/\s+/);
    const opts = [[name]];
    const balanced = (parts) => Math.max(...parts.map((p) => p.length));
    if (words.length >= 2) {
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const p = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
        if (!best || balanced(p) < balanced(best)) best = p;
      }
      opts.push(best);
    }
    if (words.length >= 3) {
      let best = null;
      for (let i = 1; i < words.length - 1; i++) for (let j = i + 1; j < words.length; j++) {
        const p = [words.slice(0, i).join(" "), words.slice(i, j).join(" "), words.slice(j).join(" ")];
        if (!best || balanced(p) < balanced(best)) best = p;
      }
      opts.push(best);
    }
    return opts;
  }
  // Returns { lines, fs, count } for a node drawn with screen radius s, or null if it can't be legible.
  function fitLabel(d, s, forceShow) {
    const fam = d.depth === 1, group = hasKids(d);
    const base = fam ? clamp(s / 4.2, 13, 22) : group ? clamp(s / 4.8, 11, 19) : clamp(s / 3.6, 10, 16);
    const count = group && s > 62;
    const pick = (wraps) => {
      let best = null;
      for (const w of wraps) {
        const n = w.lines.length;
        const rows = n + (count ? 0.9 : 0);
        const widthAvail = s * (n === 1 ? 1.76 : n === 2 ? 1.64 : 1.46);
        const fs = Math.min(base, widthAvail / w.w, (s * 1.5) / (rows * 1.12));
        const score = fs * (1 - (n - 1) * 0.04); // prefer fewer lines when sizes are close
        if (!best || score > best.score) best = { lines: w.lines, w: w.w, fs, count, score };
      }
      return best;
    };
    let best = pick(d.wraps);
    if (best.fs < 10.5 && d.shortWraps) {
      const alt = pick(d.shortWraps);
      if (alt.fs >= best.fs) best = alt; // short + legible beats long + tiny
    }
    if (forceShow) {
      if (best.fs < 12) { // tiny family: keep the name readable, let it spill past the circle
        const two = d.wraps[Math.min(1, d.wraps.length - 1)];
        best = { lines: two.lines, w: two.w, fs: 12, count: false };
      }
      return best;
    }
    if (best.fs < 9 || s < 14) return null;
    return best;
  }

  // ---------- chart ----------
  function buildChart() {
    gZoom = svg.append("g").attr("class", "zoom");
    gLabels = svg.append("g").attr("class", "labels").attr("aria-hidden", "true");

    circleSel = gZoom.selectAll("circle")
      .data(nodes.filter((d) => d.depth > 0))
      .join("circle")
      .attr("class", (d) => (hasKids(d) ? "group" : "style-leaf") + (isStyle(d) ? " is-style" : ""))
      .attr("r", (d) => d.r)
      .attr("vector-effect", "non-scaling-stroke")
      .attr("tabindex", -1)
      .attr("role", "button")
      .attr("aria-label", (d) => (isLeaf(d)
        ? `${d.data.name}, ${fmtRange(d.data.abv, "% ABV")}`
        : `${d.data.name}, ${plural(countStyles(d), "style")}`))
      .on("click", onCircleClick)
      .on("keydown", (e, d) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(d, true); }
      })
      .on("pointerenter", (e, d) => { if (canHover && e.pointerType === "mouse") setHover(d, e); })
      .on("pointermove", (e) => { if (canHover) moveTooltip(e); })
      .on("pointerleave", () => { if (canHover) setHover(null); });

    labelSel = gLabels.selectAll("text")
      .data(nodes.filter((d) => d.depth > 0))
      .join("text")
      .attr("class", (d) => (d.depth === 1 ? "lbl-group lbl-fam" : hasKids(d) ? "lbl-group" : "lbl-leaf"))
      .attr("text-anchor", "middle")
      .style("display", "none");

    paint();

    zoom = d3.zoom()
      .clickDistance(8)
      .tapDistance(12)
      .on("start", (e) => { if (e.sourceEvent) hint.classList.add("gone"); })
      .on("zoom", (e) => { transform = e.transform; update(); });
    svg.call(zoom).on("dblclick.zoom", null);
    svg.on("click", (e) => {
      if (e.target.closest && e.target.closest("circle")) return;
      if (panelState !== "closed" && !sidePanel()) { closePanel(); return; }
      zoomTo(focus && focus.parent ? focus.parent : root);
    });
  }

  function entrance() {
    if (reduceMotion) return;
    const famIdx = new Map(root.children.map((f, i) => [f, i]));
    circleSel.attr("r", 0)
      .transition("enter")
      .delay((d) => 60 + famIdx.get(famOf(d)) * 50 + (d.depth - 1) * 130 + Math.random() * 80)
      .duration(620)
      .ease(d3.easeBackOut.overshoot(0.8))
      .attr("r", (d) => d.r);
    gLabels.style("opacity", 0).transition("enter").delay(650).duration(450).style("opacity", 1);
  }

  function paint() {
    if (!circleSel) return;
    const dark = darkTheme();
    circleSel
      .attr("fill", (d) => (isStyle(d) ? srmColor(d.srm) : famColor(d)))
      .attr("fill-opacity", (d) => {
        if (isStyle(d)) return hasKids(d) ? 0.28 : 1;
        return dark ? 0.06 + d.depth * 0.035 : 0.09 + d.depth * 0.05;
      })
      .attr("stroke", (d) => {
        if (isLeaf(d)) return d3.color(srmColor(d.srm)).darker(dark ? 0.9 : 0.5).formatHex();
        return famColor(d);
      })
      .attr("stroke-opacity", (d) => (isLeaf(d) ? 0.9 : dark ? 0.5 : 0.65));

    // Leaf labels sit on their beer colour: choose whichever ink contrasts more, with a halo of the fill.
    const DARK_INK = "#26140a", LIGHT_INK = "#fff6ea";
    const lDark = luminance(DARK_INK), lLight = luminance(LIGHT_INK);
    labelSel.each(function (d) {
      const t = d3.select(this);
      if (isLeaf(d)) {
        const fill = srmColor(d.srm), lf = luminance(fill);
        const useDark = contrast(lf, lDark) >= contrast(lf, lLight);
        const halo = d3.color(fill); halo.opacity = 0.75;
        t.style("fill", useDark ? DARK_INK : LIGHT_INK).style("stroke", halo.formatRgb());
      } else {
        t.style("fill", "var(--text)").style("stroke", "var(--halo)");
      }
    });
    if (root && W) update();
  }

  // The part of the screen the chart may use (excludes header, side panel or sheet).
  function viewRect(home = false) {
    const top = topbar.getBoundingClientRect().bottom;
    const open = !home && panelState !== "closed";
    if (sidePanel()) {
      const x1 = open ? W - panel.offsetWidth - 16 : W;
      return { x0: 20, y0: top + 12, x1: x1 - 20, y1: H - 20 };
    }
    const ph = panel.offsetHeight;
    const peek = parseFloat(getComputedStyle(panel).getPropertyValue("--peek")) + $("sabProbe").offsetHeight;
    let bottom = open ? { peek, half: ph * 0.5, full: ph * 0.5 }[panelState] || 0 : 0;
    const y0 = top + 8;
    if (H - bottom - 8 - y0 < 160) bottom = Math.max(0, H - y0 - 168);
    return { x0: 10, y0, x1: W - 10, y1: H - bottom - 10 };
  }

  function targetTransform(d) {
    const v = viewRect();
    const vw = v.x1 - v.x0, vh = v.y1 - v.y0;
    const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    if (d === root) {
      const b = root.box;
      const k = Math.min(vw / (b.x1 - b.x0), vh / (b.y1 - b.y0)) * 0.97;
      return d3.zoomIdentity.translate(cx - k * (b.x0 + b.x1) / 2, cy - k * (b.y0 + b.y1) / 2).scale(k);
    }
    let k = (Math.min(vw, vh) / (2 * d.r)) * 0.94;
    let px = d.x, py = d.y;
    // A selected leaf inside a big group: zoom in until it is comfortably tappable, centred on it.
    if (selected && isLeaf(selected) && selected.parent === d && !sidePanel() && k * selected.r < MIN_LEAF_R) {
      k = MIN_LEAF_R / selected.r;
      px = selected.x; py = selected.y;
    }
    return d3.zoomIdentity.translate(cx - k * px, cy - k * py).scale(k);
  }

  function zoomTo(d, dur = DUR) {
    if (!d) return;
    const t = targetTransform(d);
    focus = d;
    if (dur === 0) svg.interrupt().call(zoom.transform, t);
    else svg.transition().duration(dur).ease(d3.easeCubicInOut).call(zoom.transform, t);
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    document.body.classList.toggle("side-open", sidePanel() && panelState !== "closed");
    const home = viewRect(true);
    const aspect = (home.x1 - home.x0) / Math.max(1, home.y1 - home.y0);
    if (!layoutAspect || Math.abs(Math.log(aspect / layoutAspect)) > 0.06) layoutFamilies(aspect);
    fitK = Math.min(W, H) / S;
    const b = root.box, m = S * 0.6;
    zoom.scaleExtent([fitK * 0.5, fitK * 800])
      .extent([[0, 0], [W, H]])
      .translateExtent([[b.x0 - m, b.y0 - m], [b.x1 + m, b.y1 + m]]);
    if (focus) zoomTo(focus, 0);
  }

  const screenR = (d) => d.r * transform.k;

  function update() {
    gZoom.attr("transform", transform);
    const v = viewRect();
    const openT = Math.min(v.x1 - v.x0, v.y1 - v.y0) * 0.42;
    const opened = (d) => d.depth === 0 || (hasKids(d) && screenR(d) > openT);
    const overview = !root.children.some(opened);

    labelSel.each(function (d) {
      const el = this;
      const s = screenR(d);
      const sx = transform.applyX(d.x), sy = transform.applyY(d.y);
      const visible = !opened(d) && opened(d.parent) && sx + s > 0 && sx - s < W && sy + s > 0 && sy - s < H;
      let fit = visible && fitLabel(d, s, overview && d.depth === 1);
      // never draw a label that would be clipped by the screen edge or hidden under the header
      if (fit) {
        const half = (fit.fs * fit.w) / 2 + 2;
        if (sx - half < 0 || sx + half > W || sy < v.y0 - 4 || sy > H) fit = null;
      }
      if (!fit) { if (el.style.display !== "none") el.style.display = "none"; return; }
      el.style.display = "";
      setLabelLines(el, d, fit);
      const { fs } = fit;
      const lh = fs * 1.12, cfs = fs * 0.7;
      const blockH = fit.lines.length * lh + (fit.count ? cfs * 1.25 : 0);
      let y = sy - blockH / 2 + fs * 0.82;
      el.setAttribute("font-size", fs.toFixed(1));
      el.setAttribute("stroke-width", (isLeaf(d) ? Math.max(1.5, fs / 5) : Math.max(2.2, fs / 4.6)).toFixed(1));
      for (const tsp of el.childNodes) {
        tsp.setAttribute("x", sx.toFixed(1));
        if (tsp.classList.contains("lbl-count")) {
          tsp.setAttribute("y", (y - lh + cfs * 1.42).toFixed(1));
          tsp.setAttribute("font-size", cfs.toFixed(1));
        } else {
          tsp.setAttribute("y", y.toFixed(1));
          y += lh;
        }
      }
    });

    // focus = deepest opened node containing the view centre
    const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    let f = root;
    for (;;) {
      const next = (f.children || []).find((c) => {
        if (!opened(c)) return false;
        return Math.hypot(transform.applyX(c.x) - cx, transform.applyY(c.y) - cy) < screenR(c);
      });
      if (!next) break;
      f = next;
    }
    if (f !== currentCrumb) renderCrumbs(f);
  }

  function setLabelLines(el, d, fit) {
    const key = fit.lines.join("\n") + (fit.count ? "#" : "");
    if (el.__key === key) return;
    el.__key = key;
    el.textContent = "";
    for (const ln of fit.lines) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      t.textContent = ln; el.append(t);
    }
    if (fit.count) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      t.setAttribute("class", "lbl-count");
      t.textContent = plural(countStyles(d), "style");
      el.append(t);
    }
  }

  function renderCrumbs(f) {
    currentCrumb = f;
    if (!zoomAnimating()) focus = f;
    const path = f.ancestors().reverse();
    crumbsList.innerHTML = path.map((d, i) => {
      const cur = i === path.length - 1;
      return `<li><button type="button" data-id="${esc(d.uid)}"${cur ? ' aria-current="page"' : ""}>${esc(d.depth === 0 ? "All beer" : d.data.name)}</button>${
        cur && d.depth === 0 ? `<span class="count">· ${plural(countStyles(root), "style")}</span>` : ""}</li>`;
    }).join("");
    crumbsList.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      const d = byId.get(b.dataset.id);
      if (d.depth > 0) select(d, "peek"); else closePanel(false);
      zoomTo(d);
    }));
    crumbsNav.scrollLeft = crumbsNav.scrollWidth;

    // keyboard: the visible children of the current focus are the tab stops in the chart
    circleSel.attr("tabindex", (d) => (d.parent === f ? 0 : -1));

    const fam = famOf(f);
    familiesNav.querySelectorAll(".fam-chip").forEach((c) => {
      const on = !!fam && fam !== root && c.dataset.id === fam.uid;
      c.setAttribute("aria-current", on ? "true" : "false");
      if (on) {
        const l = c.offsetLeft - 16, r = c.offsetLeft + c.offsetWidth + 16;
        if (l < familiesNav.scrollLeft || r > familiesNav.scrollLeft + familiesNav.clientWidth) {
          familiesNav.scrollTo({ left: l, behavior: reduceMotion ? "auto" : "smooth" });
        }
      }
    });
  }
  function zoomAnimating() { return d3.active(svg.node()) !== null; }

  // ---------- interaction ----------
  function onCircleClick(event, d) {
    event.stopPropagation();
    activate(d, event.detail === 0);
  }
  function activate(d, fromKeyboard) {
    hint.classList.add("gone");
    if (hasKids(d)) {
      select(d, isStyle(d) ? "half" : "peek", fromKeyboard);
      zoomTo(d);
    } else {
      select(d, "half", fromKeyboard);
      zoomTo(d.parent);
    }
  }

  function goTo(d, animate = true, focusPanel = false) {
    select(d, hasKids(d) && !isStyle(d) ? "peek" : "half", focusPanel);
    zoomTo(hasKids(d) ? d : d.parent, animate ? DUR : 0);
  }

  function setHover(d, e) {
    if (hovered) circleSel.filter((n) => n === hovered).classed("hovered", false);
    hovered = d;
    if (!d) { tooltip.hidden = true; return; }
    circleSel.filter((n) => n === d).classed("hovered", true);
    const sub = isStyle(d)
      ? `${fmtRange(d.data.abv, "% ABV")}${hasKids(d) ? ` · ${plural(countStyles(d), "sub-style")}` : ""}`
      : plural(countStyles(d), "style");
    tooltip.innerHTML = `<b>${esc(d.data.name)}</b><span>${esc(sub)}</span>`;
    tooltip.hidden = false;
    moveTooltip(e);
  }
  function moveTooltip(e) {
    if (tooltip.hidden || !e) return;
    const pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    const r = tooltip.getBoundingClientRect();
    if (x + r.width > W - 8) x = e.clientX - r.width - pad;
    if (y + r.height > H - 8) y = e.clientY - r.height - pad;
    tooltip.style.left = x + "px"; tooltip.style.top = y + "px";
  }

  function select(d, state = "half", focusPanel = false) {
    const swapping = panelState !== "closed" && selected !== d;
    selected = d;
    circleSel.classed("selected", (n) => n === d);
    renderPanel(d, swapping);
    const keep = (panelState === "full" || panelState === "half") && state === "peek";
    openPanel(sidePanel() ? "full" : keep ? panelState : state);
    if (focusPanel) {
      const h = panelBody.querySelector("h2");
      if (h) h.focus({ preventScroll: true });
    }
    try { history.replaceState(null, "", "#" + encodeURIComponent(d.uid)); } catch { /* ignore */ }
  }

  // ---------- panel ----------
  function openPanel(state) {
    panelState = state;
    panel.dataset.state = state;
    panel.setAttribute("aria-hidden", "false");
    panel.inert = false;
    document.body.classList.toggle("side-open", sidePanel());
  }
  function closePanel(rezoom = true) {
    if (panelState === "closed") return;
    const hadFocus = panel.contains(document.activeElement);
    const prev = selected;
    panelState = "closed";
    panel.dataset.state = "closed";
    panel.setAttribute("aria-hidden", "true");
    panel.inert = true;
    document.body.classList.remove("side-open");
    selected = null;
    circleSel.classed("selected", false);
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ }
    if (hadFocus) {
      const c = prev && circleSel.filter((n) => n === prev).node();
      if (c && c.getAttribute("tabindex") === "0") c.focus({ preventScroll: true });
      else (crumbsList.querySelector('[aria-current="page"]') || searchInput).focus({ preventScroll: true });
    }
    if (rezoom && focus) zoomTo(focus);
  }
  $("panelClose").addEventListener("click", () => closePanel());
  panel.addEventListener("click", (e) => {
    if (panelState === "peek" && !e.target.closest("button, a")) { openPanel("half"); zoomTo(focus); }
  });

  const VITALS = {
    abv: { label: "ABV", max: 14, unit: "%", word: (m) => (m < 4.5 ? "Sessionable" : m < 6.5 ? "Standard" : m < 8.5 ? "Strong" : "Very strong") },
    ibu: { label: "IBU", max: 100, unit: "", word: (m) => (m < 15 ? "Soft bitterness" : m < 30 ? "Balanced" : m < 50 ? "Firm bitterness" : "Bitter") },
    srm: { label: "SRM", max: 40, unit: "", word: (m) => (m < 4 ? "Straw" : m < 7 ? "Gold" : m < 12 ? "Amber" : m < 18 ? "Copper" : m < 25 ? "Brown" : m < 35 ? "Dark brown" : "Black") },
  };
  function vital(key, r) {
    if (!Array.isArray(r)) return "";
    const c = VITALS[key];
    const a = Math.min(r[0], c.max), b = Math.min(r[1], c.max);
    const left = (a / c.max) * 100, width = Math.max(4, ((b - a) / c.max) * 100);
    const fill = key === "srm" ? `;background:linear-gradient(to right, ${srmColor(r[0])}, ${srmColor(r[1])})` : "";
    const val = r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`;
    return `<div class="vital"><span class="k">${c.label}</span><span class="v">${val}${c.unit ? `<small>${c.unit}</small>` : ""}</span>
      <span class="w">${c.word(mid(r))}</span>
      <div class="bar ${key}" aria-hidden="true"><i style="left:${Math.min(left, 100 - width)}%;width:${width}%${fill}"></i></div></div>`;
  }

  function renderPanel(d, swapping) {
    const data = d.data;
    const fam = famOf(d);
    const path = d.ancestors().reverse().slice(1, -1).map((a) => a.data.name);
    const style = isStyle(d);
    const icon = style
      ? `<span class="glass" aria-hidden="true" style="background:linear-gradient(to bottom, ${srmColor(data.srm?.[0])}, ${srmColor(data.srm?.[1])})"></span>`
      : `<span class="fam-badge" aria-hidden="true" style="background:${fam.color}"></span>`;
    let h = `<div class="p-head">
      <div class="p-eyebrow"><span class="dot" style="background:${fam.color}"></span><span>${esc(path.length ? path.join(" / ") : "Beer family")}</span></div>
      <div class="p-title">${icon}<h2 tabindex="-1">${esc(data.name)}</h2></div>`;
    const tags = [];
    if (data.bjcp) tags.push(`BJCP ${esc(data.bjcp)}`);
    if (data.origin) tags.push(esc([data.origin.country, data.origin.era].filter(Boolean).join(" · ")));
    if (!style || hasKids(d)) tags.push(plural(countStyles(d), style ? "sub-style" : "style"));
    if (tags.length) h += `<div class="p-meta">${tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>`;
    h += `</div>`;
    if (data.description) h += `<p class="p-desc">${esc(data.description)}</p>`;

    if (style) {
      h += `<section class="p-section"><h3>Vital stats</h3><div class="vitals">${vital("abv", data.abv)}${vital("ibu", data.ibu)}${vital("srm", data.srm)}</div></section>`;

      const chips = (arr, cls = "") => `<div class="chips ${cls}">${arr.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>`;
      let rows = "";
      if (data.malts?.length) rows += `<div class="recipe-row"><span class="k">Malts</span>${chips(data.malts)}</div>`;
      if (data.hops?.length) rows += `<div class="recipe-row"><span class="k">Hops</span>${chips(data.hops, "hops")}</div>`;
      if (data.yeast) rows += `<div class="recipe-row"><span class="k">Yeast</span><div class="yeast">${esc(data.yeast)}</div></div>`;
      if (data.adjuncts?.length) rows += `<div class="recipe-row"><span class="k">Adjuncts</span>${chips(data.adjuncts)}</div>`;
      if (rows) h += `<section class="p-section"><h3>General recipe</h3><div class="recipe">${rows}</div></section>`;

      if (data.topSellers?.length) {
        h += `<section class="p-section"><h3>Top sellers worldwide</h3><ol class="sellers">${data.topSellers.map((s, i) => `
          <li><span class="rank" aria-hidden="true">${i + 1}</span><div><div class="s-name">${esc(s.name)}</div><div class="s-sub">${esc([s.brewery, s.country].filter(Boolean).join(" · "))}</div></div></li>`).join("")}
        </ol>`;
        const confText = { high: "Backed by published sales/volume data.", medium: "Among the most widely distributed examples; exact sales figures aren't published.", low: "Best-known commercial examples; niche style without public sales data." };
        const lvl = { low: 1, medium: 2, high: 3 }[data.sellersConfidence];
        if (lvl) h += `<p class="conf"><span class="meter" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= lvl ? "on" : ""}"></i>`).join("")}</span><span><b>Confidence: ${esc(data.sellersConfidence)}.</b> ${confText[data.sellersConfidence]}</span></p>`;
        h += `</section>`;
      }
    } else {
      // Group overview: the colour spread of every style inside.
      const styles = d.descendants().filter(isLeaf).sort((a, b) => (a.srm ?? 0) - (b.srm ?? 0));
      if (styles.length > 1) {
        const abvs = styles.flatMap((s) => s.data.abv || []);
        h += `<section class="p-section"><h3>Colour range</h3>
          <div class="spectrum" aria-hidden="true">${styles.map((s) => `<i style="background:${srmColor(s.srm)}"></i>`).join("")}</div>
          <div class="spectrum-cap"><span>${esc(styles[0].data.name)}</span><span>${abvs.length ? `${d3.min(abvs)}–${d3.max(abvs)}% ABV` : ""}</span><span>${esc(styles[styles.length - 1].data.name)}</span></div></section>`;
      }
    }

    if (hasKids(d)) {
      const kids = d.children.slice().sort((a, b) => a.data.name.localeCompare(b.data.name));
      h += `<section class="p-section"><h3>${style ? "Sub-styles" : "In this group"}</h3><div class="kids">${kids.map((k) => {
        const n = hasKids(k) ? `<span class="n">${countStyles(k)}</span>` : "";
        return `<button type="button" class="kid" data-id="${esc(k.uid)}"><span class="swatch" style="background:${isStyle(k) ? srmColor(k.srm) : famColor(k)}"></span>${esc(k.data.name)}${n}</button>`;
      }).join("")}</div></section>`;
    }

    if (data.sources?.length) {
      h += `<section class="p-section"><h3>Sources</h3><ol class="sources">${data.sources.map((u) => {
        let label = u; try { const url = new URL(u); label = url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/$/, ""); } catch { /* keep */ }
        return `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></li>`;
      }).join("")}</ol></section>`;
    }
    if (style) h += `<p class="p-foot">Stats follow BJCP 2021 / Brewers Association guidelines. Sales rankings are approximate.</p>`;

    panelBody.innerHTML = h;
    panelBody.scrollTop = 0;
    if (swapping && !reduceMotion) {
      panelBody.classList.remove("swap"); void panelBody.offsetWidth; panelBody.classList.add("swap");
    }
    panelBody.querySelectorAll(".kid").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const n = byId.get(b.dataset.id);
      if (n) goTo(n, true, true);
    }));
  }

  // ---------- bottom sheet dragging (phones) ----------
  // Touch: drag from the handle/header anywhere; from the body when the sheet isn't full,
  // or when it is full and scrolled to the top and the finger moves down. Mouse: handle/header.
  (() => {
    const order = ["full", "half", "peek", "closed"];
    let drag = null, touch = null;
    const peekH = () => parseFloat(getComputedStyle(panel).getPropertyValue("--peek")) + $("sabProbe").offsetHeight;
    const stateY = (st) => {
      const h = panel.offsetHeight;
      return { full: 0, half: h * 0.5, peek: h - peekH(), closed: h }[st];
    };
    function start(y, time) {
      drag = { startY: y, startT: stateY(panelState), lastY: y, lastTime: time, vel: 0, moved: false };
      panel.classList.add("dragging");
    }
    function move(y, time) {
      const dy = y - drag.startY;
      if (Math.abs(dy) > 4) drag.moved = true;
      let pos = drag.startT + dy;
      if (pos < 0) pos /= 4; // rubber-band past full
      panel.style.transform = `translateY(${pos}px)`;
      const dt = time - drag.lastTime;
      if (dt > 0) drag.vel = 0.6 * ((y - drag.lastY) / dt) + 0.4 * drag.vel;
      drag.lastY = y; drag.lastTime = time;
    }
    function end() {
      const d = drag; drag = null;
      panel.classList.remove("dragging");
      panel.style.transform = "";
      if (!d || !d.moved) return false;
      const pos = d.startT + (d.lastY - d.startY);
      const ys = order.map((st) => [st, stateY(st)]);
      let target = ys.reduce((a, b) => (Math.abs(b[1] - pos) < Math.abs(a[1] - pos) ? b : a))[0];
      if (Math.abs(d.vel) > 0.45) { // fling: next snap point in the direction of travel
        const ahead = ys.filter(([, y]) => (d.vel > 0 ? y > pos + 1 : y < pos - 1));
        if (ahead.length) target = (d.vel > 0 ? ahead[0] : ahead[ahead.length - 1])[0];
      }
      if (target === "closed") closePanel();
      else { openPanel(target); if (target !== "full" && focus) zoomTo(focus); }
      return true;
    }
    function swallowNextClick() {
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 400);
    }

    panel.addEventListener("touchstart", (e) => {
      if (sidePanel() || e.touches.length !== 1) { touch = null; return; }
      const t = e.touches[0];
      touch = { x: t.clientX, y: t.clientY, grip: !!e.target.closest(".sheet-handle, .p-head"), decided: false, drag: false };
    }, { passive: true });
    panel.addEventListener("touchmove", (e) => {
      if (!touch) return;
      const t = e.touches[0];
      const dy = t.clientY - touch.y, dx = t.clientX - touch.x;
      if (!touch.decided) {
        if (dx === 0 && dy === 0) return;
        touch.decided = true;
        touch.drag = touch.grip || panelState !== "full" || (panelBody.scrollTop <= 0 && dy > 0);
        if (touch.drag) start(touch.y, e.timeStamp);
      }
      if (touch.drag) { if (e.cancelable) e.preventDefault(); move(t.clientY, e.timeStamp); }
    }, { passive: false });
    const touchEnd = () => {
      if (touch && touch.drag && end()) swallowNextClick();
      touch = null;
    };
    panel.addEventListener("touchend", touchEnd);
    panel.addEventListener("touchcancel", touchEnd);

    panel.addEventListener("pointerdown", (e) => {
      if (sidePanel() || e.pointerType === "touch" || e.button !== 0) return;
      if (!e.target.closest(".sheet-handle, .p-head")) return;
      start(e.clientY, e.timeStamp);
      panel.setPointerCapture(e.pointerId);
    });
    panel.addEventListener("pointermove", (e) => { if (drag && e.pointerType !== "touch") move(e.clientY, e.timeStamp); });
    const pointerEnd = (e) => { if (drag && e.pointerType !== "touch" && end()) swallowNextClick(); };
    panel.addEventListener("pointerup", pointerEnd);
    panel.addEventListener("pointercancel", pointerEnd);
  })();

  // ---------- families ----------
  function buildFamilies() {
    const orderIds = Object.keys(FAMILY_COLORS);
    root.children.slice().sort((a, b) => orderIds.indexOf(a.data.id) - orderIds.indexOf(b.data.id))
      .forEach((f) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "fam-chip"; b.dataset.id = f.uid;
        b.style.setProperty("--fam", f.color);
        b.innerHTML = `<span class="dot" aria-hidden="true" style="background:${f.color}"></span>${esc(f.data.name)}`;
        b.addEventListener("click", () => {
          hint.classList.add("gone");
          if (focus === f) { closePanel(false); zoomTo(root); return; }
          select(f, "peek");
          zoomTo(f);
        });
        familiesNav.append(b);
      });
  }

  // ---------- random ----------
  $("randomBtn").addEventListener("click", (e) => {
    if (!leaves) return;
    let d;
    do d = leaves[Math.floor(Math.random() * leaves.length)]; while (leaves.length > 1 && d === selected);
    hint.classList.add("gone");
    const btn = e.currentTarget;
    btn.classList.remove("spin"); void btn.offsetWidth; btn.classList.add("spin");
    goTo(d, true, e.detail === 0);
  });

  // ---------- search ----------
  let index = [], activeIdx = -1, results = [];
  function buildSearch() {
    index = nodes.filter((d) => d.depth > 0).map((d) => ({
      d,
      name: d.data.name.toLowerCase(),
      nameN: slug(d.data.name).replace(/-/g, " "),
      sellers: (d.data.topSellers || []).map((s) => s.name),
      extra: [...(d.data.hops || []), ...(d.data.malts || []), ...(d.data.adjuncts || []), d.data.origin?.country || ""],
    }));
    searchInput.addEventListener("input", runSearch);
    searchInput.addEventListener("focus", () => { if (searchInput.value) runSearch(); });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(results.length - 1, activeIdx + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(0, activeIdx - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); const r = results[Math.max(0, activeIdx)]; if (r) choose(r, true); }
      else if (e.key === "Escape") { hideResults(); searchInput.blur(); }
    });
    document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".search")) hideResults(); });
  }
  function highlight(name, q) {
    const i = name.toLowerCase().indexOf(q);
    if (i < 0 || !q) return esc(name);
    return esc(name.slice(0, i)) + "<mark>" + esc(name.slice(i, i + q.length)) + "</mark>" + esc(name.slice(i + q.length));
  }
  function runSearch() {
    const q = searchInput.value.trim().toLowerCase();
    const qn = slug(q).replace(/-/g, " ");
    if (!q) { hideResults(); return; }
    results = [];
    for (const it of index) {
      let score = 0, via = "";
      if (it.name.startsWith(q) || it.nameN.startsWith(qn)) score = 100;
      else if (it.name.includes(q) || it.nameN.includes(qn)) score = 80;
      else {
        const s = it.sellers.find((x) => x.toLowerCase().includes(q));
        if (s) { score = 60; via = s; }
        else {
          const x = it.extra.find((x) => x && x.toLowerCase().includes(q));
          if (x && q.length >= 3) { score = 30; via = x; }
        }
      }
      if (score) results.push({ ...it, score: score - it.d.depth * 0.5 + (isStyle(it.d) ? 1 : 0), via });
    }
    results.sort((a, b) => b.score - a.score || a.d.data.name.localeCompare(b.d.data.name));
    results = results.slice(0, 12);
    searchResults.innerHTML = results.length ? results.map((r, i) => {
      const d = r.d;
      const sw = isStyle(d) ? srmColor(d.srm) : famColor(d);
      const path = d.ancestors().reverse().slice(1, -1).map((a) => a.data.name).join(" / ") || "Family";
      return `<li role="option" id="sr-${i}" data-i="${i}" aria-selected="false"><span class="swatch" style="background:${sw}"></span><div><div class="r-name">${highlight(d.data.name, q)}</div><div class="r-path">${esc(r.via ? `via ${r.via} · ${path}` : path)}</div></div></li>`;
    }).join("") : `<li class="r-empty" aria-disabled="true">No matches for “${esc(searchInput.value.trim())}”</li>`;
    searchResults.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
    activeIdx = -1;
    searchResults.querySelectorAll("li[data-i]").forEach((li) => li.addEventListener("click", () => choose(results[+li.dataset.i], false)));
  }
  function setActive(i) {
    activeIdx = i;
    searchResults.querySelectorAll("li[data-i]").forEach((li) => li.setAttribute("aria-selected", +li.dataset.i === i ? "true" : "false"));
    const el = $("sr-" + i);
    if (el) { el.scrollIntoView({ block: "nearest" }); searchInput.setAttribute("aria-activedescendant", el.id); }
  }
  function hideResults() { searchResults.hidden = true; searchInput.setAttribute("aria-expanded", "false"); searchInput.removeAttribute("aria-activedescendant"); }
  function choose(r, fromKeyboard) {
    hideResults();
    searchInput.value = "";
    searchInput.blur();
    hint.classList.add("gone");
    goTo(r.d, true, fromKeyboard);
  }

  // ---------- keyboard ----------
  document.addEventListener("keydown", (e) => {
    const typing = document.activeElement === searchInput;
    if (e.key === "Escape" && !typing) {
      if (panelState !== "closed") closePanel();
      else if (focus && focus.parent) zoomTo(focus.parent);
    }
    if (e.key === "/" && !typing) { e.preventDefault(); searchInput.focus(); }
  });
})();
