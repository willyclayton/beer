/* Beer Style Atlas — the Beer River: styles on a timeline, flowing in family streams */
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
  // river layout (world units)
  const LANE_ORDER = ["wild-sour", "belgian", "wheat", "historical", "ales", "hybrid", "lagers", "specialty"];
  const SHORT_NAMES = { "wild-sour": "Sour", belgian: "Belgian", wheat: "Wheat", historical: "Historic", ales: "Ales", hybrid: "Hybrid", lagers: "Lagers", specialty: "Specialty" };
  const FERMENTS = [
    { id: "wild", name: "Wild & spontaneous", color: "#E2675A" },
    { id: "ale", name: "Ale · top-fermented", color: "#E39B3A" },
    { id: "hybrid", name: "Hybrid", color: "#8DBA6A" },
    { id: "lager", name: "Lager · bottom-fermented", color: "#5FB0C9" },
  ];
  const SHORT_FERM = { wild: "Wild", ale: "Ale", hybrid: "Hybrid", lager: "Lager" };
  const TRAITS = [
    { id: "hoppy", name: "Hoppy", color: "#3FAF62", test: (d) => mid(d.data.ibu) >= 40 },
    { id: "dark", name: "Dark & roasty", color: "#9A6A4C", test: (d) => mid(d.data.srm) >= 25 },
    { id: "strong", name: "Strong", color: "#E2525C", test: (d) => mid(d.data.abv) >= 7.5 },
    { id: "sour", name: "Sour", color: "#C7C22E", test: (d) => famOf(d).data.id === "wild-sour" || /lacto|brett|pedio|sour|acid/i.test(d.data.yeast || "") },
    { id: "malty", name: "Malty", color: "#E0913A", test: (d) => mid(d.data.ibu) <= 25 && mid(d.data.srm) >= 10 },
    { id: "crisp", name: "Light & crisp", color: "#4FAEE0", test: (d) => mid(d.data.srm) <= 5 && mid(d.data.abv) <= 5.2 },
  ];
  const TICKS = [1000, 1500, 1600, 1700, 1800, 1850, 1900, 1950, 1980, 2000, 2010, 2020];
  const LANE_GAP = 80, SANKEY_W = 300;
  let COLLIDE = 19; // dot spacing in world units: set per viewport so dots keep ~24px apart on screen
  // brewing milestones drawn along the time axis
  const EVENTS = [
    { year: 1516, name: "Reinheitsgebot", text: "Bavaria's beer purity law limits ingredients to barley, hops and water." },
    { year: 1842, name: "First Pilsner", text: "Josef Groll brews the first pale lager in Plzeň, Bohemia." },
    { year: 1873, name: "Refrigeration", text: "Carl von Linde's refrigeration machine, developed for Munich's Spaten brewery, frees lager from cold cellars." },
    { year: 1876, name: "Pasteur", text: "Louis Pasteur publishes Études sur la bière, explaining fermentation and spoilage." },
    { year: 1883, name: "Pure yeast", text: "Emil Christian Hansen isolates a pure lager yeast culture at Carlsberg." },
    { year: 1920, end: 1933, name: "US Prohibition", text: "Alcohol is banned in the United States (1920–1933); hundreds of breweries close." },
    { year: 1965, name: "Anchor", text: "Fritz Maytag buys San Francisco's Anchor Brewing, an early spark of American craft beer." },
    { year: 1971, name: "CAMRA", text: "The Campaign for Real Ale is founded in Britain to save cask ale." },
    { year: 1978, name: "Homebrewing legal", text: "US federal law legalises homebrewing, seeding the craft beer boom." },
  ];
  const STORIES = [
    { id: "english-porter", title: "The stout family", sub: "Porter → Stout → Imperial" },
    { id: "english-pale-ale", title: "How IPA took over", sub: "Pale Ale → IPA → Hazy" },
    { id: "czech-premium-pale-lager", title: "Pilsner conquers the world", sub: "Plzeň, 1842 → everywhere" },
    { id: "lambic", title: "Wild & sour", sub: "Lambic → Gueuze → American Wild" },
  ];
  let T_LEN = 2600; // timeline length: set per viewport so the river fills the screen
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DUR = reduceMotion ? 0 : 750;
  const INTRO_MS = 1700; // entrance: the timeline sweeps open over this long
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
  let root, nodes, styles, byId = new Map();
  let W = 0, H = 0, homeK = 1, vertical = false, drawn = false;
  let transform = d3.zoomIdentity, lastFit = null, view = null;
  let selected = null, hovered = null, focused = null, litSet = null, litLinks = [], introFront = Infinity;
  const activeTraits = new Set();
  let panelState = "closed";
  let tScale, lanes = [], ribbons = [], L_LEN = 0, sankeyUnit = 1, linkData = [];
  let gradDefs, gWorld, gBands, gGrid, gSankey, gLinks, gFlow, gBlobs, gArrows, gNodes, gLabels, gOverlay;
  let nodeSel, linkSel, labelSel, blobSel = null, zoom;

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
  // text colour for a family/source hue that keeps >= 4.5:1 against the page in the current theme
  const inkCache = new Map();
  function ink(hex) {
    const dark = isDark, key = hex + dark;
    if (!inkCache.has(key)) {
      const bg = luminance(dark ? "#120f0c" : "#f7f2ea");
      const c = d3.lab(hex);
      for (let i = 0; i < 30 && contrast(luminance(c.formatHex()), bg) < 4.6; i++) c.l += dark ? 2 : -2;
      inkCache.set(key, c.formatHex());
    }
    return inkCache.get(key);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // ---------- theme ----------
  const darkTheme = () => {
    const t = document.documentElement.dataset.theme;
    if (t) return t === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  let isDark = false; // cached: read on every zoom frame
  function syncThemeChrome() {
    const dark = isDark = darkTheme();
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
  fetch("data/beers.json?v=202611250322")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch((err) => { $("loading").textContent = "Couldn't load beer data (" + err.message + ")"; console.error(err); });

  function init(data) {
    root = d3.hierarchy(data);
    nodes = root.descendants();
    nodes.forEach((d, i) => {
      d.uid = d.data.id || slug(d.data.name) || "n" + i;
      if (byId.has(d.uid)) d.uid += "-" + i;
      byId.set(d.uid, d);
      d.srm = isStyle(d) ? mid(d.data.srm) : null;
    });
    styles = nodes.filter(isStyle);
    root.children.forEach((f, i) => { f.color = FAMILY_COLORS[f.data.id] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]; });
    root.color = "#999";
    prepareLineage();
    measureLabels();
    layoutRiver();

    buildChart();
    buildFamilies();
    buildTraits();
    buildFinder();
    buildSearch();
    const nStyles = styles.length;
    searchInput.placeholder = window.innerWidth < 420 ? `Search ${nStyles} styles…` : `Search ${nStyles} styles, beers, hops…`;
    $("loading").hidden = true;

    resize();
    paint();
    window.addEventListener("resize", debounce(resize, 100));
    sideMQ.addEventListener("change", resize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureLabels(); update(); });

    const startId = decodeURIComponent(location.hash.slice(1));
    hint.hidden = true; // the stories card is the welcome now
    if (lsGet("beer-view") === "list") setView("list");
    if (readTestHash(startId)) { fitHome(0); setFinder(true); }
    else if (startId && byId.has(startId)) goTo(byId.get(startId), false);
    else { fitHome(0); entrance(); setTimeout(buildStories, reduceMotion ? 0 : 900); }
    window.addEventListener("hashchange", () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id && byId.has(id) && byId.get(id) !== selected) goTo(byId.get(id));
    });
  }

  // ---------- lineage: years, fermentation, parent/child links ----------
  function parseEra(era) {
    if (!era) return null;
    const s = String(era).toLowerCase();
    const bce = /bce|bc\b|ancient|millenni/.test(s);
    let m = s.match(/(\d{3,4})s?/);
    if (m) return (bce ? -1 : 1) * (+m[1] + (/s\b/.test(m[0]) ? 5 : 0));
    m = s.match(/(\d{1,2})(st|nd|rd|th)[\s-]+century/);
    if (m) {
      const base = (+m[1] - 1) * 100;
      const off = /early/.test(s) ? 15 : /mid/.test(s) ? 50 : /late/.test(s) ? 85 : 50;
      return (bce ? -1 : 1) * (base + off);
    }
    return bce ? -2000 : null;
  }
  const defaultFerment = (d) => ({ lagers: "lager", "wild-sour": "wild", hybrid: "hybrid" }[famOf(d).data.id] || "ale");

  function prepareLineage() {
    styles.forEach((s) => {
      s.year = Number.isFinite(s.data.year) ? s.data.year : parseEra(s.data.origin?.era) ?? 1950;
      s.ferm = FERMENTS.find((f) => f.id === s.data.fermentation) ? s.data.fermentation : defaultFerment(s);
      s.kids = [];
    });
    styles.forEach((s) => {
      s.parentLinks = (s.data.parents || [])
        .map((p) => ({ ...p, node: byId.get(p.id) }))
        .filter((p) => p.node && p.node !== s && isStyle(p.node));
      s.parentLinks.forEach((p) => p.node.kids.push({ ...p, node: s }));
    });
    const memo = new Map();
    const desc = (s, seen = new Set()) => {
      if (memo.has(s)) return memo.get(s);
      seen.add(s);
      const set = new Set();
      s.kids.forEach((k) => { if (!seen.has(k.node)) { set.add(k.node); desc(k.node, seen).forEach((x) => set.add(x)); } });
      memo.set(s, set);
      return set;
    };
    styles.forEach((s) => { s.descendantSet = desc(s); s.nDesc = s.descendantSet.size; });
    styles.forEach((s) => {
      const set = new Set(), stack = s.parentLinks.map((p) => p.node);
      while (stack.length) { const a = stack.pop(); if (set.has(a) || a === s) continue; set.add(a); a.parentLinks.forEach((p) => stack.push(p.node)); }
      s.ancestorSet = set;
    });
    styles.forEach((s) => { s.traits = TRAITS.filter((t) => { try { return t.test(s); } catch { return false; } }).map((t) => t.id); });
  }

  // ---------- layout: (t = time, l = lane) world coordinates ----------
  function layoutRiver() {
    const minYear = Math.min(d3.min(styles, (s) => s.year), 1000);
    tScale = d3.scaleLinear()
      .domain([minYear - 50, 1500, 1800, 1900, 1980, 2026])
      .range([0, 0.08, 0.22, 0.48, 0.66, 1].map((r) => r * T_LEN))
      .clamp(true);

    const fams = LANE_ORDER.map((id) => root.children.find((f) => f.data.id === id)).filter(Boolean)
      .concat(root.children.filter((f) => !LANE_ORDER.includes(f.data.id)));
    let l = 0;
    lanes = fams.map((f) => {
      const members = styles.filter((s) => famOf(s) === f);
      const th = Math.max(90, members.length * 9.5);
      const lane = { f, members, l0: l, l1: l + th, mid: l + th / 2 };
      f.lane = lane;
      l += th + LANE_GAP;
      return lane;
    });
    L_LEN = l - LANE_GAP;

    // within each lane, order styles like a family tree: depth-first through the lineage,
    // so a style's descendants sit right beside it and the lines fan out instead of piling up
    lanes.forEach((ln) => {
      const inLane = new Set(ln.members);
      const primary = (s) => s.parentLinks.map((p) => p.node).find((n) => inLane.has(n) && n.year <= s.year + 1);
      const kidsOf = new Map(ln.members.map((s) => [s, []]));
      const roots = [];
      ln.members.forEach((s) => { const p = primary(s); if (p) kidsOf.get(p).push(s); else roots.push(s); });
      const byYear = (a, b) => a.year - b.year || a.data.name.localeCompare(b.data.name);
      const order = [];
      const seen = new Set();
      const dfs = (s) => { if (seen.has(s)) return; seen.add(s); order.push(s); kidsOf.get(s).sort(byYear).forEach(dfs); };
      roots.sort(byYear).forEach(dfs);
      ln.members.forEach((s) => { if (!seen.has(s)) dfs(s); });
      const pad = 22, span = ln.l1 - ln.l0 - pad * 2;
      order.forEach((s, i) => { s.slotL = ln.l0 + pad + ((i + 0.5) / order.length) * span; });
    });

    // place styles: time fixed-ish on x, family-tree slot on y, then relax overlaps
    const pts = styles.map((s) => {
      const lane = famOf(s).lane;
      return { s, lane, t: tScale(s.year), x: tScale(s.year), y: s.slotL, r: COLLIDE + Math.sqrt(s.nDesc) * 2 };
    });
    const sim = d3.forceSimulation(pts)
      .force("x", d3.forceX((p) => p.t).strength(0.8))
      .force("y", d3.forceY((p) => p.s.slotL).strength(0.22))
      .force("c", d3.forceCollide((p) => p.r).strength(0.9).iterations(3))
      .stop();
    for (let i = 0; i < 360; i++) {
      sim.tick();
      pts.forEach((p) => {
        p.y = clamp(p.y, p.lane.l0 + p.r * 0.6, p.lane.l1 - p.r * 0.6);
        p.x = clamp(p.x, 8, T_LEN);
      });
    }
    pts.forEach((p) => { p.s.t = p.x; p.s.l = p.y; });

    // sankey: fermentation sources → family lanes (width ∝ number of styles)
    const unit = d3.min(lanes, (ln) => ((ln.l1 - ln.l0) * 0.7) / Math.max(1, ln.members.length));
    sankeyUnit = unit;
    const total = styles.length * unit + (FERMENTS.length - 1) * 34;
    let src = L_LEN / 2 - total / 2;
    FERMENTS.forEach((fm) => {
      fm.count = styles.filter((s) => s.ferm === fm.id).length;
      fm.l0 = src; fm.l1 = src + fm.count * unit; src = fm.l1 + 34;
      fm.cursor = fm.l0;
    });
    lanes.forEach((ln) => {
      ln.entryW = ln.members.length * unit;
      ln.cursor = ln.mid - ln.entryW / 2;
    });
    ribbons = [];
    lanes.forEach((ln) => FERMENTS.forEach((fm) => {
      const n = ln.members.filter((s) => s.ferm === fm.id).length;
      if (!n) return;
      ribbons.push({ fm, ln, n, a0: fm.cursor, a1: fm.cursor + n * unit, b0: ln.cursor, b1: ln.cursor + n * unit });
    }));
    // order ribbon slots so they don't cross needlessly: within each source by lane order, within each lane by source order
    FERMENTS.forEach((fm) => { fm.cursor = fm.l0; });
    lanes.forEach((ln) => { ln.cursor = ln.mid - ln.entryW / 2; });
    lanes.forEach((ln) => FERMENTS.forEach((fm) => {
      const rb = ribbons.find((r) => r.fm === fm && r.ln === ln);
      if (!rb) return;
      rb.a0 = fm.cursor; rb.a1 = fm.cursor += rb.n * unit;
    }));
    lanes.forEach((ln) => FERMENTS.forEach((fm) => {
      const rb = ribbons.find((r) => r.fm === fm && r.ln === ln);
      if (!rb) return;
      rb.b0 = ln.cursor; rb.b1 = ln.cursor += rb.n * unit;
    }));

    // lane envelopes: a stream that hugs its styles and widens where the family branched
    lanes.forEach((ln) => {
      const samples = [];
      for (let t = 0; t <= T_LEN + 40; t += 20) {
        const near = ln.members.filter((s) => Math.abs(s.t - t) < Math.max(80, COLLIDE * 3));
        const hb = Math.max(5, (ln.entryW / 2) * Math.exp(-t / 260));
        let lo = ln.mid - hb, hi = ln.mid + hb;
        near.forEach((s) => { lo = Math.min(lo, s.l - COLLIDE * 1.3); hi = Math.max(hi, s.l + COLLIDE * 1.3); });
        samples.push({ t, lo, hi });
      }
      const smooth = (key, fn) => samples.map((p, i) => {
        const w = samples.slice(Math.max(0, i - 2), i + 3).map((q) => q[key]);
        return fn(d3.mean(w), p[key]);
      });
      const lo = smooth("lo", Math.min), hi = smooth("hi", Math.max);
      ln.env = samples.map((p, i) => ({ t: p.t, lo: lo[i], hi: hi[i] }));
    });
  }

  // orientation: horizontal (time →) or vertical (time ↓)
  const P = (t, l) => (vertical ? [l, t] : [t, l]);
  const nodeXY = (s) => P(s.t, s.l);
  function worldBox() {
    const t0 = -SANKEY_W - (vertical ? 70 : 300), t1 = T_LEN + 50, l0 = -30, l1 = L_LEN + 30;
    return vertical ? { x0: l0, x1: l1, y0: t0, y1: t1 } : { x0: t0, x1: t1, y0: l0, y1: l1 };
  }
  function ribbonPath(t0, a0, a1, t1, b0, b1) {
    const tm = (t0 + t1) / 2;
    const p = (t, l) => P(t, l).join(",");
    return `M${p(t0, a0)}C${p(tm, a0)} ${p(tm, b0)} ${p(t1, b0)}L${p(t1, b1)}C${p(tm, b1)} ${p(tm, a1)} ${p(t0, a1)}Z`;
  }
  function linkPath(a, b) {
    const dt = Math.max(60, Math.abs(b.t - a.t) * 0.5);
    const p = (t, l) => P(t, l).join(",");
    return `M${p(a.t, a.l)}C${p(a.t + dt, a.l)} ${p(b.t - dt, b.l)} ${p(b.t, b.l)}`;
  }

  // ---------- labels ----------
  const measureCtx = document.createElement("canvas").getContext("2d");
  function measureLabels() {
    measureCtx.font = `600 100px ${FONT_STACK}`;
    styles.forEach((s) => {
      s.labelName = s.data.name.replace(/\s*\(.*?\)\s*/g, " ").trim() || s.data.name;
      s.labelW = measureCtx.measureText(s.labelName).width / 100;
    });
  }

  // ---------- chart ----------
  function buildChart() {
    const defs = svg.append("defs");
    // trait regions: blur + alpha threshold melts nearby circles into one soft region (the "goo"),
    // then a thin rim is cut out of it so overlapping regions read like a Venn diagram
    defs.append("filter").attr("id", "goo").attr("filterUnits", "userSpaceOnUse").attr("color-interpolation-filters", "sRGB")
      .call((f) => {
        f.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", 8).attr("result", "blur");
        f.append("feColorMatrix").attr("in", "blur").attr("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10").attr("result", "goo");
        f.append("feMorphology").attr("in", "goo").attr("operator", "erode").attr("radius", 1.3).attr("result", "inner");
        f.append("feComposite").attr("in", "goo").attr("in2", "inner").attr("operator", "out").attr("result", "rim");
        f.append("feComponentTransfer").attr("in", "goo").attr("result", "fill").append("feFuncA").attr("type", "linear").attr("slope", 0.34);
        const m = f.append("feMerge");
        m.append("feMergeNode").attr("in", "fill");
        m.append("feMergeNode").attr("in", "rim");
      });
    defs.append("clipPath").attr("id", "sweep").append("rect");
    gradDefs = defs;

    gWorld = svg.append("g").attr("class", "world");
    gBands = gWorld.append("g").attr("class", "bands");
    gGrid = gWorld.append("g").attr("class", "grid");
    gSankey = gWorld.append("g").attr("class", "sankey");
    gLinks = gWorld.append("g").attr("class", "links");
    gFlow = gWorld.append("g").attr("class", "flow").attr("aria-hidden", "true");
    gBlobs = svg.append("g").attr("class", "blobs").attr("aria-hidden", "true");
    gArrows = svg.append("g").attr("class", "arrows").attr("aria-hidden", "true");
    gNodes = svg.append("g").attr("class", "nodes");
    gLabels = svg.append("g").attr("class", "labels").attr("aria-hidden", "true");
    gOverlay = svg.append("g").attr("class", "overlay").attr("aria-hidden", "true");
    gOverlay.append("rect").attr("class", "axis-bg");
    gOverlay.append("rect").attr("class", "lane-bg");

    linkData = [];
    styles.forEach((s) => s.parentLinks.forEach((p) => linkData.push({ parent: p.node, child: s, kind: p.kind || "descended" })));

    // DOM (= tab) order follows the river: lane by lane, oldest first
    const laneIdx = (s) => lanes.indexOf(famOf(s).lane);
    const riverOrder = styles.slice().sort((a, b) => laneIdx(a) - laneIdx(b) || a.t - b.t);
    nodeSel = gNodes.selectAll("circle").data(riverOrder).join("circle")
      .attr("class", (s) => "node" + (famOf(s).data.id === "historical" ? " historical" : ""))
      .attr("tabindex", (s) => (isTabStop(s) ? 0 : -1))
      .attr("role", "button")
      .attr("aria-label", (s) => `${s.data.name}, ${s.data.yearLabel || s.year}, ${fmtRange(s.data.abv, "% ABV")}`)
      .on("click", (e, s) => { e.stopPropagation(); activate(s, e.detail === 0); })
      .on("keydown", (e, s) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(s, true); } })
      .on("focus", (e, s) => { focused = s; panIntoView(s); update(); })
      .on("blur", () => { focused = null; update(); })
      .on("pointerenter", (e, s) => { if (canHover && e.pointerType === "mouse") setHover(s, e); })
      .on("pointermove", (e) => { if (canHover) moveTooltip(e); })
      .on("pointerleave", () => { if (canHover) setHover(null); });

    labelSel = gLabels.selectAll("text").data(styles).join("text").text((s) => s.labelName).style("display", "none");

    zoom = d3.zoom()
      .clickDistance(8)
      .tapDistance(12)
      .constrain(constrain)
      .on("start", (e) => { if (e.sourceEvent) hideIntro(); })
      .on("zoom", (e) => { transform = e.transform; update(); });
    svg.call(zoom).on("dblclick.zoom", null);
    svg.on("click", (e) => {
      if (e.target.closest && e.target.closest("circle.node")) return;
      if (selected) closePanel(false);
    });
  }

  // pan limits that follow the visible area (e.g. above the bottom sheet): the river's edge may come
  // as far as the middle of the view, never further, so there's always something to look at
  function constrain(t) {
    const v = view, b = worldBox();
    if (!v) return t;
    const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    const fix = (lo, hi, c) => (lo > c ? c - lo : hi < c ? c - hi : 0);
    const dx = fix(t.applyX(b.x0), t.applyX(b.x1), cx), dy = fix(t.applyY(b.y0), t.applyY(b.y1), cy);
    return dx || dy ? t.translate(dx / t.k, dy / t.k) : t;
  }

  // keyboard focus on an off-screen style pans it into view
  function panIntoView(s) {
    const v = view, [wx, wy] = nodeXY(s);
    const x = transform.applyX(wx), y = transform.applyY(wy), m = 40;
    const dx = clamp(x, v.x0 + m, v.x1 - m) - x, dy = clamp(y, v.y0 + m, v.y1 - m) - y;
    if (!dx && !dy) return;
    svg.transition().duration(DUR / 2).ease(d3.easeCubicOut).call(zoom.translateBy, dx / transform.k, dy / transform.k);
  }

  // geometry that depends on orientation
  function drawWorld() {
    const ticks = TICKS.filter((y) => y >= tScale.domain()[0]);
    gGrid.selectAll("line.tickline").data(ticks).join("line").attr("class", "tickline")
      .each(function (y) {
        const [x1, y1] = P(tScale(y), -20), [x2, y2] = P(tScale(y), L_LEN + 20);
        d3.select(this).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
      });

    gGrid.selectAll("rect.era").data(EVENTS.filter((e) => e.end)).join("rect")
      .attr("class", "era")
      .each(function (e) {
        const [x1, y1] = P(tScale(e.year), -20), [x2, y2] = P(tScale(e.end), L_LEN + 20);
        d3.select(this).attr("x", Math.min(x1, x2)).attr("y", Math.min(y1, y2)).attr("width", Math.abs(x2 - x1)).attr("height", Math.abs(y2 - y1));
      });
    gGrid.selectAll("line.event").data(EVENTS.filter((e) => !e.end)).join("line")
      .attr("class", "event")
      .each(function (e) {
        const [x1, y1] = P(tScale(e.year), -20), [x2, y2] = P(tScale(e.year), L_LEN + 20);
        d3.select(this).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
      });

    const area = vertical
      ? d3.area().y((p) => p.t).x0((p) => p.lo).x1((p) => p.hi).curve(d3.curveBasis)
      : d3.area().x((p) => p.t).y0((p) => p.lo).y1((p) => p.hi).curve(d3.curveBasis);
    gBands.selectAll("path").data(lanes).join("path")
      .attr("d", (ln) => area(ln.env))
      .attr("fill", (ln) => ln.f.color);

    const T0 = -SANKEY_W;
    gSankey.selectAll("path.ribbon").data(ribbons).join("path")
      .attr("class", "ribbon")
      .attr("d", (r) => ribbonPath(T0 + 14, r.a0, r.a1, 0, r.b0, r.b1))
      .attr("fill", (r) => r.fm.color);
    gSankey.selectAll("rect.source").data(FERMENTS.filter((f) => f.count)).join("rect")
      .attr("class", "source")
      .attr("rx", 5)
      .each(function (fm) {
        const [x, y] = P(T0, fm.l0), [x2, y2] = P(T0 + 14, fm.l1);
        d3.select(this).attr("x", Math.min(x, x2)).attr("y", Math.min(y, y2)).attr("width", Math.abs(x2 - x)).attr("height", Math.abs(y2 - y));
      })
      .attr("fill", (fm) => fm.color);

    // per-link gradient parent → child family colour
    gradDefs.selectAll("linearGradient.lg").data(linkData).join("linearGradient")
      .attr("class", "lg")
      .attr("id", (d, i) => "lg" + i)
      .attr("gradientUnits", "userSpaceOnUse")
      .each(function (d) {
        const [x1, y1] = nodeXY(d.parent), [x2, y2] = nodeXY(d.child);
        const g = d3.select(this).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
        g.selectAll("stop").data([famColor(d.parent), famColor(d.child)]).join("stop")
          .attr("offset", (c, i) => (i ? "100%" : "0%")).attr("stop-color", (c) => c);
      });
    linkSel = gLinks.selectAll("path").data(linkData).join("path")
      .attr("class", (d) => "link " + d.kind)
      .attr("d", (d) => linkPath(d.parent, d.child))
      .attr("stroke", (d, i) => `url(#lg${i})`)
      .attr("stroke-width", linkWidth)
      .attr("vector-effect", "non-scaling-stroke");
    drawFlow();
  }
  const linkWidth = (d) => +(1.3 + Math.sqrt(d.child.nDesc + 1) * 0.9).toFixed(2);

  // a traced lineage "flows": light pulses travel each lit line from parent to child
  function drawFlow() {
    const flowing = selected && isStyle(selected) && !reduceMotion ? litLinks : [];
    gFlow.selectAll("path").data(flowing).join("path")
      .attr("d", (d) => linkPath(d.parent, d.child))
      .attr("stroke-width", (d) => Math.max(1.6, linkWidth(d) * 0.75))
      .attr("vector-effect", "non-scaling-stroke");
  }

  // history unfolds: the river is revealed left → right (or top → bottom) and styles pop in as their era arrives
  function entrance() {
    if (reduceMotion) return;
    const a = -SANKEY_W - 80, b = T_LEN + 120, big = 1e5;
    const rect = svg.select("#sweep rect");
    const tAt = (ms) => a + (b - a) * (ms / INTRO_MS);
    nodeSel.style("animation-delay", (s) => `${Math.round(((s.t - a) / (b - a)) * INTRO_MS)}ms`).classed("enter", true);
    gWorld.attr("clip-path", "url(#sweep)");
    const timer = d3.timer((ms) => {
      const done = ms >= INTRO_MS;
      introFront = done ? Infinity : tAt(ms);
      const len = Math.max(0, tAt(Math.min(ms, INTRO_MS)) - a);
      if (vertical) rect.attr("x", -big / 2).attr("width", big).attr("y", a).attr("height", len);
      else rect.attr("x", a).attr("width", len).attr("y", -big / 2).attr("height", big);
      if (done) {
        timer.stop();
        gWorld.attr("clip-path", null);
        setTimeout(() => nodeSel.classed("enter", false).style("animation-delay", null), 700);
      }
      update();
    });
  }

  function paint() {
    if (!nodeSel) return;
    nodeSel.attr("fill", (s) => srmColor(s.srm)).attr("stroke", (s) => famColor(s));
    update();
  }

  // the part of the stage not covered by the top bar, the axis, the trait bar or the panel
  function viewRect(home = false) {
    const top = topbar.getBoundingClientRect().bottom;
    const open = !home && panelState !== "closed";
    if (sidePanel()) {
      const x1 = open ? W - panel.offsetWidth - 16 : W;
      return { x0: 20, y0: top + 34, x1: x1 - 20, y1: H - 64 };
    }
    const ph = panel.offsetHeight;
    const peek = parseFloat(getComputedStyle(panel).getPropertyValue("--peek")) + $("sabProbe").offsetHeight;
    let bottom = open ? { peek, half: ph * 0.5, full: ph * 0.5 }[panelState] || 0 : 64;
    const y0 = top + (vertical ? 6 : 30);
    if (H - bottom - 8 - y0 < 160) bottom = Math.max(0, H - y0 - 168);
    return { x0: vertical ? 46 : 10, y0, x1: W - 10, y1: H - bottom - 8 };
  }
  // cached: read once per layout change, not on every zoom frame
  const refreshView = () => (view = viewRect());

  // fit a box (screen-space after zoom) into the view; remembers the request so it can be re-applied
  function fitBox(box, { dur = DUR, maxZ = 7, minZ = 0.9, alignStart = false, focusXY = null } = {}) {
    lastFit = () => fitBox(box, { dur: 0, maxZ, minZ, alignStart, focusXY });
    const v = { ...refreshView() };
    if (vertical && !alignStart) v.y0 += 36; // room for the pinned lane names
    const vw = v.x1 - v.x0, vh = v.y1 - v.y0;
    const bw = Math.max(1, box.x1 - box.x0), bh = Math.max(1, box.y1 - box.y0);
    let k = alignStart && vertical ? vw / bw : Math.min(vw / bw, vh / bh) * 0.94;
    const fits = k >= homeK * minZ;
    k = clamp(k, homeK * minZ, homeK * maxZ);
    let cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    if (!fits && focusXY) {
      // box too big at a legible zoom: keep the chosen style in view, as close to the box centre as allowed
      const hw = vw / 2 / k, hh = vh / 2 / k;
      cx = clamp(cx, focusXY[0] - hw * 0.5, focusXY[0] + hw * 0.5);
      cy = clamp(cy, focusXY[1] - hh * 0.5, focusXY[1] + hh * 0.5);
    }
    let tx = (v.x0 + v.x1) / 2 - k * cx, ty = (v.y0 + v.y1) / 2 - k * cy;
    // phones: a river taller than the screen starts at the top (scroll down through history); a shorter one is centred
    if (alignStart && vertical && k * bh + 22 > vh) ty = v.y0 + 22 - k * box.y0;
    const t = d3.zoomIdentity.translate(tx, ty).scale(k);
    if (dur === 0) svg.interrupt().call(zoom.transform, t);
    else svg.transition().duration(dur).ease(d3.easeCubicInOut).call(zoom.transform, t);
  }
  function refit() { if (lastFit) lastFit(); }
  function fitHome(dur = DUR) { fitBox(worldBox(), { dur, minZ: 0.5, maxZ: 3, alignStart: true }); }
  function boxOf(list, pad = 60) {
    const xy = list.map(nodeXY);
    return { x0: d3.min(xy, (p) => p[0]) - pad, x1: d3.max(xy, (p) => p[0]) + pad, y0: d3.min(xy, (p) => p[1]) - pad, y1: d3.max(xy, (p) => p[1]) + pad };
  }
  function fitStyles(list, dur = DUR, focus = null) {
    if (!list.length) return;
    fitBox(boxOf(list, list.length === 1 ? 220 : 70), { dur, maxZ: list.length === 1 ? 3 : 5, minZ: sidePanel() ? 0.65 : 1.5, focusXY: focus ? nodeXY(focus) : null });
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    svg.select("#goo").attr("x", 0).attr("y", 0).attr("width", W).attr("height", H);
    syncPanelChrome();
    const wasVertical = vertical;
    const top = topbar.getBoundingClientRect().bottom;
    vertical = W / Math.max(1, H - top) < 0.95;
    document.body.classList.toggle("river-vertical", vertical);
    $("keyIntro").textContent = vertical
      ? "Time flows down the page. Fermentation types at the top feed eight family streams; each dot is a style."
      : "Time flows left to right. Fermentation types feed eight family streams; each dot is a style.";
    // stretch the timeline to the screen's shape: wide screens get a long river that fills the width,
    // phones get one about two screens tall to scroll through
    const hv = viewRect(true), hvw = hv.x1 - hv.x0, hvh = hv.y1 - hv.y0;
    const want = vertical
      ? Math.max(2400, (hvh / hvw) * (L_LEN + 60) * 3 - SANKEY_W - 120)
      : clamp((hvw / hvh) * (L_LEN + 60) - SANKEY_W - 350, 1800, 5200);
    const kEst = (vertical ? hvw : hvh) / (L_LEN + 60);
    const wantC = clamp(12 / kEst, 19, 90);
    const relayout = Math.abs(want - T_LEN) / T_LEN > 0.06 || Math.abs(wantC - COLLIDE) / COLLIDE > 0.06;
    if (relayout) { T_LEN = want; COLLIDE = wantC; layoutRiver(); }
    if (relayout || vertical !== wasVertical || !drawn) { drawWorld(); drawn = true; }
    const v = viewRect(true), b = worldBox();
    homeK = vertical ? (v.x1 - v.x0) / (b.x1 - b.x0) : Math.min((v.x1 - v.x0) / (b.x1 - b.x0), (v.y1 - v.y0) / (b.y1 - b.y0));
    zoom.scaleExtent([homeK * 0.5, homeK * 14]).extent([[0, 0], [W, H]]);
    refreshView();
    document.documentElement.style.setProperty("--top-h", Math.round(top) + "px");
    if (lastFit) refit(); else fitHome(0);
  }

  const zoomFactor = () => clamp(Math.sqrt(transform.k / homeK), 0.8, 2.6);
  const nodeR = (s) => (4.6 + Math.sqrt(s.nDesc) * 0.7) * zoomFactor();
  const blobR = (s) => nodeR(s) + 14 * zoomFactor() ** 1.25; // grows faster than dots so regions stay merged when zoomed in

  function update() {
    if (!nodeSel) return;
    gWorld.attr("transform", transform);
    const z = zoomFactor();
    const v = view || refreshView();
    const pos = new Map();
    styles.forEach((s) => {
      const [x, y] = nodeXY(s);
      pos.set(s, [transform.applyX(x), transform.applyY(y)]);
    });
    nodeSel.attr("cx", (s) => pos.get(s)[0]).attr("cy", (s) => pos.get(s)[1]).attr("r", nodeR);
    if (blobSel) blobSel.attr("cx", (s) => pos.get(s)[0]).attr("cy", (s) => pos.get(s)[1]).attr("r", blobR);
    drawArrows(pos);

    const laneLabels = computeLaneLabels(v);
    const srcLabels = computeSourceLabels();
    const obstacles = laneLabels.filter((d) => d.show).map((d) => d.box).concat(srcLabels.map((d) => d.box));
    if (laneLabels.band) obstacles.push({ x0: -1e4, x1: 1e4, y0: laneLabels.band.y0, y1: laneLabels.band.y1 });
    placeLabels(pos, v, z, obstacles);
    drawOverlay(v, laneLabels, srcLabels);
  }

  // arrowheads where a traced (or hovered) line arrives at its child: lines always enter along the time axis
  function drawArrows(pos) {
    const data = selected && isStyle(selected) ? litLinks
      : hovered ? linkData.filter((l) => l.parent === hovered || l.child === hovered) : [];
    gArrows.selectAll("path").data(data).join("path")
      .attr("fill", (d) => ink(famColor(d.child)))
      .attr("d", (d) => {
        const [x, y] = pos.get(d.child), r = nodeR(d.child) + 1.5, a = 6, h = 3.6;
        return vertical ? `M${x},${y - r}l${-h},${-a}h${2 * h}z` : `M${x - r},${y}l${-a},${-h}v${2 * h}z`;
      });
  }

  // greedy, priority-ordered label placement: only labels that fit are shown
  function placeLabels(pos, v, z, obstacles = []) {
    const fs = clamp((vertical ? 11.5 : 12.5) * Math.sqrt(z), vertical ? 11.5 : 12.5, 15);
    const placed = obstacles.slice();
    const lit = litSet;
    const prio = (s) => (s === selected ? 1e6 : 0) + (lit && lit.has(s) ? 1e5 : 0) + (s === hovered || s === focused ? 2e5 : 0) + s.nDesc * 10 + (hasKids(s) ? 25 : 0) - s.labelW;
    const order = styles.slice().sort((a, b) => prio(b) - prio(a));
    const hit = (r) => placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
    // dots are obstacles too, so labels never cover another beer
    styles.forEach((s) => {
      const [x, y] = pos.get(s);
      if (x < v.x0 - 20 || x > v.x1 + 20 || y < v.y0 - 20 || y > v.y1 + 20) return;
      if (lit && !lit.has(s)) return;
      const r = nodeR(s);
      placed.push({ x0: x - r, x1: x + r, y0: y - r, y1: y + r });
    });
    const shown = new Map();
    for (const s of order) {
      const [x, y] = pos.get(s);
      if (x < v.x0 - 40 || x > v.x1 + 40 || y < v.y0 || y > v.y1 + 20) continue;
      if (s.t > introFront) continue; // entrance: labels arrive with their era
      if (lit && !lit.has(s)) continue; // when tracing a lineage, keep the noise down
      // overview: only name the hubs (styles that spawned others); zoom in to see every name
      if (!lit && s !== hovered && s !== focused && z < 1.45 && s.nDesc < 2) continue;
      const w = s.labelW * fs, r = nodeR(s), h = fs * 1.2;
      const right = { x: x + r + 4, y: y + fs * 0.35, a: "start", box: { x0: x + r + 2, x1: x + r + 6 + w, y0: y - h / 2, y1: y + h / 2 } };
      const left = { x: x - r - 4, y: y + fs * 0.35, a: "end", box: { x0: x - r - 6 - w, x1: x - r - 2, y0: y - h / 2, y1: y + h / 2 } };
      const cands = vertical ? [right, left]
        : [{ x, y: y - r - 4, a: "middle", box: { x0: x - w / 2 - 2, x1: x + w / 2 + 2, y0: y - r - 4 - fs, y1: y - r - 1 } },
           { x, y: y + r + fs + 1, a: "middle", box: { x0: x - w / 2 - 2, x1: x + w / 2 + 2, y0: y + r, y1: y + r + fs + 4 } },
           right, left];
      const fits = (c) => c.box.x0 >= v.x0 - 4 && c.box.x1 <= v.x1 + 4 && c.box.y0 >= v.y0 - 2;
      // the selected style is always named, even if that means overlapping a neighbour
      const c = cands.find((c) => fits(c) && !hit(c.box)) || (s === selected ? cands.find(fits) : null);
      if (!c) continue;
      placed.push(c.box);
      shown.set(s, c);
    }
    labelSel.each(function (s) {
      const c = shown.get(s);
      if (!c) { if (this.style.display !== "none") this.style.display = "none"; return; }
      this.style.display = "";
      this.setAttribute("x", c.x.toFixed(1));
      this.setAttribute("y", c.y.toFixed(1));
      this.setAttribute("text-anchor", c.a);
      this.setAttribute("font-size", fs.toFixed(1));
      this.classList.toggle("lit", !!(lit && lit.has(s)));
      this.classList.toggle("sel", s === selected);
    });
  }

  // lane names. Horizontal: above each stream, pinned to the left edge and to the top like section
  // headers. Vertical: across the top, in up to two staggered rows, on a frosted band once scrolled.
  function computeLaneLabels(v) {
    const fs = vertical ? 10.5 : 11, tracking = fs * (vertical ? 0.07 : 0.09); // matches the CSS
    measureCtx.font = `800 ${fs}px ${FONT_STACK}`;
    const out = lanes.map((ln) => {
      const name = vertical ? SHORT_NAMES[ln.f.data.id] || ln.f.data.name : ln.f.data.name;
      return { ln, name, w: measureCtx.measureText(name.toUpperCase()).width + name.length * tracking + 4, show: false };
    });
    if (vertical) {
      const ends = [-1e9];
      out.forEach((d) => {
        const real = transform.applyX(d.ln.mid);
        if (real < v.x0 - 8 || real > v.x1 + 8) return;
        d.x = clamp(real, v.x0 + d.w / 2, v.x1 - d.w / 2);
        d.row = ends.findIndex((e) => d.x - d.w / 2 > e + 6);
        d.show = d.row >= 0;
        if (d.show) ends[d.row] = d.x + d.w / 2;
      });
      const rows = 1 + d3.max(out, (d) => (d.show ? d.row : 0));
      const natural = transform.applyY(0) - 10, pinnedY = v.y0 + 1 + rows * 13;
      const base = Math.max(pinnedY, natural);
      out.forEach((d) => {
        if (!d.show) return;
        d.y = base - d.row * 13;
        d.box = { x0: d.x - d.w / 2, x1: d.x + d.w / 2, y0: d.y - 11, y1: d.y + 3 };
      });
      if (pinnedY >= natural) out.band = { y0: v.y0 - 8, y1: base + 6 };
    } else {
      out.forEach((d) => {
        const top = transform.applyY(d.ln.l0), bot = transform.applyY(d.ln.l1);
        d.x = Math.max(v.x0 + 6, transform.applyX(0) + 6);
        d.y = Math.min(Math.max(top - 6, v.y0 + 12), bot - 4);
        // a header lives in the gap above its stream; zoomed far out that gap is too thin to hold one
        d.show = d.y > v.y0 + 2 && d.y < v.y1 && LANE_GAP * transform.k >= 11;
      });
      // a header that would overlap the next one gives way (sticky-header push), or hides
      for (let i = out.length - 2; i >= 0; i--) {
        const d = out[i], next = out.slice(i + 1).find((n) => n.show);
        if (d.show && next && d.y > next.y - 14) { d.y = next.y - 14; d.show = d.y > v.y0 + 2 && d.y > transform.applyY(d.ln.l0) - 30; }
      }
      out.forEach((d) => { d.box = { x0: d.x - 2, x1: d.x + d.w, y0: d.y - 11, y1: d.y + 3 }; });
    }
    return out;
  }

  // fermentation sources: name + count beside each bar, nudged apart (with a leader) when bars are thin
  function computeSourceLabels() {
    measureCtx.font = `800 12px ${FONT_STACK}`;
    const list = FERMENTS.filter((f) => f.count).map((fm) => {
      const name = SHORT_FERM[fm.id];
      const w = measureCtx.measureText(`${name} ${fm.count}`).width + 6;
      const [bx, by] = P(-SANKEY_W, (fm.l0 + fm.l1) / 2);
      return { fm, name, w, bx: transform.applyX(bx), by: transform.applyY(by) };
    });
    const along = (d) => (vertical ? d.bx : d.by), size = (d) => (vertical ? d.w : 15);
    list.forEach((d) => { d.c = along(d); });
    for (let it = 0; it < 40; it++) {
      let moved = false;
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1], b = list[i], need = (size(a) + size(b)) / 2 + 6 - (b.c - a.c);
        if (need > 0.5) { a.c -= need / 2; b.c += need / 2; moved = true; }
      }
      if (!moved) break;
    }
    list.forEach((d) => {
      if (vertical) {
        d.x = d.c; d.y = d.by - 13;
        d.lead = Math.abs(d.c - d.bx) > 3 ? [d.c, d.y + 3, d.bx, d.by - 2] : null;
        d.box = { x0: d.x - d.w / 2, x1: d.x + d.w / 2, y0: d.y - 12, y1: d.y + 3 };
      } else {
        d.x = d.bx - 12; d.y = d.c + 4;
        d.lead = Math.abs(d.c - d.by) > 3 ? [d.x + 3, d.c, d.bx - 2, d.by] : null;
        d.box = { x0: d.x - d.w, x1: d.x, y0: d.y - 12, y1: d.y + 3 };
      }
    });
    return list;
  }

  // sticky time axis, lane names and sankey source names (screen space)
  function drawOverlay(v, laneLabels, srcLabels) {
    const ticks = TICKS.filter((y) => y >= tScale.domain()[0]);
    const tickData = ticks.map((y) => {
      const [wx, wy] = P(tScale(y), 0);
      return { y, label: y === TICKS[0] ? "Early" : String(y), s: vertical ? transform.applyY(wy) : transform.applyX(wx) };
    }).filter((d) => (vertical ? d.s > v.y0 - 2 && d.s < H : d.s > -40 && d.s < W + 40));
    // thin out labels that would collide
    let last = -1e9;
    const minGap = vertical ? 22 : 44;
    tickData.forEach((d) => { d.show = d.s - last >= minGap; if (d.show) last = d.s; });

    const axisPos = vertical ? v.x0 - 8 : v.y0 - 14;
    gOverlay.select("rect.axis-bg")
      .attr("x", 0).attr("y", vertical ? 0 : axisPos - 16)
      .attr("width", vertical ? v.x0 - 2 : W).attr("height", vertical ? H : 26);
    gOverlay.selectAll("text.tick").data(tickData.filter((d) => d.show), (d) => d.y).join("text")
      .attr("class", "tick")
      .attr("x", (d) => (vertical ? axisPos : d.s))
      .attr("y", (d) => (vertical ? d.s + 4 : axisPos))
      .attr("text-anchor", vertical ? "end" : "middle")
      .text((d) => d.label);

    const evData = EVENTS.map((e) => {
      const [wx, wy] = P(tScale(e.end ? (e.year + e.end) / 2 : e.year), 0);
      return { e, s: vertical ? transform.applyY(wy) : transform.applyX(wx) };
    }).filter((d) => (vertical ? d.s > v.y0 + 4 && d.s < v.y1 : d.s > v.x0 && d.s < v.x1));
    gOverlay.selectAll("g.event").data(evData, (d) => d.e.name).join((en) => {
      const g = en.append("g").attr("class", "event").attr("role", "img").attr("aria-label", (d) => `${d.e.year}: ${d.e.text}`);
      g.append("circle").attr("class", "hit").attr("r", 14);
      g.append("path").attr("class", "mark").attr("d", "M0,-4.5L4.5,0L0,4.5L-4.5,0Z");
      g.on("pointerenter", (ev, d) => { if (ev.pointerType === "mouse") showEvent(d.e, ev); })
        .on("pointerleave", () => { if (!eventPinned) tooltip.hidden = true; })
        .on("click", (ev, d) => { ev.stopPropagation(); eventPinned = true; showEvent(d.e, ev); });
      return g;
    })
      .attr("transform", (d) => (vertical ? `translate(${v.x0 - 2},${d.s})` : `translate(${d.s},${axisPos + 9})`));

    const band = laneLabels.band;
    gOverlay.select("rect.lane-bg").style("display", band ? null : "none")
      .attr("x", v.x0 - 4).attr("y", band ? band.y0 : 0).attr("width", W).attr("height", band ? band.y1 - band.y0 : 0);
    gOverlay.selectAll("text.lane").data(laneLabels.filter((d) => d.show), (d) => d.ln.f.uid).join("text")
      .attr("class", (d) => "lane" + (litSet && !d.ln.members.some((s) => litSet.has(s)) ? " dim" : ""))
      .attr("x", (d) => d.x).attr("y", (d) => d.y)
      .attr("text-anchor", vertical ? "middle" : "start")
      .attr("fill", (d) => ink(d.ln.f.color))
      .text((d) => d.name)
      .on("click", (ev, d) => { ev.stopPropagation(); hideIntro(); goTo(d.ln.f); });

    gOverlay.selectAll("line.lead").data(srcLabels.filter((d) => d.lead), (d) => d.fm.id).join("line")
      .attr("class", "lead")
      .attr("x1", (d) => d.lead[0]).attr("y1", (d) => d.lead[1]).attr("x2", (d) => d.lead[2]).attr("y2", (d) => d.lead[3])
      .attr("stroke", (d) => d.fm.color);
    gOverlay.selectAll("text.src").data(srcLabels, (d) => d.fm.id).join((e) => e.append("text").attr("class", "src")
      .call((t) => { t.append("tspan").attr("class", "nm"); t.append("tspan").attr("class", "n").attr("dx", 4); }))
      .attr("x", (d) => d.x).attr("y", (d) => d.y)
      .attr("text-anchor", vertical ? "middle" : "end")
      .attr("fill", (d) => ink(d.fm.color))
      .call((t) => {
        t.select(".nm").text((d) => d.name);
        t.select(".n").text((d) => d.fm.count);
      });
  }

  // ---------- trait blobs: joined only when the toggles change; zoom frames just move them ----------
  function drawBlobs() {
    const on = TRAITS.filter((t) => activeTraits.has(t.id));
    blobSel = gBlobs.selectAll("g.trait").data(on, (t) => t.id)
      .join((e) => e.append("g").attr("class", "trait").attr("filter", "url(#goo)").attr("fill", (t) => t.color))
      .selectAll("circle").data((t) => styles.filter((s) => s.traits.includes(t.id))).join("circle");
    if (!on.length) blobSel = null;
    renderTraitHint(on);
    update();
  }
  function renderTraitHint(on) {
    const el = $("traitHint");
    if (!on.length) { el.hidden = true; el.innerHTML = ""; return; }
    const dot = (t) => `<i style="--t:${t.color}"></i>`;
    if (on.length === 1) {
      const n = styles.filter((s) => s.traits.includes(on[0].id)).length;
      el.innerHTML = `${dot(on[0])}<span>Shaded: <b>${n}</b> ${esc(on[0].name.toLowerCase())} styles</span>`;
    } else {
      const both = styles.filter((s) => on.every((t) => s.traits.includes(t.id))).length;
      const what = on.length === 2 ? on.map((t) => esc(t.name)).join(" + ") : `all ${on.length}`;
      el.innerHTML = `<span class="venn">${on.slice(0, 3).map(dot).join("")}</span><span>Overlap = ${what} · <b>${both}</b> ${both === 1 ? "style" : "styles"}</span>`;
    }
    el.hidden = false;
  }

  // ---------- highlight ----------
  function setLit(set) {
    litSet = set && set.size ? set : null;
    litLinks = litSet ? linkData.filter((d) => litSet.has(d.parent) && litSet.has(d.child)) : [];
    nodeSel.classed("dim", (s) => !!litSet && !litSet.has(s)).classed("selected", (s) => s === selected);
    linkSel.classed("dim", (d) => !!litSet && !litLinks.includes(d)).classed("lit", (d) => litLinks.includes(d));
    linkSel.filter((d) => litLinks.includes(d)).raise();
    gBands.selectAll("path").classed("dim", (ln) => !!litSet && !ln.members.some((s) => litSet.has(s)));
    gBlobs.classed("muted", !!litSet);
    nodeSel.attr("tabindex", (s) => (isTabStop(s) ? 0 : -1));
    drawFlow();
    update();
  }
  // Tab visits the lit lineage when one is traced, otherwise the roots and hubs of the river
  const isTabStop = (s) => (litSet ? litSet.has(s) : s.parentLinks.length === 0 || s.nDesc >= 3);
  const lineageOf = (s) => new Set([s, ...s.ancestorSet, ...s.descendantSet]);

  function renderCrumbs(d) {
    const path = d ? d.ancestors().reverse() : [root];
    crumbsList.innerHTML = path.map((n, i) => {
      const cur = i === path.length - 1;
      return `<li><button type="button" data-id="${esc(n.uid)}"${cur ? ' aria-current="page"' : ""}>${esc(n.depth === 0 ? "All beer" : n.data.name)}</button>${
        cur && n.depth === 0 ? `<span class="count">· ${plural(styles.length, "style")}</span>` : ""}</li>`;
    }).join("");
    crumbsList.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      const n = byId.get(b.dataset.id);
      if (n.depth === 0) { closePanel(false); fitHome(); } else goTo(n);
    }));
    crumbsNav.scrollLeft = crumbsNav.scrollWidth;
    const fam = d ? famOf(d) : null;
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

  // ---------- interaction ----------
  function activate(d, fromKeyboard) {
    hideIntro();
    goTo(d, true, fromKeyboard);
  }

  function goTo(d, animate = true, focusPanel = false) {
    const dur = animate ? DUR : 0;
    if (isStyle(d)) {
      select(d, "half", focusPanel);
      // a side panel leaves room for the whole lineage; above a bottom sheet, frame the style with its
      // parents and children, and the rest of the lit lineage is a pan away
      const near = [d, ...d.parentLinks.map((p) => p.node), ...d.kids.map((k) => k.node)];
      fitStyles(sidePanel() ? [...lineageOf(d)] : near, dur, d);
    } else {
      select(d, "peek", focusPanel);
      fitStyles(styles.filter((s) => s.ancestors().includes(d)), dur);
    }
  }

  let eventPinned = false;
  function showEvent(e, ev) {
    tooltip.innerHTML = `<b>${e.end ? `${e.year}–${e.end}` : e.year} · ${esc(e.name)}</b><span>${esc(e.text)}</span>`;
    tooltip.hidden = false;
    moveTooltip(ev);
  }
  document.addEventListener("pointerdown", (ev) => {
    if (eventPinned && !(ev.target.closest && ev.target.closest("g.event"))) { eventPinned = false; tooltip.hidden = true; }
  });

  function setHover(d, e) {
    if (hovered) nodeSel.filter((n) => n === hovered).classed("hovered", false);
    hovered = d;
    linkSel.classed("hot", (l) => !!d && (l.parent === d || l.child === d));
    update();
    if (!d) { tooltip.hidden = true; return; }
    nodeSel.filter((n) => n === d).classed("hovered", true);
    const sub = [d.data.yearLabel || (d.year < 0 ? `${-d.year} BCE` : d.year), fmtRange(d.data.abv, "% ABV")].join(" · ");
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
    renderPanel(d, swapping);
    const keep = (panelState === "full" || panelState === "half") && state === "peek";
    openPanel(sidePanel() ? "full" : keep ? panelState : state);
    setLit(isStyle(d) ? lineageOf(d) : new Set(styles.filter((s) => s.ancestors().includes(d))));
    renderCrumbs(d);
    if (focusPanel) {
      const h = panelBody.querySelector("h2");
      if (h) h.focus({ preventScroll: true });
    }
    try { history.replaceState(null, "", "#" + encodeURIComponent(d.uid)); } catch { /* ignore */ }
  }

  // ---------- panel ----------
  // body classes the layout keys off: a side panel squeezes the top bar; a raised bottom sheet folds away
  // the family chips so the map keeps as much height as possible
  function syncPanelChrome() {
    const open = panelState !== "closed";
    document.body.classList.toggle("side-open", sidePanel() && open);
    document.body.classList.toggle("sheet-open", !sidePanel() && open);
    document.body.classList.toggle("sheet-up", !sidePanel() && (panelState === "half" || panelState === "full"));
  }
  function openPanel(state) {
    panelState = state;
    panel.dataset.state = state;
    panel.setAttribute("aria-hidden", "false");
    panel.inert = false;
    syncPanelChrome();
    refreshView();
  }
  function closePanel(rezoom = true) {
    if (panelState === "closed" && !selected) return;
    const hadFocus = panel.contains(document.activeElement);
    const prev = selected;
    panelState = "closed";
    panel.dataset.state = "closed";
    panel.setAttribute("aria-hidden", "true");
    panel.inert = true;
    selected = null;
    syncPanelChrome();
    refreshView();
    setLit(null);
    renderCrumbs(null);
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ }
    if (hadFocus) {
      const c = prev && nodeSel.filter((n) => n === prev).node();
      (c || searchInput).focus({ preventScroll: true });
    }
    if (rezoom) refit();
    if (finderEl && !finderEl.hidden) updateFinder();
  }
  $("panelClose").addEventListener("click", () => closePanel());
  panel.addEventListener("click", (e) => {
    if (panelState === "peek" && !e.target.closest("button, a")) { openPanel("half"); refit(); }
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
    const path = d.ancestors().reverse().slice(1, -1);
    const style = isStyle(d);
    const icon = style
      ? `<span class="glass" aria-hidden="true" style="background:linear-gradient(to bottom, ${srmColor(data.srm?.[0])}, ${srmColor(data.srm?.[1])})"></span>`
      : `<span class="fam-badge" aria-hidden="true" style="background:${fam.color}"></span>`;
    let h = `<div class="p-head">
      <nav class="p-eyebrow" aria-label="Breadcrumb"><span class="dot" style="background:${fam.color}"></span>${path.length
        ? path.map((a) => `<button type="button" class="crumb" data-id="${esc(a.uid)}">${esc(a.data.name)}</button>`).join('<span class="sep" aria-hidden="true">/</span>')
        : "<span>Beer family</span>"}</nav>
      <div class="p-title">${icon}<h2 tabindex="-1">${esc(data.name)}</h2></div>`;
    const tags = [];
    if (data.bjcp) tags.push(`BJCP ${esc(data.bjcp)}`);
    if (data.origin) tags.push(esc([data.origin.country, data.yearLabel || data.origin.era].filter(Boolean).join(" · ")));
    if (style && d.traits?.length) d.traits.forEach((id) => { const t = TRAITS.find((x) => x.id === id); tags.push(`<span class="tdot" style="background:${t.color}"></span>${esc(t.name)}`); });
    if (!style || hasKids(d)) tags.push(plural(countStyles(d), style ? "sub-style" : "style"));
    if (tags.length) h += `<div class="p-meta">${tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>`;
    h += `</div>`;
    if (data.description) h += `<p class="p-desc">${esc(data.description)}</p>`;
    if (style && Array.isArray(data.abv)) {
      const p = profileOf(d);
      h += `<section class="p-section"><h3>Flavour profile</h3><div class="fprofile">${PROFILE_KEYS.map((k) =>
        `<div class="frow"><span class="k">${PROFILE_LABELS[k]}</span><span class="fbar" role="img" aria-label="${PROFILE_LABELS[k]} ${p[k]} out of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= p[k] ? "on" : ""}"></i>`).join("")}</span></div>`).join("")}</div>`;
      if (data.notes) {
        h += `<dl class="tasting">${["aroma", "flavor", "mouthfeel"].filter((k) => data.notes[k]).map((k) =>
          `<div><dt>${k === "flavor" ? "Flavour" : k[0].toUpperCase() + k.slice(1)}</dt><dd>${esc(data.notes[k])}</dd></div>`).join("")}</dl>`;
      }
      if (data.tryIf) h += `<p class="tryif">🍺 Try it if ${esc(data.tryIf)}.</p>`;
      if (!data.profile) h += `<p class="p-foot">Profile estimated from the style's stats.</p>`;
      h += `</section>`;
    }

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

    if (style && (d.parentLinks?.length || d.kids?.length)) {
      const item = (l, dir) => {
        const n = l.node;
        let src = "";
        try { if (l.source) src = ` <a href="${esc(l.source)}" target="_blank" rel="noopener noreferrer">${esc(new URL(l.source).hostname.replace(/^www\./, ""))}</a>`; } catch { /* ignore */ }
        return `<li><button type="button" class="kid" data-id="${esc(n.uid)}"><span class="swatch" style="background:${srmColor(n.srm)}"></span>${esc(n.data.name)}<span class="yr">${esc(n.data.yearLabel || n.year)}</span></button>
          ${dir === "up" ? `<span class="kind ${esc(l.kind || "descended")}">${esc(l.kind || "descended")}</span>` : ""}${l.note && dir === "up" ? `<p class="lnote">${esc(l.note)}${src}</p>` : ""}</li>`;
      };
      h += `<section class="p-section"><h3>Family tree</h3>`;
      if (d.parentLinks.length) h += `<div class="lineage"><h4>Descended from</h4><ul>${d.parentLinks.map((l) => item(l, "up")).join("")}</ul></div>`;
      else h += `<p class="lnote">A root style: no documented parent style.</p>`;
      if (d.kids.length) h += `<div class="lineage"><h4>Led to</h4><ul class="led">${d.kids.slice().sort((a, b) => a.node.year - b.node.year).map((l) => item(l, "down")).join("")}</ul></div>`;
      h += `</section>`;
    }

    if (style) {
      const sim = similarTo(d, 4);
      if (sim.length) h += `<section class="p-section"><h3>Tastes similar</h3><div class="kids">${sim.map((n) =>
        `<button type="button" class="kid" data-id="${esc(n.uid)}"><span class="swatch" style="background:${srmColor(n.srm)}"></span>${esc(n.data.name)}</button>`).join("")}</div></section>`;
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
    panelBody.querySelectorAll(".kid, .crumb").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const n = byId.get(b.dataset.id);
      if (n) goTo(n, true, e.detail === 0);
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
      else { openPanel(target); if (target !== "full") refit(); }
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
    lanes.forEach((ln) => {
      const f = ln.f;
      const b = document.createElement("button");
      b.type = "button"; b.className = "fam-chip"; b.dataset.id = f.uid;
      b.style.setProperty("--fam", f.color);
      b.innerHTML = `<span class="dot" aria-hidden="true" style="background:${f.color}"></span>${esc(f.data.name)}`;
      b.addEventListener("click", () => {
        hideIntro();
        if (currentView === "list") { listFamily = listFamily === f ? null : f; syncFamilyChips(); renderList(); return; }
        if (selected === f) { closePanel(false); fitHome(); return; }
        goTo(f);
      });
      familiesNav.append(b);
    });
  }

  // ---------- traits (Venn overlay) ----------
  function buildTraits() {
    const nav = $("traits");
    nav.innerHTML = TRAITS.map((t) => {
      const n = styles.filter((s) => s.traits.includes(t.id)).length;
      return `<button type="button" class="trait-chip" data-id="${t.id}" aria-pressed="false" style="--t:${t.color}"><span class="dot" aria-hidden="true"></span>${esc(t.name)}<span class="n">${n}</span></button>`;
    }).join("");
    const tog = $("traitsBtn"), badge = tog.querySelector(".badge");
    nav.querySelectorAll(".trait-chip").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.id;
      if (activeTraits.has(id)) activeTraits.delete(id); else activeTraits.add(id);
      b.setAttribute("aria-pressed", activeTraits.has(id) ? "true" : "false");
      badge.hidden = !activeTraits.size; badge.textContent = activeTraits.size;
      hideIntro();
      drawBlobs();
    }));
    tog.addEventListener("click", () => {
      const open = !nav.classList.contains("open");
      nav.classList.toggle("open", open);
      tog.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) setFinder(false);
      hideIntro();
    });
  }

  // ---------- taste model: every style scored 0–1 on five things people actually choose by ----------
  const PROFILE_KEYS = ["malt", "hops", "bitterness", "fruit", "roast", "sour", "sweet", "body"];
  const PROFILE_LABELS = { malt: "Malt", hops: "Hop flavour", bitterness: "Bitterness", fruit: "Fruit", roast: "Roast", sour: "Sour", sweet: "Sweet", body: "Body" };
  // stats-based estimate, used only if a style has no researched profile
  function profileOf(s) {
    if (s.data.profile) return s.data.profile;
    const ibu = mid(s.data.ibu) || 0, srm = mid(s.data.srm) || 0, abv = mid(s.data.abv) || 0;
    const q = (v) => clamp(Math.round(v), 0, 5);
    return { malt: q(abv / 2), hops: q(ibu / 15), bitterness: q(ibu / 14), fruit: 2, roast: q((srm - 15) / 5),
      sour: s.traits.includes("sour") ? 4 : 0, sweet: q(abv / 3 - ibu / 40), body: q(abv / 2) };
  }
  const TASTES = [
    { id: "bitter", name: "Bitter", less: "Smooth", more: "Bitter", val: (s, p) => (clamp(mid(s.data.ibu) / 70, 0, 1) + p.bitterness / 5) / 2 },
    { id: "strong", name: "Strength", less: "Light", more: "Strong", val: (s) => clamp((mid(s.data.abv) - 3) / 8, 0, 1) },
    { id: "dark", name: "Colour & roast", less: "Pale", more: "Dark", val: (s, p) => (clamp(mid(s.data.srm) / 40, 0, 1) + p.roast / 5) / 2 },
    { id: "sour", name: "Sour", less: "Not sour", more: "Tart", val: (s, p) => p.sour / 5 },
    { id: "sweet", name: "Sweet & malty", less: "Dry", more: "Malty", val: (s, p) => (p.sweet / 5 + p.malt / 5) / 2 },
    { id: "fruit", name: "Fruity & hoppy", less: "Clean", more: "Fruity", val: (s, p) => (p.fruit / 5 + p.hops / 5) / 2 },
  ];
  const tasteTargets = {}; // id → 0..1 (unset = "don't mind")
  const nTargets = () => Object.keys(tasteTargets).length;
  function matchScore(s) {
    const on = TASTES.filter((t) => tasteTargets[t.id] != null);
    if (!on.length) return null;
    const p = profileOf(s);
    return 1 - d3.mean(on, (t) => Math.abs(t.val(s, p) - tasteTargets[t.id]));
  }
  const rankable = () => styles.filter((s) => Array.isArray(s.data.abv));
  function rankedMatches() {
    return rankable().map((s) => ({ s, m: matchScore(s) })).filter((r) => r.m != null).sort((a, b) => b.m - a.m);
  }
  // why a style matched: the user's set tastes it hits most closely, in plain words
  function whyMatch(s) {
    const p = profileOf(s);
    return TASTES.filter((t) => tasteTargets[t.id] != null)
      .map((t) => ({ t, v: t.val(s, p), e: Math.abs(t.val(s, p) - tasteTargets[t.id]) }))
      .sort((a, b) => a.e - b.e).slice(0, 3)
      .map(({ t, v }) => (v >= 0.6 ? t.more : v <= 0.4 ? t.less : `Medium ${t.name.toLowerCase()}`))
      .join(" · ");
  }
  const realBeer = (b) => b && !/histor|discontinu|retired|no longer/i.test(`${b.name} ${b.brewery || ""} ${b.note || ""}`);

  // ---------- beer test (taste sliders → styles → beers to try) ----------
  const PRESETS = [
    { id: "lager", name: "I like lagers", t: { bitter: 0.35, strong: 0.3, dark: 0.05, sour: 0, sweet: 0.2, fruit: 0.1 } },
    { id: "ipa", name: "I like IPAs", t: { bitter: 0.85, strong: 0.6, dark: 0.15, sour: 0, fruit: 0.8, sweet: 0.2 } },
    { id: "stout", name: "I like stouts", t: { bitter: 0.55, strong: 0.3, dark: 1, sour: 0, sweet: 0.4, fruit: 0.25 } },
    { id: "sour", name: "I like sours", t: { bitter: 0.1, dark: 0.15, sour: 1, fruit: 0.6 } },
    { id: "wheat", name: "Light & fruity", t: { bitter: 0.1, strong: 0.3, dark: 0.1, sour: 0, fruit: 0.7, sweet: 0.4 } },
  ];
  const finderEl = $("finder"), findBtn = $("findBtn");
  function buildFinder() {
    $("finderPresets").innerHTML = PRESETS.map((pr) => `<button type="button" class="preset" data-id="${pr.id}">${esc(pr.name)}</button>`).join("")
      + `<button type="button" class="preset" data-id="random">🎲 Surprise me</button>`;
    $("finderPrefs").innerHTML = TASTES.map((t) => `<div class="slider unset" data-id="${t.id}">
        <div class="slider-top"><label for="sl-${t.id}">${esc(t.name)}</label><span class="slider-val" aria-hidden="true">Don't mind</span>
          <button type="button" class="slider-x" aria-label="Don't mind ${esc(t.name.toLowerCase())}" hidden>×</button></div>
        <input type="range" id="sl-${t.id}" min="0" max="10" step="1" value="5" aria-valuetext="Don't mind">
        <div class="slider-ends" aria-hidden="true"><span>${esc(t.less)}</span><span>${esc(t.more)}</span></div>
      </div>`).join("");
    $("finderPrefs").querySelectorAll(".slider").forEach((row) => {
      const input = row.querySelector("input"), id = row.dataset.id;
      const set = () => { tasteTargets[id] = +input.value / 10; syncSlider(row); updateFinder(); };
      input.addEventListener("input", set);
      input.addEventListener("pointerdown", () => { if (tasteTargets[id] == null) requestAnimationFrame(set); });
      row.querySelector(".slider-x").addEventListener("click", () => { delete tasteTargets[id]; input.value = 5; syncSlider(row); updateFinder(); });
    });
    $("finderPresets").querySelectorAll(".preset").forEach((b) => b.addEventListener("click", () => {
      Object.keys(tasteTargets).forEach((k) => delete tasteTargets[k]);
      if (b.dataset.id === "random") {
        d3.shuffle(TASTES.slice()).slice(0, 3).forEach((t) => { tasteTargets[t.id] = Math.round(Math.random() * 10) / 10; });
        if (tasteTargets.sour == null) tasteTargets.sour = 0;
      } else Object.assign(tasteTargets, PRESETS.find((p) => p.id === b.dataset.id).t);
      syncAllSliders();
      updateFinder();
    }));
    findBtn.addEventListener("click", () => setFinder(finderEl.hidden));
    $("finderPeek").addEventListener("click", () => $("finderResults").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }));
    // hide the peek bar once the results themselves are on screen
    new IntersectionObserver(([e]) => finderEl.classList.toggle("results-visible", e.isIntersecting), { root: finderEl, threshold: 0.15 }).observe($("finderResults"));
    $("finderClose").addEventListener("click", () => setFinder(false));
    $("finderReset").addEventListener("click", () => {
      Object.keys(tasteTargets).forEach((k) => delete tasteTargets[k]);
      syncAllSliders();
      updateFinder();
    });
    $("finderAll").addEventListener("click", () => { setView("list"); $("listSort").value = "match"; renderList(); if (!sidePanel()) setFinder(false); });
  }
  function syncSlider(row) {
    const id = row.dataset.id, t = TASTES.find((x) => x.id === id), v = tasteTargets[id];
    const input = row.querySelector("input");
    row.classList.toggle("unset", v == null);
    row.querySelector(".slider-x").hidden = v == null;
    if (v != null) input.value = Math.round(v * 10);
    const word = v == null ? "Don't mind" : v >= 0.7 ? t.more : v <= 0.3 ? t.less : "In between";
    row.querySelector(".slider-val").textContent = word;
    input.setAttribute("aria-valuetext", v == null ? "Don't mind" : `${word}, ${Math.round(v * 10)} of 10`);
    input.style.setProperty("--pct", `${(v == null ? 0.5 : v) * 100}%`);
  }
  const syncAllSliders = () => $("finderPrefs").querySelectorAll(".slider").forEach(syncSlider);

  // remember a test result in the link: #test= one char per taste ('-' unset, 0–9, 'x' = 10)
  function testHash() {
    return "test=" + TASTES.map((t) => (tasteTargets[t.id] == null ? "-" : (v => (v === 10 ? "x" : String(v)))(Math.round(tasteTargets[t.id] * 10)))).join("");
  }
  function readTestHash(h) {
    const m = /^test=([-0-9x]{6})$/.exec(h || "");
    if (!m) return false;
    [...m[1]].forEach((c, i) => { if (c !== "-") tasteTargets[TASTES[i].id] = (c === "x" ? 10 : +c) / 10; });
    return true;
  }

  function setFinder(open) {
    finderEl.hidden = !open;
    findBtn.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("finder-open", open);
    if (open) {
      hideIntro();
      const tr = $("traits"); tr.classList.remove("open"); $("traitsBtn").setAttribute("aria-expanded", "false");
      if (!sidePanel() && panelState !== "closed") closePanel(false);
      syncAllSliders();
    } else if (/^#test=/.test(location.hash)) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ }
    }
    updateFinder(open);
  }
  function updateFinder(open = !finderEl.hidden) {
    const ranked = rankedMatches();
    const n = nTargets();
    const badge = $("findBadge"); badge.hidden = !n; badge.textContent = n;
    $("finderReset").hidden = !n;
    $("finderAll").hidden = !n;
    const res = $("finderResults");
    if (!n) {
      res.innerHTML = `<p class="finder-empty">Move any slider you have an opinion on, or tap a starting point above. Untouched sliders don't count.</p>`;
    } else {
      // top styles: specific styles (not umbrella groups), then the real beers they're best known for
      const top = ranked.filter((r) => !hasKids(r.s)).slice(0, 3);
      const beers = top.flatMap((r) => (r.s.data.topSellers || []).filter(realBeer).slice(0, 3).map((b) => ({ b, s: r.s })));
      res.innerHTML = `<h3>Your top styles</h3><ol class="finder-list">${top.map((r) => {
        const s = r.s;
        return `<li><button type="button" class="match" data-id="${esc(s.uid)}">
          <span class="glass-sm" style="background:linear-gradient(to bottom, ${srmColor(s.data.srm?.[0])}, ${srmColor(s.data.srm?.[1])})"></span>
          <span class="m-body"><b>${esc(s.data.name)}</b><small>${esc(whyMatch(s))} · ${esc(fmtRange(s.data.abv, "%"))}</small></span>
          <span class="m-pct">${Math.round(r.m * 100)}%</span></button></li>`;
      }).join("")}</ol>
      <h3>Beers to try</h3><ul class="beer-list">${beers.map(({ b, s }) => `<li><button type="button" class="beer" data-id="${esc(s.uid)}">
          <span class="dot" style="background:${srmColor(s.srm)}"></span>
          <span><b>${esc(b.name)}</b><small>${esc([b.brewery, b.country].filter(Boolean).join(" · "))} · ${esc(s.data.name)}</small></span></button></li>`).join("")}</ul>`;
    }
    const peek = $("finderPeek"), best = ranked.find((r) => !hasKids(r.s));
    peek.hidden = !n || !best;
    if (best) peek.innerHTML = `<span>Top match</span><b>${esc(best.s.data.name)}</b><span class="m-pct">${Math.round(best.m * 100)}%</span><span class="go">See beers ↓</span>`;
    res.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => {
      const d = byId.get(b.dataset.id);
      if (!sidePanel()) setFinder(false);
      goTo(d, true, false);
    }));
    if (open && n) { try { history.replaceState(null, "", "#" + testHash()); } catch { /* ignore */ } }
    // light up the matches on the river while the test is open
    if (open && n && !selected) setLit(new Set(ranked.slice(0, 20).map((r) => r.s)));
    else if (!selected) setLit(null);
    if (currentView === "list") renderList();
  }

  // ---------- list view ----------
  let currentView = "river";
  let listFamily = null;
  function setView(v) {
    currentView = v;
    document.body.classList.toggle("view-list", v === "list");
    $("viewRiver").setAttribute("aria-selected", v === "river" ? "true" : "false");
    $("viewList").setAttribute("aria-selected", v === "list" ? "true" : "false");
    $("listView").hidden = v !== "list";
    lsSet("beer-view", v);
    hideIntro();
    if (v === "list") { $("traits").classList.remove("open"); renderList(); }
    else { listFamily = null; syncFamilyChips(); requestAnimationFrame(() => { resize(); }); }
  }
  function syncFamilyChips() {
    familiesNav.querySelectorAll(".fam-chip").forEach((c) => c.setAttribute("aria-current", currentView === "list" && listFamily && c.dataset.id === listFamily.uid ? "true" : "false"));
  }
  const SORTS = {
    name: (a, b) => a.data.name.localeCompare(b.data.name),
    abv: (a, b) => mid(b.data.abv) - mid(a.data.abv),
    "abv-asc": (a, b) => mid(a.data.abv) - mid(b.data.abv),
    ibu: (a, b) => mid(b.data.ibu) - mid(a.data.ibu),
    srm: (a, b) => mid(b.data.srm) - mid(a.data.srm),
    "srm-asc": (a, b) => mid(a.data.srm) - mid(b.data.srm),
    year: (a, b) => a.year - b.year,
  };
  // the profile in three plain words, strongest first (e.g. "Roasty · Bitter · Full-bodied")
  const FLAVOR_WORDS = { malt: "Malty", hops: "Hoppy", bitterness: "Bitter", fruit: "Fruity", roast: "Roasty", sour: "Tart", sweet: "Sweet", body: "Full-bodied" };
  function flavorWords(p) {
    const words = PROFILE_KEYS.filter((k) => p[k] >= 3).sort((a, b) => p[b] - p[a]).slice(0, 3).map((k) => FLAVOR_WORDS[k]);
    if (words.length < 3 && p.body <= 1) words.push("Light-bodied");
    if (words.length < 3 && p.sweet <= 1 && p.sour < 3) words.push("Dry");
    if (words.length < 3 && p.bitterness <= 1 && p.sour < 3) words.push("Smooth");
    return words.slice(0, 3);
  }
  function flavorStrip(p) {
    return `<span class="fwords">${flavorWords(p).map((w) => `<span>${w}</span>`).join("")}</span>`;
  }
  function renderList() {
    if (currentView !== "list") return;
    const q = searchInput.value.trim().toLowerCase();
    let list = rankable();
    if (listFamily) list = list.filter((s) => famOf(s) === listFamily);
    if (q) list = list.filter((s) => [s.data.name, s.data.description, ...(s.data.topSellers || []).map((x) => x.name), ...(s.data.hops || [])]
      .some((x) => x && String(x).toLowerCase().includes(q)));
    const sortSel = $("listSort");
    const hasPrefs = nTargets() > 0;
    sortSel.querySelector('option[value="match"]').disabled = !hasPrefs;
    let key = sortSel.value;
    if (key === "match" && !hasPrefs) { key = "name"; sortSel.value = "name"; }
    const scores = new Map(list.map((s) => [s, matchScore(s)]));
    list.sort(key === "match" ? (a, b) => scores.get(b) - scores.get(a) : SORTS[key]);
    $("listCount").textContent = `${list.length} ${list.length === 1 ? "style" : "styles"}${listFamily ? ` in ${listFamily.data.name}` : ""}${q ? ` matching “${searchInput.value.trim()}”` : ""}`;
    $("listGrid").innerHTML = list.map((s) => {
      const fam = famOf(s), p = profileOf(s), top = s.data.topSellers?.[0];
      const m = scores.get(s);
      return `<button type="button" class="card" data-id="${esc(s.uid)}">
        <span class="card-top"><span class="glass-sm" style="background:linear-gradient(to bottom, ${srmColor(s.data.srm?.[0])}, ${srmColor(s.data.srm?.[1])})"></span>
          <span class="card-title"><b>${esc(s.data.name)}</b><small><i style="background:${fam.color}"></i>${esc(fam.data.name)}</small></span>
          ${m != null ? `<span class="m-pct">${Math.round(m * 100)}%</span>` : ""}</span>
        <span class="card-stats"><span>${esc(fmtRange(s.data.abv, "%"))} ABV</span><span>${esc(fmtRange(s.data.ibu))} IBU</span><span>${esc(VITALS.srm.word(mid(s.data.srm)))}</span></span>
        ${flavorStrip(p)}
        ${s.data.tryIf ? `<span class="card-try">Try it if ${esc(s.data.tryIf)}</span>` : `<span class="card-try">${esc(s.data.description || "")}</span>`}
        ${top ? `<span class="card-top-seller">Best seller: <b>${esc(top.name)}</b></span>` : ""}
      </button>`;
    }).join("") || `<p class="list-empty">No styles match. Try clearing the search or a filter.</p>`;
    $("listGrid").querySelectorAll(".card").forEach((c) => c.addEventListener("click", () => {
      const d = byId.get(c.dataset.id);
      select(d, "half", false);
    }));
  }
  $("viewRiver").addEventListener("click", () => setView("river"));
  $("viewList").addEventListener("click", () => setView("list"));
  $("listSort").addEventListener("change", renderList);

  // nearest styles by ABV / bitterness / colour (normalised), skipping umbrella styles and itself
  function similarTo(d, n) {
    const v = (s) => { const p = profileOf(s); return [mid(s.data.abv) / 12, mid(s.data.ibu) / 80, mid(s.data.srm) / 40, ...PROFILE_KEYS.map((k) => p[k] / 5 * 0.6)]; };
    const a = v(d);
    return styles.filter((s) => s !== d && !hasKids(s) && Array.isArray(s.data.abv))
      .map((s) => { const b = v(s); return { s, dist: Math.hypot(...a.map((x, i) => x - b[i])) }; })
      .sort((x, y) => x.dist - y.dist).slice(0, n).map((x) => x.s);
  }

  // ---------- stories: a friendly way in ----------
  function buildStories() {
    const el = $("stories");
    if (currentView === "list") return;
    const list = STORIES.filter((st) => byId.has(st.id));
    el.innerHTML = `<div class="stories-head"><span>Start with a story</span><button type="button" class="icon-btn stories-x" aria-label="Dismiss">×</button></div>
      <div class="stories-list">${list.map((st) => {
        const n = byId.get(st.id);
        return `<button type="button" class="story" data-id="${st.id}"><span class="sw" style="background:${srmColor(n.srm)}"></span><span><b>${esc(st.title)}</b><small>${esc(st.sub)}</small></span><span class="cnt">${n.nDesc + 1}</span></button>`;
      }).join("")}</div>
      <p class="stories-foot">${canHover ? "Or click any beer · scroll to zoom" : "Or tap any beer · pinch to zoom"}</p>`;
    el.querySelectorAll(".story").forEach((b) => b.addEventListener("click", () => { hideIntro(); goTo(byId.get(b.dataset.id), true, false); }));
    el.querySelector(".stories-x").addEventListener("click", hideIntro);
    el.hidden = false;
  }
  function hideIntro() {
    hint.classList.add("gone");
    const el = $("stories");
    if (el && !el.hidden) { el.classList.add("gone"); setTimeout(() => { el.hidden = true; }, 350); }
  }

  // ---------- random ----------
  $("randomBtn").addEventListener("click", (e) => {
    if (!styles) return;
    let d;
    do d = styles[Math.floor(Math.random() * styles.length)]; while (styles.length > 1 && d === selected);
    hideIntro();
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
    if (currentView === "list") { hideResults(); renderList(); return; }
    const q = searchInput.value.trim().toLowerCase();
    const qn = slug(q).replace(/-/g, " ");
    if (!q) { hideResults(); return; }
    results = [];
    for (const it of index) {
      let score = 0, via = "";
      const word = new RegExp("(^|[\\s(/-])" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (it.name.startsWith(q) || it.nameN.startsWith(qn) || word.test(it.name)) score = 100;
      else if (it.name.includes(q) || it.nameN.includes(qn)) score = 80;
      else {
        const si = it.sellers.findIndex((x) => x.toLowerCase().includes(q));
        if (si >= 0) {
          via = it.sellers[si];
          score = 60 - si * 2 + ({ high: 1.5, medium: 0.75 }[it.d.data.sellersConfidence] || 0);
        }
        else {
          const x = it.extra.find((x) => x && x.toLowerCase().includes(q));
          if (x && q.length >= 3) { score = 30; via = x; }
        }
      }
      if (score) results.push({ ...it, score: score - it.d.depth * 0.5 + (isStyle(it.d) ? 1 : 0), via });
    }
    results.sort((a, b) => b.score - a.score || a.d.data.name.length - b.d.data.name.length || a.d.data.name.localeCompare(b.d.data.name));
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
    hideIntro();
    goTo(r.d, true, fromKeyboard);
  }

  // ---------- key (a popover on phones, an inline row on desktop) ----------
  const keyBtn = $("keyBtn"), keyEl = $("key");
  const keyOpen = () => keyBtn.getAttribute("aria-expanded") === "true";
  function setKey(open) {
    keyBtn.setAttribute("aria-expanded", open ? "true" : "false");
    keyEl.classList.toggle("open", open);
    if (open) hideIntro();
  }
  keyBtn.addEventListener("click", () => setKey(!keyOpen()));
  document.addEventListener("pointerdown", (e) => { if (keyOpen() && !e.target.closest("#key, #keyBtn")) setKey(false); });

  // ---------- keyboard ----------
  document.addEventListener("keydown", (e) => {
    const typing = document.activeElement === searchInput;
    if (e.key === "Escape" && keyOpen()) { setKey(false); keyBtn.focus(); return; }
    if (e.key === "Escape" && !typing) {
      if (panelState !== "closed" || selected) closePanel();
      else fitHome();
    }
    if (e.key === "/" && !typing) { e.preventDefault(); searchInput.focus(); }
  });
})();
