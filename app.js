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
  const S = 1000; // pack layout size
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DUR = reduceMotion ? 0 : 750;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const isDesktop = () => window.matchMedia("(min-width: 900px)").matches;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const svg = d3.select("#chart");
  const stage = $("stage");
  const panel = $("panel");
  const panelBody = $("panelBody");
  const tooltip = $("tooltip");
  const crumbs = $("crumbs");
  const familiesNav = $("families");
  const searchInput = $("searchInput");
  const searchResults = $("searchResults");
  const hint = $("hint");

  // ---------- state ----------
  let root, nodes, byId = new Map();
  let W = 0, H = 0, fitK = 1;
  let transform = d3.zoomIdentity;
  let focus = null, selected = null, hovered = null;
  let panelState = "closed";
  let gZoom, gLabels, circleSel, labelSel;
  let zoom;

  // ---------- helpers ----------
  const isStyle = (d) => d.data.type === "style" || Array.isArray(d.data.abv);
  const hasKids = (d) => !!(d.children && d.children.length);
  const mid = (r) => (Array.isArray(r) ? (r[0] + r[1]) / 2 : null);
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
  const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  function luminance(hex) {
    const c = d3.rgb(hex);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

  // ---------- theme ----------
  const savedTheme = lsGet("beer-theme");
  if (savedTheme === "light" || savedTheme === "dark") document.documentElement.dataset.theme = savedTheme;
  $("themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    lsSet("beer-theme", next);
    paint();
  });
  const darkTheme = () => {
    const t = document.documentElement.dataset.theme;
    if (t) return t === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };

  // ---------- load ----------
  fetch("data/beers.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch((err) => { $("loading").textContent = "Couldn't load beer data (" + err.message + ")"; });

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
    });
    root.children.forEach((f, i) => { f.color = FAMILY_COLORS[f.data.id] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]; });
    root.color = "#999";
    nodes.forEach((d) => {
      d.srm = isStyle(d) ? mid(d.data.srm) : null;
      d.lines = wrapName(d.data.name);
    });

    buildChart();
    buildFamilies();
    buildSearch();
    $("loading").hidden = true;

    resize();
    window.addEventListener("resize", debounce(() => resize(true), 120));

    const startId = decodeURIComponent(location.hash.slice(1));
    if (startId && byId.has(startId)) goTo(byId.get(startId), false);
    else zoomTo(root, 0);
  }

  function wrapName(name) {
    const words = name.split(/\s+/);
    if (name.length <= 12 || words.length === 1) return [name];
    let best = [name], bestScore = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      const score = Math.max(a.length, b.length);
      if (score < bestScore) { bestScore = score; best = [a, b]; }
    }
    return best;
  }

  // ---------- chart ----------
  function buildChart() {
    const defs = svg.append("defs");
    gZoom = svg.append("g").attr("class", "zoom");
    gLabels = svg.append("g").attr("class", "labels");

    circleSel = gZoom.selectAll("circle")
      .data(nodes.filter((d) => d.depth > 0))
      .join("circle")
      .attr("class", (d) => (hasKids(d) ? "group" : "style-leaf") + (isStyle(d) ? " is-style" : ""))
      .attr("cx", (d) => d.x).attr("cy", (d) => d.y).attr("r", (d) => d.r)
      .attr("vector-effect", "non-scaling-stroke")
      .attr("tabindex", -1)
      .on("click", onCircleClick)
      .on("pointerenter", (e, d) => { if (canHover) setHover(d, e); })
      .on("pointermove", (e, d) => { if (canHover) moveTooltip(e); })
      .on("pointerleave", () => { if (canHover) setHover(null); });

    labelSel = gLabels.selectAll("text")
      .data(nodes.filter((d) => d.depth > 0))
      .join("text")
      .attr("class", (d) => (hasKids(d) ? "lbl-group" : "lbl-leaf"))
      .attr("text-anchor", "middle")
      .style("display", "none");
    labelSel.each(function (d) {
      const t = d3.select(this);
      d.lines.forEach((ln) => t.append("tspan").attr("class", "ln").text(ln));
      if (hasKids(d)) t.append("tspan").attr("class", "lbl-count").text(`${countStyles(d)} styles`);
    });

    paint();

    zoom = d3.zoom()
      .clickDistance(8)
      .on("start", () => { hint.classList.add("gone"); })
      .on("zoom", (e) => { transform = e.transform; update(); });
    svg.call(zoom).on("dblclick.zoom", null);
    svg.on("click", (e) => {
      if (e.target.closest && e.target.closest("circle")) return;
      if (panelState !== "closed" && !isDesktop()) { closePanel(); return; }
      zoomTo(focus && focus.parent ? focus.parent : root);
    });
    void defs;
  }

  function paint() {
    if (!circleSel) return;
    const dark = darkTheme();
    circleSel
      .attr("fill", (d) => {
        if (isStyle(d)) return srmColor(d.srm);
        return famColor(d);
      })
      .attr("fill-opacity", (d) => {
        if (isStyle(d)) return hasKids(d) ? 0.28 : 1;
        return dark ? 0.05 + d.depth * 0.035 : 0.08 + d.depth * 0.05;
      })
      .attr("stroke", (d) => {
        if (isStyle(d) && !hasKids(d)) return d3.color(srmColor(d.srm)).darker(dark ? 0.9 : 0.5).formatHex();
        return famColor(d);
      })
      .attr("stroke-opacity", (d) => (isStyle(d) && !hasKids(d) ? 0.9 : dark ? 0.5 : 0.6));

    labelSel.each(function (d) {
      const t = d3.select(this);
      if (isStyle(d) && !hasKids(d)) {
        const light = luminance(srmColor(d.srm)) > 0.28;
        t.style("fill", light ? "#2a1606" : "#fff4e4")
          .style("stroke", light ? "rgba(255,240,210,.55)" : "rgba(20,8,2,.55)");
      } else {
        t.style("fill", "var(--text)").style("stroke", "var(--halo)");
      }
    });
    t_update();
  }
  const t_update = () => { if (root && W) update(); };

  function viewRect() {
    const top = document.querySelector(".topbar").getBoundingClientRect();
    if (isDesktop()) {
      const x1 = panelState !== "closed" ? W - 432 : W;
      return { x0: 24, y0: 24, x1: x1 - 24, y1: H - 24 };
    }
    const ph = panel.offsetHeight;
    const bottom = { closed: 0, peek: 176, half: ph * 0.5, full: ph }[panelState] || 0;
    return { x0: 8, y0: top.bottom + 4, x1: W - 8, y1: H - bottom - 8 };
  }

  function targetTransform(d) {
    const v = viewRect();
    const vw = v.x1 - v.x0, vh = v.y1 - v.y0;
    const k = Math.min(vw, vh) / (2 * d.r) * (d === root ? 0.98 : 0.94);
    const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    return d3.zoomIdentity.translate(cx - k * d.x, cy - k * d.y).scale(k);
  }

  function zoomTo(d, dur = DUR) {
    if (!d) return;
    const t = targetTransform(d);
    focus = d;
    if (dur === 0) svg.call(zoom.transform, t);
    else svg.transition().duration(dur).ease(d3.easeCubicInOut).call(zoom.transform, t);
  }

  function resize(keep) {
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    fitK = Math.min(W, H) / S;
    zoom.scaleExtent([fitK * 0.5, fitK * 800])
      .extent([[0, 0], [W, H]]);
    if (keep && focus) zoomTo(focus, 0);
  }

  function screenR(d) { return d.r * transform.k; }

  function update() {
    gZoom.attr("transform", transform);
    const v = viewRect();
    const vmin = Math.min(v.x1 - v.x0, v.y1 - v.y0);
    const openT = vmin * 0.3;
    const opened = (d) => d.depth === 0 || (hasKids(d) && screenR(d) > openT);

    labelSel.each(function (d) {
      const s = screenR(d);
      const sx = transform.applyX(d.x), sy = transform.applyY(d.y);
      let show = s >= 16 && !opened(d) && opened(d.parent) &&
        sx + s > 0 && sx - s < W && sy + s > 0 && sy - s < H;
      const el = this;
      if (!show) { if (el.style.display !== "none") el.style.display = "none"; return; }
      const group = hasKids(d);
      const longest = d3.max(d.lines, (l) => l.length);
      let fs = group ? Math.min(20, Math.max(11, s / 5)) : Math.min(17, Math.max(10, s / 4.2));
      const maxW = s * 1.85;
      const estW = longest * fs * 0.56;
      if (estW > maxW) fs = fs * (maxW / estW);
      if (fs < 9) { el.style.display = "none"; return; }
      el.style.display = "";
      const lh = fs * 1.15;
      const showCount = group && s > 56;
      const nLines = d.lines.length + (showCount ? 1 : 0);
      const y0 = sy - ((nLines - 1) * lh) / 2 + fs * 0.35;
      el.setAttribute("font-size", fs.toFixed(1));
      el.setAttribute("stroke-width", Math.max(2, fs / 4).toFixed(1));
      const kids = el.childNodes;
      let li = 0;
      for (const tsp of kids) {
        if (tsp.classList.contains("lbl-count")) {
          tsp.style.display = showCount ? "" : "none";
          tsp.setAttribute("x", sx);
          tsp.setAttribute("y", y0 + li * lh);
          tsp.setAttribute("font-size", (fs * 0.72).toFixed(1));
        } else {
          tsp.setAttribute("x", sx);
          tsp.setAttribute("y", y0 + li * lh);
          li++;
        }
      }
    });

    // determine focus = deepest opened node containing view centre
    const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    let f = root;
    for (;;) {
      const next = (f.children || []).find((c) => {
        if (!opened(c)) return false;
        const dx = transform.applyX(c.x) - cx, dy = transform.applyY(c.y) - cy;
        return Math.hypot(dx, dy) < screenR(c);
      });
      if (!next) break;
      f = next;
    }
    if (f !== currentCrumb) renderCrumbs(f);
  }

  let currentCrumb = null;
  function renderCrumbs(f) {
    currentCrumb = f;
    if (!zoomAnimating()) focus = f;
    crumbs.innerHTML = "";
    const path = f.ancestors().reverse();
    path.forEach((d, i) => {
      if (i) { const s = document.createElement("span"); s.className = "sep"; s.textContent = "›"; s.setAttribute("aria-hidden", "true"); crumbs.append(s); }
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = d.depth === 0 ? "All beer" : d.data.name;
      if (i === path.length - 1) b.setAttribute("aria-current", "page");
      b.addEventListener("click", () => { zoomTo(d); if (d.depth > 0) select(d, "peek"); else closePanel(); });
      crumbs.append(b);
    });
    const fam = famOf(f);
    familiesNav.querySelectorAll(".fam-chip").forEach((c) => c.setAttribute("aria-current", fam && c.dataset.id === fam.uid ? "true" : "false"));
  }
  function zoomAnimating() { return d3.active(svg.node()) !== null; }

  // ---------- interaction ----------
  function onCircleClick(event, d) {
    event.stopPropagation();
    hint.classList.add("gone");
    if (hasKids(d)) {
      zoomTo(d);
      select(d, isStyle(d) ? "half" : "peek");
    } else {
      select(d, "half");
      if (focus !== d.parent) zoomTo(d.parent);
    }
  }

  function goTo(d, animate = true) {
    const target = hasKids(d) ? d : d.parent;
    const dur = animate ? DUR : 0;
    select(d, hasKids(d) && !isStyle(d) ? "peek" : "half");
    zoomTo(target, dur);
  }

  function setHover(d, e) {
    if (hovered) circleSel.filter((n) => n === hovered).classed("hovered", false);
    hovered = d;
    if (!d) { tooltip.hidden = true; return; }
    circleSel.filter((n) => n === d).classed("hovered", true);
    const sub = isStyle(d)
      ? `${fmtRange(d.data.abv, "% ABV")}${hasKids(d) ? ` · ${countStyles(d)} sub-styles` : ""}`
      : `${countStyles(d)} styles`;
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

  function select(d, state = "half") {
    selected = d;
    circleSel.classed("selected", (n) => n === d);
    renderPanel(d);
    openPanel(isDesktop() ? "full" : (panelState === "full" || panelState === "half") && state === "peek" ? panelState : state);
    try { history.replaceState(null, "", "#" + encodeURIComponent(d.uid)); } catch { /* ignore */ }
  }

  // ---------- panel ----------
  function openPanel(state) {
    const wasClosed = panelState === "closed";
    panelState = state;
    panel.dataset.state = state;
    panel.setAttribute("aria-hidden", "false");
    if (wasClosed && isDesktop() && focus) setTimeout(() => zoomTo(focus), 0);
  }
  function closePanel() {
    const wasOpen = panelState !== "closed";
    panelState = "closed";
    panel.dataset.state = "closed";
    panel.setAttribute("aria-hidden", "true");
    selected = null;
    circleSel.classed("selected", false);
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ }
    if (wasOpen && focus) zoomTo(focus);
  }
  $("panelClose").addEventListener("click", closePanel);
  panel.addEventListener("click", (e) => {
    if (panelState === "peek" && !e.target.closest("button, a")) openPanel("half");
  });

  function rangeBar(label, r, max, unit, cls = "") {
    if (!Array.isArray(r)) return "";
    const a = Math.min(r[0], max), b = Math.min(r[1], max);
    const left = (a / max) * 100, width = Math.max(2.5, ((b - a) / max) * 100);
    const inner = cls === "srm"
      ? `<div class="bar-wrap"><div class="bar srm"></div><i style="left:${left}%;width:${width}%;background:linear-gradient(to right, ${srmColor(r[0])}, ${srmColor(r[1])})"></i></div>`
      : `<div class="bar"><i style="left:${left}%;width:${width}%"></i></div>`;
    return `<div class="stat"><span class="k">${label}</span>${inner}<span class="v">${fmtRange(r, unit)}</span></div>`;
  }

  function renderPanel(d) {
    const data = d.data;
    const fam = famOf(d);
    const path = d.ancestors().reverse().slice(1, -1).map((a) => a.data.name);
    const style = isStyle(d);
    let h = `<div class="p-head">
      <div class="p-eyebrow"><span class="dot" style="background:${fam.color}"></span>${esc(path.length ? path.join(" / ") : "Beer family")}</div>
      <div class="p-title">${style ? `<span class="glass" aria-hidden="true" style="background:linear-gradient(to bottom, ${srmColor(data.srm?.[0])}, ${srmColor(data.srm?.[1])})"></span>` : ""}<h2>${esc(data.name)}</h2></div>
    </div>`;
    const tags = [];
    if (data.bjcp) tags.push(`BJCP ${esc(data.bjcp)}`);
    if (data.origin) tags.push(esc([data.origin.country, data.origin.era].filter(Boolean).join(" · ")));
    if (!style) tags.push(`${countStyles(d)} styles`);
    if (tags.length) h += `<div class="p-meta">${tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>`;
    if (data.description) h += `<p class="p-desc">${esc(data.description)}</p>`;

    if (style) {
      h += `<section class="p-section"><h3>Vital stats</h3><div class="stats">
        ${rangeBar("ABV", data.abv, 16, "%")}
        ${rangeBar("IBU", data.ibu, 120, "")}
        ${rangeBar("SRM", data.srm, 50, "", "srm")}
      </div></section>`;

      const chips = (arr) => `<div class="chips">${arr.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>`;
      let rows = "";
      if (data.malts?.length) rows += `<div class="recipe-row"><span class="k">Malts</span>${chips(data.malts)}</div>`;
      if (data.hops?.length) rows += `<div class="recipe-row"><span class="k">Hops</span>${chips(data.hops)}</div>`;
      if (data.yeast) rows += `<div class="recipe-row"><span class="k">Yeast</span><div class="yeast">${esc(data.yeast)}</div></div>`;
      if (data.adjuncts?.length) rows += `<div class="recipe-row"><span class="k">Adjuncts</span>${chips(data.adjuncts)}</div>`;
      if (rows) h += `<section class="p-section"><h3>General recipe</h3><div class="recipe">${rows}</div></section>`;

      if (data.topSellers?.length) {
        h += `<section class="p-section"><h3>Top sellers worldwide</h3><ol class="sellers">${data.topSellers.map((s, i) => `
          <li><span class="rank">${i + 1}</span><div><div class="s-name">${esc(s.name)}</div><div class="s-sub">${esc([s.brewery, s.country].filter(Boolean).join(" · "))}</div></div></li>`).join("")}
        </ol>`;
        const conf = { high: "Backed by published sales/volume data.", medium: "Among the most widely distributed examples; exact sales figures aren't published.", low: "Best-known commercial examples; niche style without public sales data." }[data.sellersConfidence];
        if (conf) h += `<p class="conf"><b>Confidence: ${esc(data.sellersConfidence)}.</b> ${conf}</p>`;
        h += `</section>`;
      }
    }

    if (hasKids(d)) {
      const kids = d.children.slice().sort((a, b) => a.data.name.localeCompare(b.data.name));
      h += `<section class="p-section"><h3>${style ? "Sub-styles" : "In this group"}</h3><div class="kids">${kids.map((k) =>
        `<button type="button" class="kid" data-id="${esc(k.uid)}"><span class="swatch" style="background:${isStyle(k) ? srmColor(k.srm) : k.color || famColor(k)}"></span>${esc(k.data.name)}</button>`).join("")}</div></section>`;
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
    panelBody.querySelectorAll(".kid").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const n = byId.get(b.dataset.id);
      if (n) goTo(n);
    }));
  }

  // bottom-sheet dragging (mobile)
  (() => {
    let startY = 0, startT = 0, lastY = 0, lastTime = 0, vel = 0, dragging = false, moved = false;
    const stateY = (st) => {
      const h = panel.offsetHeight;
      return { full: 0, half: h * 0.5, peek: h - 176, closed: h }[st];
    };
    panel.addEventListener("pointerdown", (e) => {
      if (isDesktop()) return;
      if (!e.target.closest(".sheet-handle, .p-head")) return;
      dragging = true; moved = false;
      startY = lastY = e.clientY; lastTime = e.timeStamp; vel = 0;
      startT = stateY(panelState);
      panel.classList.add("dragging");
      panel.setPointerCapture(e.pointerId);
    });
    panel.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 4) moved = true;
      const t = Math.max(0, startT + dy);
      panel.style.transform = `translateY(${t}px)`;
      const dt = e.timeStamp - lastTime;
      if (dt > 0) vel = (e.clientY - lastY) / dt;
      lastY = e.clientY; lastTime = e.timeStamp;
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove("dragging");
      panel.style.transform = "";
      if (!moved) return;
      const t = startT + (e.clientY - startY);
      const order = ["full", "half", "peek", "closed"];
      let target;
      if (Math.abs(vel) > 0.6) {
        const i = order.indexOf(panelState);
        target = order[Math.max(0, Math.min(order.length - 1, i + (vel > 0 ? 1 : -1)))];
      } else {
        target = order.reduce((best, st) => (Math.abs(stateY(st) - t) < Math.abs(stateY(best) - t) ? st : best), "full");
      }
      if (target === "closed") closePanel(); else { openPanel(target); if (focus) zoomTo(focus); }
      // swallow the click that follows a drag
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      panel.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => panel.removeEventListener("click", swallow, { capture: true }), 50);
    };
    panel.addEventListener("pointerup", end);
    panel.addEventListener("pointercancel", end);
  })();

  // ---------- families ----------
  function buildFamilies() {
    root.children.slice().sort((a, b) => Object.keys(FAMILY_COLORS).indexOf(a.data.id) - Object.keys(FAMILY_COLORS).indexOf(b.data.id))
      .forEach((f) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "fam-chip"; b.dataset.id = f.uid;
        b.style.setProperty("--fam", f.color);
        b.innerHTML = `<span class="dot" style="background:${f.color}"></span>${esc(f.data.name)}`;
        b.addEventListener("click", () => {
          if (focus === f) { zoomTo(root); closePanel(); return; }
          zoomTo(f); select(f, "peek");
        });
        familiesNav.append(b);
      });
  }

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
      else if (e.key === "Enter") { e.preventDefault(); if (results[activeIdx >= 0 ? activeIdx : 0]) choose(results[activeIdx >= 0 ? activeIdx : 0]); }
      else if (e.key === "Escape") { hideResults(); searchInput.blur(); }
    });
    document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".search")) hideResults(); });
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
      return `<li role="option" id="sr-${i}" data-i="${i}" aria-selected="false"><span class="swatch" style="background:${sw}"></span><div><div class="r-name">${esc(d.data.name)}</div><div class="r-path">${esc(r.via ? `via ${r.via} · ${path}` : path)}</div></div></li>`;
    }).join("") : `<li class="r-empty" aria-disabled="true">No matches</li>`;
    searchResults.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
    activeIdx = -1;
    searchResults.querySelectorAll("li[data-i]").forEach((li) => li.addEventListener("click", () => choose(results[+li.dataset.i])));
  }
  function setActive(i) {
    activeIdx = i;
    searchResults.querySelectorAll("li[data-i]").forEach((li) => li.setAttribute("aria-selected", +li.dataset.i === i ? "true" : "false"));
    const el = $("sr-" + i);
    if (el) { el.scrollIntoView({ block: "nearest" }); searchInput.setAttribute("aria-activedescendant", el.id); }
  }
  function hideResults() { searchResults.hidden = true; searchInput.setAttribute("aria-expanded", "false"); searchInput.removeAttribute("aria-activedescendant"); }
  function choose(r) {
    hideResults();
    searchInput.value = "";
    searchInput.blur();
    goTo(r.d);
  }

  // ---------- keyboard ----------
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.activeElement !== searchInput) {
      if (panelState !== "closed") closePanel();
      else if (focus && focus.parent) zoomTo(focus.parent);
    }
    if (e.key === "/" && document.activeElement !== searchInput) { e.preventDefault(); searchInput.focus(); }
  });

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
})();
