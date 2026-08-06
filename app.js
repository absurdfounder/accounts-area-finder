(function () {
  const data = window.ACCOUNTS_DATA || { years: [], accounts: [] };
  const lotsData = window.LOTS_DATA || { lots: [], seasonal: {} };
  const years = data.years;
  const accounts = data.accounts;
  const accountByCode = Object.fromEntries(accounts.map((account) => [account.partyCode, account]));
  const store = window.ContactsStore;
  const matcher = window.ContactMatcher;

  const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const WEEK_LABELS = {
    1: "Days 1–7",
    2: "Days 8–14",
    3: "Days 15–21",
    4: "Days 22–31",
  };

  const els = {
    search: document.getElementById("searchInput"),
    year: document.getElementById("yearFilter"),
    state: document.getElementById("stateFilter"),
    region: document.getElementById("regionFilter"),
    area: document.getElementById("areaFilter"),
    reset: document.getElementById("resetBtn"),
    clear: document.getElementById("clearFiltersBtn"),
    apply: document.getElementById("applyFiltersBtn"),
    openFilters: document.getElementById("openFiltersBtn"),
    closeFilters: document.getElementById("closeFiltersBtn"),
    filterSheet: document.getElementById("filterSheet"),
    filterBackdrop: document.getElementById("filterBackdrop"),
    filterCount: document.getElementById("filterCount"),
    activeChips: document.getElementById("activeChips"),
    yearPills: document.getElementById("yearPills"),
    hideEmpty: document.getElementById("hideEmptyToggle"),
    partyCount: document.getElementById("partyCount"),
    netTotal: document.getElementById("netTotal"),
    caseTotal: document.getElementById("caseTotal"),
    cards: document.getElementById("cardsView"),
    table: document.getElementById("tableView"),
    tableBody: document.getElementById("tableBody"),
    timeline: document.getElementById("timelineView"),
    callStrip: document.getElementById("callStrip"),
    callNowList: document.getElementById("callNowList"),
    upcomingList: document.getElementById("upcomingList"),
    callNowLabel: document.getElementById("callNowLabel"),
    empty: document.getElementById("emptyState"),
    viewButtons: Array.from(document.querySelectorAll("[data-view]")),
    connectGoogle: document.getElementById("connectGoogleBtn"),
    importContacts: document.getElementById("importContactsBtn"),
    openMatch: document.getElementById("openMatchBtn"),
    importFile: document.getElementById("importFileInput"),
    sessionLine: document.getElementById("sessionLine"),
    matchBackdrop: document.getElementById("matchBackdrop"),
    matchSheet: document.getElementById("matchSheet"),
    closeMatch: document.getElementById("closeMatchBtn"),
    matchSummary: document.getElementById("matchSummary"),
    matchList: document.getElementById("matchList"),
    matchEmpty: document.getElementById("matchEmpty"),
    refreshContacts: document.getElementById("refreshContactsBtn"),
    signOut: document.getElementById("signOutBtn"),
    toast: document.getElementById("toast"),
    partyBackdrop: document.getElementById("partyBackdrop"),
    partySheet: document.getElementById("partySheet"),
    closeParty: document.getElementById("closePartyBtn"),
    partySheetTitle: document.getElementById("partySheetTitle"),
    partySheetBody: document.getElementById("partySheetBody"),
  };

  const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  const money = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

  let currentView = "timeline";
  let toastTimer = null;
  let pickModeContactId = null;
  let didScrollToToday = false;

  function todayParts(date = new Date()) {
    const day = date.getDate();
    const week = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
    return { month: date.getMonth() + 1, week, day, year: date.getFullYear() };
  }

  function nextBuckets(month, week, count) {
    const out = [];
    let m = month;
    let w = week;
    for (let i = 0; i < count; i += 1) {
      w += 1;
      if (w > 4) {
        w = 1;
        m += 1;
        if (m > 12) m = 1;
      }
      out.push({ month: m, week: w });
    }
    return out;
  }

  function valueFor(account, year, key) {
    if (year === "all") {
      return years.reduce((sum, y) => sum + Number(account.years[y]?.[key] || 0), 0);
    }
    return account.years[year]?.[key] ?? null;
  }

  function formatAmount(value) {
    if (value === null || value === undefined || value === "") return "-";
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return number < 0 ? `-${money.format(Math.abs(number))}` : money.format(number);
  }

  function formatCases(value) {
    if (value === null || value === undefined || value === "") return "-";
    const number = Number(value);
    return Number.isFinite(number) ? nf.format(number) : "-";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function unique(items, getter) {
    return Array.from(new Set(items.map(getter).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  function setOptions(select, values, label) {
    const current = select.value;
    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = label;
    select.appendChild(all);
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.value = values.includes(current) ? current : "all";
  }

  function showToast(message, isError) {
    els.toast.hidden = false;
    els.toast.textContent = message;
    els.toast.classList.toggle("error", Boolean(isError));
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 3200);
  }

  function digitQuery(query) {
    const digits = store.normalizePhone(query.replace(/[^\d+]/g, ""));
    const rawDigits = String(query).replace(/\D/g, "");
    if (rawDigits.length >= 7) return digits || rawDigits;
    return "";
  }

  function setupFilters() {
    years.forEach((year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      els.year.appendChild(option);
    });

    const pillValues = [{ value: "all", label: "All" }, ...years.map((year) => ({ value: year, label: year.slice(2) }))];
    els.yearPills.innerHTML = pillValues
      .map((item) => `<button type="button" class="year-pill" data-year="${item.value}">${item.label}</button>`)
      .join("");
    els.yearPills.querySelectorAll("[data-year]").forEach((button) => {
      button.addEventListener("click", () => {
        els.year.value = button.dataset.year;
        render();
      });
    });

    setOptions(els.state, unique(accounts, (a) => a.state), "All states");
    updateDependentFilters();
  }

  function updateDependentFilters() {
    const state = els.state.value;
    const region = els.region.value;
    const area = els.area.value;
    const scopedByState = state === "all" ? accounts : accounts.filter((a) => a.state === state);
    const regions = unique(scopedByState, (a) => a.region);
    setOptions(els.region, regions, "All regions");
    if (region !== "all" && regions.includes(region)) {
      els.region.value = region;
    }
    const nextRegion = els.region.value;
    const scopedByRegion = nextRegion === "all" ? scopedByState : scopedByState.filter((a) => a.region === nextRegion);
    const areas = unique(scopedByRegion, (a) => a.areaGroup);
    setOptions(els.area, areas, "All area groups");
    if (area !== "all" && areas.includes(area)) {
      els.area.value = area;
    }
  }

  function matchesSearch(account, query) {
    if (!query) return true;
    const phone = digitQuery(query);
    if (phone) {
      const hit = matcher.findByPhone(phone, store.getContacts(), [account]);
      if (hit.accounts.length) return true;
    }
    const linked = store.contactForParty(account.partyCode);
    const haystack = [
      account.partyCode,
      account.partyName,
      account.state,
      account.region,
      account.areaGroup,
      account.rawArea,
      linked?.name,
      linked?.org,
      ...(linked?.phones || []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.toLowerCase());
  }

  function filteredAccounts() {
    const query = els.search.value.trim();
    const selectedYear = els.year.value;
    const phone = digitQuery(query);

    let rows = accounts
      .filter((account) => els.state.value === "all" || account.state === els.state.value)
      .filter((account) => els.region.value === "all" || account.region === els.region.value)
      .filter((account) => els.area.value === "all" || account.areaGroup === els.area.value)
      .filter((account) => matchesSearch(account, query))
      .filter((account) => {
        if (!els.hideEmpty.checked || selectedYear === "all") return true;
        const value = account.years[selectedYear]?.netAmount;
        return value !== null && value !== undefined;
      });

    if (phone) {
      const byPhone = matcher.findByPhone(phone, store.getContacts(), accounts).accounts;
      const codes = new Set(byPhone.map((a) => a.partyCode));
      if (codes.size) {
        rows = rows.filter((account) => codes.has(account.partyCode));
      }
    }

    return rows.sort((a, b) => (
      a.state.localeCompare(b.state) ||
      a.region.localeCompare(b.region) ||
      a.areaGroup.localeCompare(b.areaGroup) ||
      a.rawArea.localeCompare(b.rawArea) ||
      a.partyName.localeCompare(b.partyName)
    ));
  }

  function lotMatchesYearFilter(lot) {
    const selected = els.year.value;
    if (selected === "all") return true;
    const source = String(lot.source || "");
    if (source.includes(selected)) return true;
    // Fiscal-year style evidence: Jul–Dec of start year, Jan–Mar of end year
    const [startYear, endYear] = selected.split("-").map((part) => Number(part));
    if (!startYear || !endYear) return true;
    if (lot.year === startYear && lot.month >= 4) return true;
    if (lot.year === endYear && lot.month <= 3) return true;
    return false;
  }

  function filteredLots() {
    const allowed = new Set(filteredAccounts().map((account) => account.partyCode));
    return (lotsData.lots || []).filter((lot) => allowed.has(lot.partyCode) && lotMatchesYearFilter(lot));
  }

  function buildSeasonalFromLots(lots) {
    const buckets = {};
    lots.forEach((lot) => {
      const key = `${lot.month}-${lot.week}`;
      const bucket = buckets[key] || (buckets[key] = {});
      const entry =
        bucket[lot.partyCode] ||
        (bucket[lot.partyCode] = {
          partyCode: lot.partyCode,
          years: new Set(),
          lotCount: 0,
          totalCases: 0,
          dates: [],
        });
      entry.years.add(lot.year);
      entry.lotCount += 1;
      entry.totalCases += Number(lot.cases || 0);
      entry.dates.push(lot.date);
    });

    const out = {};
    Object.entries(buckets).forEach(([key, parties]) => {
      out[key] = Object.values(parties)
        .map((entry) => ({
          partyCode: entry.partyCode,
          years: Array.from(entry.years).sort((a, b) => a - b),
          lotCount: entry.lotCount,
          totalCases: entry.totalCases,
          dates: Array.from(new Set(entry.dates)).sort(),
        }))
        .sort((a, b) => b.lotCount - a.lotCount || b.totalCases - a.totalCases || a.partyCode.localeCompare(b.partyCode));
    });
    return out;
  }

  function activeFilterItems() {
    const items = [];
    if (els.year.value !== "all") items.push(els.year.value);
    if (els.state.value !== "all") items.push(els.state.value);
    if (els.region.value !== "all") items.push(els.region.value);
    if (els.area.value !== "all") items.push(els.area.value);
    if (els.hideEmpty.checked) items.push("With selected year");
    return items;
  }

  function renderSessionLine() {
    const session = store.getSession();
    const contacts = store.getContacts();
    const links = store.getLinks();
    if (!session && !contacts.length) {
      els.sessionLine.hidden = true;
      els.sessionLine.textContent = "";
      els.connectGoogle.textContent = "Connect Google";
      return;
    }
    els.sessionLine.hidden = false;
    const source =
      session?.source === "google"
        ? session.email || "Google Contacts"
        : session?.fileName
          ? `Imported ${session.fileName}`
          : session?.source || "Contacts";
    els.sessionLine.textContent = `${contacts.length} contacts · ${Object.keys(links).length} linked · ${source}`;
    els.connectGoogle.textContent = session?.source === "google" ? "Reconnect" : "Connect Google";
  }

  function renderControls() {
    const activeItems = activeFilterItems();
    els.filterCount.hidden = activeItems.length === 0;
    els.filterCount.textContent = activeItems.length;
    els.openFilters.classList.toggle("active", activeItems.length > 0);
    els.activeChips.innerHTML = activeItems.map((item) => `<span class="active-chip">${escapeHtml(item)}</span>`).join("");
    els.yearPills.querySelectorAll("[data-year]").forEach((button) => {
      button.classList.toggle("active", button.dataset.year === els.year.value);
    });
    renderSessionLine();
  }

  function renderSummary(rows) {
    const selectedYear = els.year.value;
    const net = rows.reduce((sum, account) => sum + Number(valueFor(account, selectedYear, "netAmount") || 0), 0);
    const cases = rows.reduce((sum, account) => sum + Number(valueFor(account, selectedYear, "cases") || 0), 0);
    els.partyCount.textContent = nf.format(rows.length);
    els.netTotal.textContent = formatAmount(net);
    els.caseTotal.textContent = nf.format(cases);
  }

  function yearCell(account, year) {
    return `
      <div class="year-cell">
        <span>${year.slice(2)}</span>
        <strong>${formatAmount(account.years[year]?.netAmount)}</strong>
        <small>${formatCases(account.years[year]?.cases)} cases</small>
      </div>
    `;
  }

  function contactBlock(account) {
    const contact = store.contactForParty(account.partyCode);
    if (!contact) return "";
    const phone = contact.phones?.[0];
    const tel = phone ? `<a class="tel-link" href="tel:+91${escapeHtml(phone)}">${escapeHtml(phone)}</a>` : "";
    return `
      <div class="contact-link-row">
        <span class="contact-badge">Contact</span>
        <strong>${escapeHtml(contact.name)}</strong>
        ${tel}
      </div>
    `;
  }

  function shortYears(yearsList) {
    return (yearsList || []).map((year) => String(year).slice(2)).join(",");
  }

  function partyChip(entry, opts = {}) {
    const account = accountByCode[entry.partyCode];
    const name = account?.partyName || entry.partyCode;
    const contact = store.contactForParty(entry.partyCode);
    const phone = contact?.phones?.[0];
    const call = phone
      ? `<a class="chip-call" href="tel:+91${escapeHtml(phone)}" onclick="event.stopPropagation()">Call</a>`
      : "";
    const meta = opts.hideMeta
      ? ""
      : `<span class="chip-meta">×${entry.lotCount}${entry.years?.length ? ` · ${escapeHtml(shortYears(entry.years))}` : ""}</span>`;
    return `
      <button type="button" class="party-chip" data-party-code="${escapeHtml(entry.partyCode)}" data-month="${opts.month || ""}" data-week="${opts.week || ""}">
        <span class="chip-code">${escapeHtml(entry.partyCode)}</span>
        <span class="chip-name">${escapeHtml(name)}</span>
        ${meta}
        ${call}
      </button>
    `;
  }

  function bindPartyChips(root) {
    root.querySelectorAll(".party-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        openPartySheet(chip.dataset.partyCode, Number(chip.dataset.month) || null, Number(chip.dataset.week) || null);
      });
    });
  }

  function openPartySheet(partyCode, month, week) {
    const account = accountByCode[partyCode];
    const lots = filteredLots().filter((lot) => lot.partyCode === partyCode);
    const scoped = month && week ? lots.filter((lot) => lot.month === month && lot.week === week) : lots;
    const contact = store.contactForParty(partyCode);
    els.partySheetTitle.textContent = account?.partyName || partyCode;

    const byMonth = {};
    lots.forEach((lot) => {
      const key = `${MONTH_NAMES[lot.month - 1]} W${lot.week}`;
      byMonth[key] = (byMonth[key] || 0) + 1;
    });

    els.partySheetBody.innerHTML = `
      <p class="party-sheet-meta">
        <strong>${escapeHtml(partyCode)}</strong>
        ${account ? `· ${escapeHtml(account.areaGroup)} · ${escapeHtml(account.region)}` : ""}
      </p>
      ${contactBlock(account || { partyCode })}
      ${
        month && week
          ? `<p class="party-sheet-focus">In ${escapeHtml(MONTH_NAMES[month - 1])} week ${week}: <strong>${scoped.length}</strong> historical arrival${scoped.length === 1 ? "" : "s"}</p>`
          : ""
      }
      <div class="party-date-list">
        <h3>Arrival dates</h3>
        <ul>
          ${(scoped.length ? scoped : lots)
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((lot) => `<li><strong>${escapeHtml(lot.date)}</strong> · W${lot.week} · ${formatCases(lot.cases)} cases</li>`)
            .join("") || "<li>No lot dates in current filters.</li>"}
        </ul>
      </div>
      <div class="party-season-summary">
        <h3>Season pattern</h3>
        <p>${Object.entries(byMonth)
          .map(([label, count]) => `${escapeHtml(label)} ×${count}`)
          .join(" · ") || "No pattern yet."}</p>
      </div>
    `;
    openSheet(els.partyBackdrop, els.partySheet);
  }

  function closePartySheet() {
    closeSheetPair(els.partyBackdrop, els.partySheet);
  }

  function renderCallStrip(seasonal) {
    const today = todayParts();
    const nowKey = `${today.month}-${today.week}`;
    const nowEntries = seasonal[nowKey] || [];
    const upcoming = nextBuckets(today.month, today.week, 2).flatMap(({ month, week }) =>
      (seasonal[`${month}-${week}`] || []).map((entry) => ({ ...entry, month, week }))
    );

    // Dedupe upcoming against call-now
    const nowCodes = new Set(nowEntries.map((entry) => entry.partyCode));
    const upcomingUnique = [];
    const seen = new Set();
    upcoming.forEach((entry) => {
      if (nowCodes.has(entry.partyCode) || seen.has(entry.partyCode)) return;
      seen.add(entry.partyCode);
      upcomingUnique.push(entry);
    });

    els.callNowLabel.textContent = `${MONTH_NAMES[today.month - 1]} · Week ${today.week}`;
    els.callNowList.innerHTML = nowEntries.length
      ? nowEntries.slice(0, 24).map((entry) => partyChip(entry, { month: today.month, week: today.week })).join("")
      : `<p class="call-empty">No recurring farmers for this week in the current filters.</p>`;
    els.upcomingList.innerHTML = upcomingUnique.length
      ? upcomingUnique
          .slice(0, 24)
          .map((entry) => partyChip(entry, { month: entry.month, week: entry.week }))
          .join("")
      : `<p class="call-empty">No upcoming farmers in the next two weeks.</p>`;

    bindPartyChips(els.callNowList);
    bindPartyChips(els.upcomingList);
  }

  function renderTimeline() {
    const lots = filteredLots();
    const seasonal = buildSeasonalFromLots(lots);
    const today = todayParts();
    renderCallStrip(seasonal);

    const monthsHtml = MONTH_NAMES.map((name, index) => {
      const month = index + 1;
      const weeks = [1, 2, 3, 4]
        .map((week) => {
          const entries = seasonal[`${month}-${week}`] || [];
          const isToday = month === today.month && week === today.week;
          return `
            <div class="timeline-week${isToday ? " is-today" : ""}" id="${isToday ? "timelineToday" : ""}" data-month="${month}" data-week="${week}">
              ${isToday ? `<div class="today-marker"><span>Today · ${today.day} ${name}</span></div>` : ""}
              <div class="timeline-week-head">
                <strong>Week ${week}</strong>
                <span>${WEEK_LABELS[week]} · ${entries.length} farmers</span>
              </div>
              <div class="timeline-chip-row">
                ${
                  entries.length
                    ? entries.map((entry) => partyChip(entry, { month, week })).join("")
                    : `<span class="timeline-empty">No arrivals historically</span>`
                }
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <section class="timeline-month" data-month="${month}">
          <header class="timeline-month-head">
            <h2>${name}</h2>
            <span>Seasonal pattern across years</span>
          </header>
          ${weeks}
        </section>
      `;
    }).join("");

    els.timeline.innerHTML = monthsHtml;
    bindPartyChips(els.timeline);

    if (!didScrollToToday) {
      requestAnimationFrame(() => {
        const marker = document.getElementById("timelineToday");
        if (marker) marker.scrollIntoView({ block: "center", behavior: "smooth" });
        didScrollToToday = true;
      });
    }
  }

  function renderCards(rows) {
    const selectedYear = els.year.value;
    els.cards.innerHTML = rows
      .map((account) => {
        const focusAmount = valueFor(account, selectedYear, "netAmount");
        const focusCases = valueFor(account, selectedYear, "cases");
        const negative = Number(focusAmount) < 0 ? "negative" : "";
        const pickAttr = pickModeContactId ? ` data-pick-party="${escapeHtml(account.partyCode)}"` : "";
        return `
          <article class="account-card"${pickAttr}>
            <div class="card-main">
              <div class="card-topline">
                <span class="party-code">${escapeHtml(account.partyCode)}</span>
                <div class="amount-focus">
                  <strong class="${negative}">${formatAmount(focusAmount)}</strong>
                  <small>${formatCases(focusCases)} cases</small>
                </div>
              </div>
              <h2 class="party-name">${escapeHtml(account.partyName)}</h2>
              ${contactBlock(account)}
              <p class="area-stack">
                <strong>${escapeHtml(account.areaGroup)}</strong>
                <span>${escapeHtml(account.region)} · ${escapeHtml(account.state)}</span>
                <span>${escapeHtml(account.rawArea)}</span>
              </p>
            </div>
            <div class="year-grid">
              ${years.map((year) => yearCell(account, year)).join("")}
            </div>
          </article>
        `;
      })
      .join("");

    if (pickModeContactId) {
      els.cards.querySelectorAll("[data-pick-party]").forEach((card) => {
        card.classList.add("pickable");
        card.addEventListener("click", () => {
          store.confirmLink(pickModeContactId, card.dataset.pickParty);
          pickModeContactId = null;
          document.body.classList.remove("pick-mode");
          showToast("Contact linked to party");
          closeMatchSheet();
          render();
        });
      });
    }
  }

  function renderTable(rows) {
    els.tableBody.innerHTML = rows
      .map((account) => {
        const yearColumns = years
          .map((year) => {
            const net = account.years[year]?.netAmount;
            const negative = Number(net) < 0 ? " negative" : "";
            return `<td class="money${negative}">${formatAmount(net)}<br /><small>${formatCases(account.years[year]?.cases)} cases</small></td>`;
          })
          .join("");
        const contact = store.contactForParty(account.partyCode);
        const contactHtml = contact
          ? `<br /><small class="contact-inline">${escapeHtml(contact.name)}${contact.phones?.[0] ? ` · ${escapeHtml(contact.phones[0])}` : ""}</small>`
          : "";
        return `
          <tr>
            <td><strong>${escapeHtml(account.partyCode)}</strong><br />${escapeHtml(account.partyName)}${contactHtml}</td>
            <td>${escapeHtml(account.state)}<br />${escapeHtml(account.region)}<br /><strong>${escapeHtml(account.areaGroup)}</strong><br /><small>${escapeHtml(account.rawArea)}</small></td>
            ${yearColumns}
          </tr>
        `;
      })
      .join("");
  }

  function renderMatchSheet() {
    const contacts = store.getContacts();
    const stats = matcher.summaryStats(contacts, accounts);
    const suggestions = matcher.buildSuggestions(contacts, accounts);

    els.matchSummary.innerHTML = `
      <div><strong>${stats.contacts}</strong><span>Contacts</span></div>
      <div><strong>${stats.linked}</strong><span>Linked</span></div>
      <div><strong>${stats.needsReview}</strong><span>Review</span></div>
      <div><strong>${stats.noMatch}</strong><span>No match</span></div>
    `;

    const session = store.getSession();
    els.refreshContacts.hidden = session?.source !== "google";
    els.signOut.hidden = session?.source !== "google";

    if (!suggestions.length) {
      els.matchList.innerHTML = "";
      els.matchEmpty.hidden = false;
      els.matchEmpty.textContent = contacts.length
        ? "No open suggestions. All contacts are linked, skipped, or below the match threshold."
        : "No suggestions right now. Connect Google or import contacts first.";
      return;
    }

    els.matchEmpty.hidden = true;
    els.matchList.innerHTML = suggestions
      .map((item) => {
        const { contact, primary, alternatives } = item;
        const altHtml = alternatives.length
          ? `<details class="match-alts"><summary>Other suggestions</summary>${alternatives
              .map(
                (alt) => `
              <button type="button" class="ghost-button compact alt-pick" data-contact-id="${escapeHtml(contact.id)}" data-party-code="${escapeHtml(alt.partyCode)}">
                ${escapeHtml(alt.account.partyName)} (${escapeHtml(alt.tier)})
              </button>`
              )
              .join("")}</details>`
          : "";
        const phones = (contact.phones || []).map((p) => escapeHtml(p)).join(", ") || "No phone";
        return `
          <article class="match-card" data-tier="${escapeHtml(primary.tier)}">
            <div class="match-card-top">
              <span class="tier-badge">${escapeHtml(primary.tier)}</span>
              <span class="match-score">${primary.score}</span>
            </div>
            <div class="match-pair">
              <div>
                <small>Contact</small>
                <strong>${escapeHtml(contact.name)}</strong>
                <span>${phones}</span>
              </div>
              <div class="match-arrow" aria-hidden="true">→</div>
              <div>
                <small>Party</small>
                <strong>${escapeHtml(primary.account.partyName)}</strong>
                <span>${escapeHtml(primary.account.partyCode)} · ${escapeHtml(primary.account.areaGroup)}</span>
              </div>
            </div>
            <div class="match-actions">
              <button type="button" class="primary-button compact confirm-match" data-contact-id="${escapeHtml(contact.id)}" data-party-code="${escapeHtml(primary.partyCode)}">Confirm</button>
              <button type="button" class="ghost-button compact skip-match" data-contact-id="${escapeHtml(contact.id)}">Skip</button>
              <button type="button" class="ghost-button compact pick-match" data-contact-id="${escapeHtml(contact.id)}">Pick party</button>
            </div>
            ${altHtml}
          </article>
        `;
      })
      .join("");

    els.matchList.querySelectorAll(".confirm-match").forEach((button) => {
      button.addEventListener("click", () => {
        store.confirmLink(button.dataset.contactId, button.dataset.partyCode);
        showToast("Linked");
        renderMatchSheet();
        render();
      });
    });
    els.matchList.querySelectorAll(".skip-match").forEach((button) => {
      button.addEventListener("click", () => {
        store.skipContact(button.dataset.contactId);
        renderMatchSheet();
      });
    });
    els.matchList.querySelectorAll(".pick-match").forEach((button) => {
      button.addEventListener("click", () => {
        pickModeContactId = button.dataset.contactId;
        document.body.classList.add("pick-mode");
        closeMatchSheet();
        currentView = "cards";
        els.viewButtons.forEach((item) => item.classList.toggle("active", item.dataset.view === "cards"));
        showToast("Tap a party card to link this contact");
        render();
      });
    });
    els.matchList.querySelectorAll(".alt-pick").forEach((button) => {
      button.addEventListener("click", () => {
        store.confirmLink(button.dataset.contactId, button.dataset.partyCode);
        showToast("Linked");
        renderMatchSheet();
        render();
      });
    });
  }

  function render() {
    updateDependentFilters();
    renderControls();
    const rows = filteredAccounts();
    renderSummary(rows);

    const showTimeline = currentView === "timeline";
    const showCards = currentView === "cards";
    const showTable = currentView === "table";

    els.callStrip.hidden = !showTimeline;
    els.timeline.hidden = !showTimeline;
    els.cards.hidden = !showCards || rows.length === 0;
    els.table.hidden = !showTable || rows.length === 0;

    if (showTimeline) {
      renderTimeline();
      const hasLots = filteredLots().length > 0;
      els.empty.hidden = hasLots;
      if (!hasLots) {
        els.empty.textContent = "No lot arrivals match these filters.";
        els.timeline.hidden = true;
      } else {
        els.empty.textContent = "No accounts match these filters.";
      }
    } else {
      renderCards(rows);
      renderTable(rows);
      els.empty.hidden = rows.length !== 0;
      els.empty.textContent = "No accounts match these filters.";
    }
  }

  function resetFilters() {
    els.search.value = "";
    els.year.value = "all";
    els.state.value = "all";
    updateDependentFilters();
    els.region.value = "all";
    updateDependentFilters();
    els.area.value = "all";
    els.hideEmpty.checked = false;
    pickModeContactId = null;
    document.body.classList.remove("pick-mode");
    render();
  }

  function openSheet(backdrop, sheet) {
    backdrop.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(() => {
      document.body.classList.add("sheet-open");
      backdrop.classList.add("open");
      sheet.classList.add("open");
    });
  }

  function closeSheetPair(backdrop, sheet) {
    document.body.classList.remove("sheet-open");
    backdrop.classList.remove("open");
    sheet.classList.remove("open");
    window.setTimeout(() => {
      backdrop.hidden = true;
      sheet.hidden = true;
    }, 190);
  }

  function openFilterSheet() {
    openSheet(els.filterBackdrop, els.filterSheet);
  }

  function closeFilterSheet() {
    closeSheetPair(els.filterBackdrop, els.filterSheet);
  }

  function openMatchSheet() {
    renderMatchSheet();
    openSheet(els.matchBackdrop, els.matchSheet);
  }

  function closeMatchSheet() {
    closeSheetPair(els.matchBackdrop, els.matchSheet);
  }

  async function handleConnectGoogle() {
    if (!store.hasGoogleClientId()) {
      showToast("Add GOOGLE_CLIENT_ID in config.js (see README)", true);
      return;
    }
    els.connectGoogle.disabled = true;
    try {
      const result = await store.connectGoogle({ forceConsent: true });
      showToast(`Synced ${result.contacts.length} contacts`);
      render();
      openMatchSheet();
    } catch (error) {
      showToast(error.message || "Google connect failed", true);
    } finally {
      els.connectGoogle.disabled = false;
    }
  }

  async function handleRefreshContacts() {
    els.refreshContacts.disabled = true;
    try {
      const result = await store.refreshGoogle();
      showToast(`Refreshed ${result.contacts.length} contacts`);
      renderMatchSheet();
      render();
    } catch (error) {
      showToast(error.message || "Refresh failed", true);
    } finally {
      els.refreshContacts.disabled = false;
    }
  }

  function handleSignOut() {
    store.signOut();
    showToast("Signed out of Google");
    renderMatchSheet();
    render();
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const contacts = await store.importFile(file);
      showToast(`Imported ${contacts.length} contacts`);
      render();
      openMatchSheet();
    } catch (error) {
      showToast(error.message || "Import failed", true);
    }
  }

  els.search.addEventListener("input", render);
  els.year.addEventListener("change", render);
  els.state.addEventListener("change", render);
  els.region.addEventListener("change", render);
  els.area.addEventListener("change", render);
  els.hideEmpty.addEventListener("change", render);
  els.reset.addEventListener("click", resetFilters);
  els.clear.addEventListener("click", resetFilters);
  els.openFilters.addEventListener("click", openFilterSheet);
  els.closeFilters.addEventListener("click", closeFilterSheet);
  els.filterBackdrop.addEventListener("click", closeFilterSheet);
  els.apply.addEventListener("click", closeFilterSheet);
  els.connectGoogle.addEventListener("click", handleConnectGoogle);
  els.importContacts.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", handleImportFile);
  els.openMatch.addEventListener("click", openMatchSheet);
  els.closeMatch.addEventListener("click", closeMatchSheet);
  els.matchBackdrop.addEventListener("click", closeMatchSheet);
  els.refreshContacts.addEventListener("click", handleRefreshContacts);
  els.signOut.addEventListener("click", handleSignOut);
  els.closeParty.addEventListener("click", closePartySheet);
  els.partyBackdrop.addEventListener("click", closePartySheet);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.partySheet.hidden) closePartySheet();
    else if (!els.matchSheet.hidden) closeMatchSheet();
    else if (!els.filterSheet.hidden) closeFilterSheet();
    else if (pickModeContactId) {
      pickModeContactId = null;
      document.body.classList.remove("pick-mode");
      showToast("Pick cancelled");
      render();
    }
  });

  els.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.view;
      els.viewButtons.forEach((item) => item.classList.toggle("active", item === button));
      if (currentView === "timeline") didScrollToToday = false;
      render();
    });
  });

  setupFilters();
  render();
})();
