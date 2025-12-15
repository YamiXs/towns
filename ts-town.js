
/* TibiaSweden Town Pages (ts-town.js) */
(() => {
  const cfg = window.TS_TOWN_CONFIG || {};
  const townLabel = cfg.town || "Thais";
  const accountLabel = cfg.account || "Free Account";
  const kindLabel = cfg.kind || "Town";
  const wikiTownTitle = cfg.wikiTitle || townLabel;
  const wikiBase = (cfg.wikiBase || "https://tibia.fandom.com").replace(/\/$/,"");
  const api = `${wikiBase}/api.php`;

  // ADMIN: If you ever migrate away from TibiaWiki/Fandom, swap wikiBase + endpoints here.

  const root = document.getElementById("ts-town-root");
  if (!root) return;

  const el = (tag, attrs={}, html="") => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => {
      if (k === "class") n.className = v;
      else if (k === "style") n.setAttribute("style", v);
      else n.setAttribute(k, v);
    });
    if (html) n.innerHTML = html;
    return n;
  };

  const wikiPageUrl = (title) => `${wikiBase}/wiki/${encodeURIComponent(String(title).replace(/ /g,"_"))}`;

  const state = { tab: "summary", cache: new Map() };

  const app = el("div", { id: "ts-town-app" });

  // Header
  const header = el("div", { class:"ts-header" });
  const left = el("div");
  left.appendChild(el("h1", { class:"ts-title" }, `${townLabel}`));

  const badges = el("div", { class:"ts-badges" });
  badges.appendChild(el("span",{class:"ts-badge"}, `Account: <strong>${accountLabel}</strong>`));
  badges.appendChild(el("span",{class:"ts-badge"}, `Type: <strong>${kindLabel}</strong>`));
  badges.appendChild(el("span",{class:"ts-badge"}, `Source: <strong>TibiaWiki</strong>`));
  header.appendChild(left);
  header.appendChild(badges);

  // Tabs
  const tabBar = el("div", { class:"ts-actions" });
  const tabs = [
    { id:"summary", label:"Översikt" },
    { id:"npcs", label:"NPCs & Shops" },
    { id:"quests", label:"Quests" },
    { id:"guide", label:"Full Guide (Wiki)" },
    { id:"buildings", label:"Buildings/Houses" },
  ];

  const contentGrid = el("div", { class:"ts-grid" });
  const mainCard = el("div", { class:"ts-card" });
  const sideCard = el("div", { class:"ts-card" });

  const mainTitle = el("h2", {}, "Översikt");
  const mainBody = el("div");
  mainCard.appendChild(mainTitle);
  mainCard.appendChild(mainBody);

  const sideTitle = el("h2", {}, "Snabblänkar");
  const sideBody = el("div");
  sideCard.appendChild(sideTitle);
  sideCard.appendChild(sideBody);

  const setLoading = (node, msg="Hämtar data…") => {
    node.innerHTML = "";
    const wrap = el("div",{class:"ts-loading"});
    wrap.appendChild(el("span",{class:"ts-dot"}));
    wrap.appendChild(el("span",{}, msg));
    node.appendChild(wrap);
  };

  const setError = (node, msg, links=[]) => {
    node.innerHTML = "";
    const box = el("div",{class:"ts-note"});
    box.innerHTML = `<strong>Kan inte ladda innehåll just nu.</strong><div style="margin-top:6px">${msg}</div>`;
    if (links.length){
      const ul = el("ul");
      ul.style.margin = "8px 0 0 18px";
      links.forEach(l => {
        const li = el("li");
        li.appendChild(el("a",{href:l.href,target:"_blank",rel:"noopener"}, l.label));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    node.appendChild(box);
  };

  const absLink = (u) => {
    if (!u) return u;
    if (u.startsWith("//")) return "https:" + u;
    if (u.startsWith("/wiki/")) return wikiBase + u;
    if (u.startsWith("/")) return wikiBase + u;
    return u;
  };

  const sanitizeWikiHTML = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    doc.querySelectorAll("script, style, noscript").forEach(n => n.remove());
    doc.querySelectorAll(".mw-editsection, .reference, .toc, .comments, .wds-global-footer, .wds-global-navigation-wrapper").forEach(n => n.remove());

    doc.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href");
      a.setAttribute("href", absLink(href));
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });

    doc.querySelectorAll("img").forEach(img => {
      const src = img.getAttribute("src");
      if (src) img.setAttribute("src", absLink(src));
      img.setAttribute("loading", "lazy");
    });

    const content = doc.querySelector(".mw-parser-output") || doc.body;
    return content.innerHTML;
  };

  const fetchJson = async (url) => {
    const cached = state.cache.get(url);
    if (cached) return cached;
    const res = await fetch(url, { method:"GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.cache.set(url, data);
    return data;
  };

  const parsePage = async (pageTitle, opts={}) => {
    const p = new URLSearchParams();
    p.set("action","parse");
    p.set("format","json");
    p.set("origin","*");
    p.set("page", pageTitle);
    p.set("prop", opts.prop || "text");
    if (opts.section != null) p.set("section", String(opts.section));
    // ADMIN: formatversion=2 can be used, but keep json v1 for compatibility.
    return fetchJson(`${api}?${p.toString()}`);
  };

  const getSectionIndex = async (pageTitle, sectionName) => {
    const data = await parsePage(pageTitle, { prop:"sections" });
    const sections = data?.parse?.sections || [];
    const found = sections.find(s => (s.line || "").trim().toLowerCase() === sectionName.toLowerCase());
    return found ? found.index : null;
  };

  const renderWikiPage = async (node, pageTitle) => {
    setLoading(node, `Laddar: ${pageTitle}`);
    try{
      const data = await parsePage(pageTitle, { prop:"text" });
      const html = data?.parse?.text?.["*"];
      if (!html) throw new Error("No HTML returned.");
      node.innerHTML = `<div class="ts-wiki">${sanitizeWikiHTML(html)}</div>`;
    }catch(e){
      setError(node, "Kontrollera att sidan tillåter externa anrop, eller prova igen senare.", [
        { label:`Öppna ${pageTitle} på TibiaWiki`, href: wikiPageUrl(pageTitle) }
      ]);
    }
  };

  const renderWikiSection = async (node, pageTitle, sectionName) => {
    setLoading(node, `Laddar sektion: ${sectionName}`);
    try{
      const idx = await getSectionIndex(pageTitle, sectionName);
      if (idx == null){
        setError(node, `Hittade ingen sektion med namnet "${sectionName}" på ${pageTitle}.`, [
          { label:`Öppna ${pageTitle} på TibiaWiki`, href: wikiPageUrl(pageTitle) }
        ]);
        return;
      }
      const data = await parsePage(pageTitle, { prop:"text", section: idx });
      const html = data?.parse?.text?.["*"];
      if (!html) throw new Error("No HTML returned.");
      node.innerHTML = `<div class="ts-wiki">${sanitizeWikiHTML(html)}</div>`;
    }catch(e){
      setError(node, "Kunde inte ladda sektionen just nu.", [
        { label:`Öppna ${pageTitle} på TibiaWiki`, href: wikiPageUrl(pageTitle) }
      ]);
    }
  };

  const addNPCFilters = (host) => {
    const table = host.querySelector("table");
    if (!table) return;

    const controls = el("div",{class:"ts-card"});
    controls.style.marginBottom = "12px";
    controls.innerHTML = `
      <h2 style="margin:0 0 8px 0">Filter</h2>
      <input class="ts-input" id="tsNpcSearch" placeholder="Sök NPC (namn, jobb, plats)…">
      <div class="ts-actions" style="margin-top:8px">
        <button class="ts-btn ts-active" data-mode="all">Alla</button>
        <button class="ts-btn" data-mode="shops">Bara shopkeepers</button>
        <button class="ts-btn" data-mode="services">Bank/Boat/Carpet/Temple</button>
      </div>
      <div class="ts-small" style="margin-top:8px">
        Tips: “Bara shopkeepers” använder Buy/Sell-kolumnen (✓). För exakt shop-innehåll, öppna NPC:ns sida via länken.
      </div>
    `;
    host.prepend(controls);

    const rows = Array.from(table.querySelectorAll("tr")).slice(1);
    const search = controls.querySelector("#tsNpcSearch");
    const btns = Array.from(controls.querySelectorAll("button[data-mode]"));

    const setBtnActive = (mode) => {
      btns.forEach(b => b.classList.toggle("ts-active", b.dataset.mode===mode));
    };

    let mode = "all";
    const apply = () => {
      const q = (search.value || "").trim().toLowerCase();
      rows.forEach(r => {
        const tds = Array.from(r.querySelectorAll("td"));
        const text = r.textContent.toLowerCase();
        const buySell = (tds[2]?.textContent || "").includes("✓");
        const job = (tds[1]?.textContent || "").toLowerCase();
        const isService = /bank|ship|captain|carpet|temple|priest|post/i.test(job);

        const okQ = !q || text.includes(q);
        const okMode =
          mode==="all" ? true :
          mode==="shops" ? buySell :
          mode==="services" ? isService :
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

  const renderSummary = () => {
    mainTitle.textContent = "Översikt";
    mainBody.innerHTML = "";

    const intro = el("div",{class:"ts-card"});
    intro.innerHTML = `
      <h2>Snabbfakta</h2>
      <p>
        Den här sidan är byggd för att samla allt relevant för spelare: NPCs (inkl. shopkeepers), quests, och stadsguide.
        Detaljer laddas live från TibiaWiki för att hållas uppdaterade.
      </p>
      <div class="ts-divider"></div>
      <div class="ts-actions">
        <a class="ts-btn" href="${wikiPageUrl(wikiTownTitle)}" target="_blank" rel="noopener">Öppna stadens Wiki</a>
        <a class="ts-btn" href="${wikiPageUrl(`${wikiTownTitle}_NPCs`)}" target="_blank" rel="noopener">Öppna NPC-lista</a>
      </div>
      <div class="ts-small" style="margin-top:10px">
        Källa: TibiaWiki (CC BY-SA). Inbäddat innehåll kan variera beroende på vad som finns dokumenterat för staden.
      </div>
    `;
    mainBody.appendChild(intro);

    // Side quicklinks
    sideBody.innerHTML = `
      <div class="ts-small">
        <div><a href="${wikiPageUrl(wikiTownTitle)}" target="_blank" rel="noopener">Town article</a></div>
        <div><a href="${wikiPageUrl(`${wikiTownTitle}_NPCs`)}" target="_blank" rel="noopener">NPCs</a></div>
        <div><a href="${wikiPageUrl(`${wikiTownTitle}_Buildings`)}" target="_blank" rel="noopener">Buildings</a></div>
        <div><a href="${wikiBase}/wiki/Special:Search?query=${encodeURIComponent(wikiTownTitle + " Temple")}" target="_blank" rel="noopener">Temple (search)</a></div>
        <div><a href="${wikiBase}/wiki/Special:Search?query=${encodeURIComponent(wikiTownTitle + " Depot")}" target="_blank" rel="noopener">Depot (search)</a></div>
        <div><a href="${wikiBase}/wiki/Special:Search?query=${encodeURIComponent(wikiTownTitle + " Boat")}" target="_blank" rel="noopener">Boats (search)</a></div>
        <div><a href="${wikiBase}/wiki/Special:Search?query=${encodeURIComponent(wikiTownTitle + " Magic Carpet")}" target="_blank" rel="noopener">Magic Carpet (search)</a></div>
      </div>
    `;
  };

  const renderNPCs = async () => {
    mainTitle.textContent = "NPCs & Shops";
    mainBody.innerHTML = "";
    const wrap = el("div");
    mainBody.appendChild(wrap);

    const npcPage = `${wikiTownTitle}`.replace(/ /g,"_") + "_NPCs";
    await renderWikiPage(wrap, npcPage);

    // Add filters if table exists
    const wikiDiv = wrap.querySelector(".ts-wiki");
    if (wikiDiv) addNPCFilters(wikiDiv);

    sideBody.innerHTML = `
      <div class="ts-small">
        <div class="ts-note">
          <strong>Shops:</strong> “Bara shopkeepers” filtrerar fram NPCs som faktiskt handlar (✓).
          Klicka NPC-namn för full trade-lista (buy/sell).
        </div>
      </div>
    `;
  };

  const renderQuests = async () => {
    mainTitle.textContent = "Quests";
    mainBody.innerHTML = "";
    const wrap = el("div");
    mainBody.appendChild(wrap);

    // Prefer “Quests” section from the town article (often contains the quest table).
    await renderWikiSection(wrap, wikiTownTitle, "Quests");

    sideBody.innerHTML = `
      <div class="ts-small">
        <div class="ts-note">
          Om Quests-sektionen saknas för just den här sidan, öppna stadens fulla guide och sök på “Quest”.
        </div>
        <div style="margin-top:8px">
          <a href="${wikiPageUrl(wikiTownTitle)}" target="_blank" rel="noopener">Öppna Full Guide</a>
        </div>
      </div>
    `;
  };

  const renderGuide = async () => {
    mainTitle.textContent = "Full Guide (Wiki)";
    mainBody.innerHTML = "";
    const wrap = el("div");
    mainBody.appendChild(wrap);
    await renderWikiPage(wrap, wikiTownTitle);

    sideBody.innerHTML = `
      <div class="ts-small">
        <div class="ts-note">
          Den här fliken laddar hela town-artikeln (kan vara lång). Använd webbläsarens sök (Ctrl+F).
        </div>
      </div>
    `;
  };

  const renderBuildings = async () => {
    mainTitle.textContent = "Buildings/Houses";
    mainBody.innerHTML = "";
    const wrap = el("div");
    mainBody.appendChild(wrap);

    const bPage = `${wikiTownTitle}`.replace(/ /g,"_") + "_Buildings";
    await renderWikiPage(wrap, bPage);

    sideBody.innerHTML = `
      <div class="ts-small">
        <div class="ts-note">
          Buildings-sidor finns inte för alla towns. Vid tomt innehåll: använd snabblänken “Buildings” eller sök på husnamn.
        </div>
        <div style="margin-top:8px">
          <a href="${wikiPageUrl(bPage)}" target="_blank" rel="noopener">Öppna Buildings på TibiaWiki</a>
        </div>
      </div>
    `;
  };

  const render = async () => {
    // Tab buttons
    tabBar.innerHTML = "";
    tabs.forEach(t => {
      const b = el("button",{class:"ts-btn" + (state.tab===t.id ? " ts-active":""), type:"button"}, t.label);
      b.addEventListener("click", async () => {
        state.tab = t.id;
        render().catch(()=>{});
      });
      tabBar.appendChild(b);
    });

    // Main render
    if (state.tab === "summary") renderSummary();
    else if (state.tab === "npcs") await renderNPCs();
    else if (state.tab === "quests") await renderQuests();
    else if (state.tab === "guide") await renderGuide();
    else if (state.tab === "buildings") await renderBuildings();
    else renderSummary();
  };

  // Assemble
  app.appendChild(header);
  app.appendChild(tabBar);
  contentGrid.appendChild(mainCard);
  contentGrid.appendChild(sideCard);
  app.appendChild(contentGrid);

  // Footer attribution
  const foot = el("div",{class:"ts-small", style:"margin-top:10px"});
  foot.innerHTML = `Innehåll hämtas från <a href="${wikiBase}" target="_blank" rel="noopener">TibiaWiki</a> (CC BY-SA).`;
  app.appendChild(foot);

  root.innerHTML = "";
  root.appendChild(app);

  render().catch(()=>{});
})();

