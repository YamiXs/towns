/* ts-town.js (TibiaSweden Town Pages) */
(() => {
  "use strict";

  const DEFAULTS = {
    wikiBase: "https://tibia.fandom.com",
    enabledTabs: ["summary", "npcs", "quests", "buildings"], // requested default
    // Optional: extra cleanups inside embedded wiki HTML (player noise)
    removeSelectors: [".navbox", ".vertical-navbox", ".wikia-gallery", ".gallery", ".mw-collapsible", ".toc", ".reference", ".mw-editsection"],
    // Optional: strip toggles (if you ever want)
    strip: { images: false, tables: false, infobox: false }
  };

  const root = document.getElementById("ts-town-root");
  if (!root) return;

  // --- config merge: DEFAULTS <- dataset <- window.TS_TOWN_CONFIG
  const ds = root.dataset || {};
  const winCfg = window.TS_TOWN_CONFIG || {};

  const parseTabs = (val) => {
    if (!val) return null;
    return String(val).split(",").map(s => s.trim()).filter(Boolean);
  };

  const cfg = {
    ...DEFAULTS,
    ...{
      town: ds.town || undefined,
      wikiTitle: ds.wikititle || ds.wikiTitle || undefined,
      account: ds.account || undefined,
      kind: ds.kind || undefined,
      wikiBase: ds.wikibase || ds.wikiBase || undefined,
      enabledTabs: parseTabs(ds.tabs) || undefined
    },
    ...winCfg
  };

  cfg.town = cfg.town || cfg.wikiTitle || "Thais";
  cfg.wikiTitle = cfg.wikiTitle || cfg.town;
  cfg.wikiBase = String(cfg.wikiBase || DEFAULTS.wikiBase).replace(/\/$/, "");

  if (!Array.isArray(cfg.enabledTabs) || !cfg.enabledTabs.length) {
    cfg.enabledTabs = DEFAULTS.enabledTabs.slice();
  }

  const api = `${cfg.wikiBase}/api.php`;
  const state = { tab: "summary", cache: new Map() };

  // --- helpers
  const el = (tag, attrs = {}, html = "") => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else n.setAttribute(k, v);
    }
    if (html) n.innerHTML = html;
    return n;
  };

  const wikiPageUrl = (title) =>
    `${cfg.wikiBase}/wiki/${encodeURIComponent(String(title).replace(/ /g, "_"))}`;

  const absLink = (u) => {
    if (!u) return u;
    if (u.startsWith("//")) return "https:" + u;
    if (u.startsWith("/wiki/")) return cfg.wikiBase + u;
    if (u.startsWith("/")) return cfg.wikiBase + u;
    return u;
  };

  const setLoading = (node, msg = "Hämtar data…") => {
    node.innerHTML = "";
    const wrap = el("div", { class: "ts-loading" });
    wrap.appendChild(el("span", { class: "ts-dot" }));
    wrap.appendChild(el("span", {}, msg));
    node.appendChild(wrap);
  };

  const setError = (node, msg, links = []) => {
    node.innerHTML = "";
    const box = el("div", { class: "ts-note" });
    box.innerHTML = `<strong>Kan inte ladda innehåll just nu.</strong><div style="margin-top:6px">${msg || ""}</div>`;
    if (links.length) {
      const ul = el("ul");
      ul.style.margin = "8px 0 0 18px";
      links.forEach((l) => {
        const li = el("li");
        li.appendChild(el("a", { href: l.href, target: "_blank", rel: "noopener" }, l.label));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    node.appendChild(box);
  };

  // --- JSON + JSONP fallback (for environments where fetch/CORS can be flaky)
  const fetchJsonp = (url) =>
    new Promise((resolve, reject) => {
      const cb = "tsjsonp_" + Math.random().toString(36).slice(2);
      window[cb] = (data) => {
        try {
          resolve(data);
        } finally {
          delete window[cb];
          script.remove();
        }
      };
      const script = document.createElement("script");
      script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      script.onerror = () => {
        delete window[cb];
        script.remove();
        reject(new Error("JSONP failed"));
      };
      document.head.appendChild(script);
    });

  const fetchJson = async (url) => {
    if (state.cache.has(url)) return state.cache.get(url);
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.cache.set(url, data);
      return data;
    } catch (e) {
      const data = await fetchJsonp(url);
      state.cache.set(url, data);
      return data;
    }
  };

  const parsePage = async (pageTitle, opts = {}) => {
    const p = new URLSearchParams();
    p.set("action", "parse");
    p.set("format", "json");
    p.set("origin", "*");
    p.set("page", pageTitle);
    p.set("prop", opts.prop || "text");
    if (opts.section != null) p.set("section", String(opts.section));
    return fetchJson(`${api}?${p.toString()}`);
  };

  const getSectionIndex = async (pageTitle, candidates = []) => {
    const data = await parsePage(pageTitle, { prop: "sections" });
    const sections = data?.parse?.sections || [];
    const lower = (s) => String(s || "").trim().toLowerCase();

    for (const c of candidates) {
      const target = lower(c);
      const found =
        sections.find((s) => lower(s.line) === target) ||
        sections.find((s) => lower(s.line).includes(target));
      if (found) return found.index;
    }
    return null;
  };

  // --- sanitize wiki HTML (fix links + images, remove clutter)
  const absolutizeSrcset = (srcset) => {
    if (!srcset) return srcset;
    return srcset
      .split(",")
      .map((part) => {
        const p = part.trim();
        if (!p) return "";
        const bits = p.split(/\s+/);
        const url = bits[0];
        const size = bits.slice(1).join(" ");
        return absLink(url) + (size ? " " + size : "");
      })
      .join(", ");
  };

  const sanitizeWikiHTML = (html) => {
    const strip = cfg.strip || {};
    const removeSelectors = (cfg.removeSelectors || []).filter(Boolean);

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    doc.querySelectorAll("script, style, noscript").forEach((n) => n.remove());

    // remove common noise (plus configurable selectors)
    if (removeSelectors.length) doc.querySelectorAll(removeSelectors.join(",")).forEach((n) => n.remove());

    if (strip.infobox) doc.querySelectorAll(".portable-infobox, .infobox").forEach((n) => n.remove());
    if (strip.tables) doc.querySelectorAll("table").forEach((n) => n.remove());
    if (strip.images) doc.querySelectorAll("img, figure").forEach((n) => n.remove());

    // fix anchors
    doc.querySelectorAll("a[href]").forEach((a) => {
      a.setAttribute("href", absLink(a.getAttribute("href")));
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });

    // fix images (Fandom uses data-src / data-srcset)
    doc.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      const dataSrc = img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("data-lazy-src");
      const dataSrcset = img.getAttribute("data-srcset");
      const srcset = img.getAttribute("srcset");

      if (dataSrc && (!src || src.startsWith("data:") || src === "about:blank")) {
        img.setAttribute("src", absLink(dataSrc));
      } else if (src) {
        img.setAttribute("src", absLink(src));
      }

      const useSrcset = dataSrcset || srcset;
      if (useSrcset) img.setAttribute("srcset", absolutizeSrcset(useSrcset));

      img.removeAttribute("data-src");
      img.removeAttribute("data-srcset");
      img.setAttribute("loading", "lazy");
      img.setAttribute("referrerpolicy", "no-referrer");
    });

    const content = doc.querySelector(".mw-parser-output") || doc.body;
    return content.innerHTML;
  };

  // --- summary extraction (town info only; avoids dumping the whole article)
  const extractTownSummary = (fullHtml) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(fullHtml, "text/html");
    const content = doc.querySelector(".mw-parser-output");
    if (!content) return fullHtml;

    const out = document.createElement("div");

    // Infobox (useful for quick facts)
    const inf = doc.querySelector(".portable-infobox, .infobox");
    if (inf && !(cfg.strip && cfg.strip.infobox)) out.appendChild(inf.cloneNode(true));

    // Lead paragraphs (first meaningful 2–3 paragraphs before first h2)
    let leadCount = 0;
    for (const ch of Array.from(content.children)) {
      const tag = (ch.tagName || "").toLowerCase();
      if (tag === "h2") break;
      if (tag === "p") {
        const txt = (ch.textContent || "").trim();
        if (txt.length > 40) {
          out.appendChild(ch.cloneNode(true));
          leadCount++;
          if (leadCount >= 3) break;
        }
      }
    }

    // Include up to 2 “town info” sections, excluding noisy sections
    const exclude = /npc|quest|building|house|guildhall|hunting|hunting places|monsters|creatures|bestiary|loot|gallery|trivia|notes and references/i;

    let includedSections = 0;
    let current = null;

    for (const ch of Array.from(content.children)) {
      const tag = (ch.tagName || "").toLowerCase();
      if (tag === "h2") {
        const heading = (ch.textContent || "").trim();
        current = { heading, nodes: [ch.cloneNode(true)] };
        continue;
      }
      if (!current) continue;

      // Keep collecting until next h2 triggers a new section
      current.nodes.push(ch.cloneNode(true));

      // If next sibling is another h2 or end, decide whether to include
      const next = ch.nextElementSibling;
      if (!next || (next.tagName || "").toLowerCase() === "h2") {
        const heading = current.heading || "";
        const bodyText = current.nodes.map(n => (n.textContent || "")).join(" ").trim();

        const ok =
          heading &&
          !exclude.test(heading) &&
          bodyText.length > 180; // avoid tiny stubs

        if (ok) {
          current.nodes.forEach(n => out.appendChild(n));
          includedSections++;
        }
        current = null;

        if (includedSections >= 2) break;
      }
    }

    return out.innerHTML || fullHtml;
  };

  // --- render wiki helpers
  const renderWikiPage = async (node, pageTitle, { summaryMode = false } = {}) => {
    setLoading(node, `Laddar: ${pageTitle}`);
    try {
      const data = await parsePage(pageTitle, { prop: "text" });
      let html = data?.parse?.text?.["*"];
      if (!html) throw new Error("No HTML returned.");

      if (summaryMode) html = extractTownSummary(html);
      node.innerHTML = `<div class="ts-wiki">${sanitizeWikiHTML(html)}</div>`;
    } catch (e) {
      setError(node, "Prova igen senare eller öppna källan direkt.", [{ label: "Öppna på TibiaWiki", href: wikiPageUrl(pageTitle) }]);
    }
  };

  const renderWikiSectionCandidates = async (node, pageTitle, sectionCandidates = [], fallbackLinks = []) => {
    setLoading(node, "Laddar sektion…");
    try {
      const idx = await getSectionIndex(pageTitle, sectionCandidates);
      if (idx == null) {
        setError(
          node,
          `Hittade ingen passande sektion (${sectionCandidates.join(", ")}).`,
          fallbackLinks.length ? fallbackLinks : [{ label: "Öppna på TibiaWiki", href: wikiPageUrl(pageTitle) }]
        );
        return;
      }
      const data = await parsePage(pageTitle, { prop: "text", section: idx });
      const html = data?.parse?.text?.["*"];
      if (!html) throw new Error("No HTML returned.");
      node.innerHTML = `<div class="ts-wiki">${sanitizeWikiHTML(html)}</div>`;
    } catch (e) {
      setError(node, "Kunde inte ladda sektionen just nu.", fallbackLinks.length ? fallbackLinks : [{ label: "Öppna på TibiaWiki", href: wikiPageUrl(pageTitle) }]);
    }
  };

  // --- NPC filter UI (robust header index detection)
  const addNPCFilters = (wikiHost) => {
    const table = wikiHost.querySelector("table");
    if (!table) return;

    const controls = el("div", { class: "ts-card" });
    controls.style.marginBottom = "12px";
    controls.innerHTML = `
      <h2 style="margin:0 0 8px 0">Filter</h2>
      <input class="ts-input" id="tsNpcSearch" placeholder="Sök NPC (namn, jobb, plats)…">
      <div class="ts-actions" style="margin-top:8px">
        <button class="ts-btn ts-active" data-mode="all" type="button">Alla</button>
        <button class="ts-btn" data-mode="shops" type="button">Bara shopkeepers</button>
        <button class="ts-btn" data-mode="services" type="button">Bank/Boat/Carpet/Temple</button>
      </div>
      <div class="ts-small" style="margin-top:8px">
        Shops filtreras via kolumn för Buy/Sell (✓) om den finns. Klicka NPC-namn för full trade-lista.
      </div>
    `;
    wikiHost.prepend(controls);

    const headerRow = table.querySelector("tr");
    const headers = headerRow ? Array.from(headerRow.querySelectorAll("th")).map(th => (th.textContent || "").trim().toLowerCase()) : [];
    const idxBuySell = headers.findIndex(h => h.includes("buy") || h.includes("sell"));
    const idxJob = headers.findIndex(h => h.includes("job") || h.includes("occupation") || h.includes("function"));

    const rows = Array.from(table.querySelectorAll("tr")).slice(1);
    const search = controls.querySelector("#tsNpcSearch");
    const btns = Array.from(controls.querySelectorAll("button[data-mode]"));

    let mode = "all";
    const setBtnActive = (m) => btns.forEach(b => b.classList.toggle("ts-active", b.dataset.mode === m));
    const hasTick = (s) => /✓|✔|yes/i.test(String(s || ""));

    const apply = () => {
      const q = (search.value || "").trim().toLowerCase();

      rows.forEach(r => {
        const tds = Array.from(r.querySelectorAll("td"));
        const text = (r.textContent || "").toLowerCase();

        const buySellCell = idxBuySell >= 0 ? (tds[idxBuySell]?.textContent || "") : "";
        const jobCell = idxJob >= 0 ? (tds[idxJob]?.textContent || "") : (tds[1]?.textContent || "");

        const isShop = idxBuySell >= 0 ? hasTick(buySellCell) : /buy|sell|shop/i.test(jobCell);
        const isService = /bank|ship|captain|carpet|temple|priest|post/i.test(jobCell);

        const okQ = !q || text.includes(q);
        const okMode =
          mode === "all" ? true :
          mode === "shops" ? isShop :
          mode === "services" ? isService :
          true;

        r.style.display = (okQ && okMode) ? "" : "none";
      });
    };

    search.addEventListener("input", apply);
    btns.forEach(b => b.addEventListener("click", () => {
      mode = b.dataset.mode;
      setBtnActive(mode);
      apply();
    }));
  };

  // --- UI build
  const app = el("div", { id: "ts-town-app" });

  const header = el("div", { class: "ts-header" });
  const left = el("div");
  left.appendChild(el("h1", { class: "ts-title" }, cfg.town));

  const badges = el("div", { class: "ts-badges" });
  if (cfg.account) badges.appendChild(el("span", { class: "ts-badge" }, `Account: <strong>${cfg.account}</strong>`));
  if (cfg.kind) badges.appendChild(el("span", { class: "ts-badge" }, `Type: <strong>${cfg.kind}</strong>`));
  badges.appendChild(el("span", { class: "ts-badge" }, `Source: <strong>TibiaWiki</strong>`));

  header.appendChild(left);
  header.appendChild(badges);

  let tabs = [
    { id: "summary", label: "Översikt" },
    { id: "npcs", label: "NPCs" },
    { id: "quests", label: "Quests" },
    { id: "buildings", label: "Buildings/Houses" }
  ];

  // filter tabs by enabledTabs
  tabs = tabs.filter(t => cfg.enabledTabs.includes(t.id));
  if (!tabs.find(t => t.id === state.tab)) state.tab = tabs[0]?.id || "summary";

  const tabBar = el("div", { class: "ts-actions" });

  const grid = el("div", { class: "ts-grid" });
  const mainCard = el("div", { class: "ts-card" });
  const sideCard = el("div", { class: "ts-card" });

  const mainTitle = el("h2", {}, "Översikt");
  const mainBody = el("div");
  mainCard.appendChild(mainTitle);
  mainCard.appendChild(mainBody);

  const sideTitle = el("h2", {}, "Snabblänkar");
  const sideBody = el("div");
  sideCard.appendChild(sideTitle);
  sideCard.appendChild(sideBody);

  grid.appendChild(mainCard);
  grid.appendChild(sideCard);

  const setQuicklinks = (mode) => {
    const wTown = wikiPageUrl(cfg.wikiTitle);
    const wNPC = wikiPageUrl(`${cfg.wikiTitle.replace(/ /g, "_")}_NPCs`);
    const wBld = wikiPageUrl(`${cfg.wikiTitle.replace(/ /g, "_")}_Buildings`);

    const tips =
      mode === "summary" ? "Översikten visar infobox + introduktion + 1–2 relevanta sektioner (utan att dumpa hela sidan)." :
      mode === "npcs" ? "Använd filter för shopkeepers och services. Klicka NPC-namn för full trade-lista." :
      mode === "quests" ? "Om Quests saknas i artikeln, använd sök-länken." :
      mode === "buildings" ? "Buildings-sida finns inte för alla towns. Då visar vi fallback eller länkar vidare." :
      "";

    sideBody.innerHTML = `
      <div class="ts-small">
        <div class="ts-note">${tips}</div>
        <div style="margin-top:10px">
          <div><a href="${wTown}" target="_blank" rel="noopener">Open town on TibiaWiki</a></div>
          <div><a href="${wNPC}" target="_blank" rel="noopener">Open NPC list</a></div>
          <div><a href="${wBld}" target="_blank" rel="noopener">Open Buildings/Houses</a></div>
          <div><a href="${cfg.wikiBase}/wiki/Special:Search?query=${encodeURIComponent(cfg.wikiTitle + " Quest")}" target="_blank" rel="noopener">Search quests for this town</a></div>
        </div>
      </div>
    `;
  };

  const renderSummary = async () => {
    mainTitle.textContent = "Översikt";
    mainBody.innerHTML = "";
    setQuicklinks("summary");

    const intro = el("div", { class: "ts-card" });
    intro.innerHTML = `
      <h2>Town information</h2>
      <p>
        Sammanfattning med fokus på stadens kärninfo. För detaljer: använd flikarna NPCs/Quests/Buildings eller öppna källan.
      </p>
      <div class="ts-actions">
        <a class="ts-btn" href="${wikiPageUrl(cfg.wikiTitle)}" target="_blank" rel="noopener">Öppna på TibiaWiki</a>
      </div>
      <div class="ts-divider"></div>
      <div id="tsSummaryEmbed"></div>
    `;
    mainBody.appendChild(intro);

    const embed = intro.querySelector("#tsSummaryEmbed");
    await renderWikiPage(embed, cfg.wikiTitle, { summaryMode: true });
  };

  const renderNPCs = async () => {
    mainTitle.textContent = "NPCs";
    mainBody.innerHTML = "";
    setQuicklinks("npcs");

    const wrap = el("div");
    mainBody.appendChild(wrap);

    const npcPage = `${cfg.wikiTitle.replace(/ /g, "_")}_NPCs`;

    // Try NPC list page first; fallback to NPC section in town article
    await renderWikiPage(wrap, npcPage).catch(() => {});
    const wikiDiv = wrap.querySelector(".ts-wiki");

    if (wikiDiv && wikiDiv.querySelector("table")) {
      addNPCFilters(wikiDiv);
      return;
    }

    // Fallback: load NPC section from town article
    await renderWikiSectionCandidates(
      wrap,
      cfg.wikiTitle,
      ["NPCs", "NPC"],
      [
        { label: "Open town on TibiaWiki", href: wikiPageUrl(cfg.wikiTitle) },
        { label: "Search NPCs", href: `${cfg.wikiBase}/wiki/Special:Search?query=${encodeURIComponent(cfg.wikiTitle + " NPCs")}` }
      ]
    );

    const wikiDiv2 = wrap.querySelector(".ts-wiki");
    if (wikiDiv2 && wikiDiv2.querySelector("table")) addNPCFilters(wikiDiv2);
  };

  const renderQuests = async () => {
    mainTitle.textContent = "Quests";
    mainBody.innerHTML = "";
    setQuicklinks("quests");

    const wrap = el("div");
    mainBody.appendChild(wrap);

    await renderWikiSectionCandidates(
      wrap,
      cfg.wikiTitle,
      ["Quests", "Quest"],
      [
        { label: "Open town on TibiaWiki", href: wikiPageUrl(cfg.wikiTitle) },
        { label: "Search quests", href: `${cfg.wikiBase}/wiki/Special:Search?query=${encodeURIComponent(cfg.wikiTitle + " Quest")}` }
      ]
    );
  };

  const renderBuildings = async () => {
    mainTitle.textContent = "Buildings/Houses";
    mainBody.innerHTML = "";
    setQuicklinks("buildings");

    const wrap = el("div");
    mainBody.appendChild(wrap);

    const bPage = `${cfg.wikiTitle.replace(/ /g, "_")}_Buildings`;

    await renderWikiPage(wrap, bPage).catch(() => {});

    // If buildings page is empty/nonexistent, fallback to relevant section on town article
    const hasUseful =
      !!wrap.querySelector(".ts-wiki") &&
      (wrap.querySelector(".ts-wiki table") || (wrap.textContent || "").trim().length > 300);

    if (!hasUseful) {
      await renderWikiSectionCandidates(
        wrap,
        cfg.wikiTitle,
        ["Buildings", "Houses", "House", "Guildhalls", "Guildhall"],
        [
          { label: "Open Buildings page", href: wikiPageUrl(bPage) },
          { label: "Open town on TibiaWiki", href: wikiPageUrl(cfg.wikiTitle) }
        ]
      );
    }
  };

  const render = async () => {
    tabBar.innerHTML = "";
    tabs.forEach(t => {
      const b = el("button", { class: "ts-btn" + (state.tab === t.id ? " ts-active" : ""), type: "button" }, t.label);
      b.addEventListener("click", () => {
        state.tab = t.id;
        render().catch(() => {});
      });
      tabBar.appendChild(b);
    });

    if (state.tab === "summary") await renderSummary();
    else if (state.tab === "npcs") await renderNPCs();
    else if (state.tab === "quests") await renderQuests();
    else if (state.tab === "buildings") await renderBuildings();
    else await renderSummary();
  };

  // Build app shell
  app.appendChild(header);
  app.appendChild(tabBar);
  app.appendChild(grid);

  const foot = el("div", { class: "ts-small", style: "margin-top:10px" });
  foot.innerHTML = `Innehåll hämtas från <a href="${cfg.wikiBase}" target="_blank" rel="noopener">TibiaWiki</a> (CC BY-SA).`;
  app.appendChild(foot);

  // Replace root content with app
  root.innerHTML = "";
  root.appendChild(app);

  render().catch(() => {});
})();

