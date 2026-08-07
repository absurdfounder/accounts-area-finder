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
    empty: document.getElementById("emptyState"),
    mainTabs: Array.from(document.querySelectorAll("[data-main-view]")),
    gridToolbar: document.getElementById("gridToolbar"),
    gridLayoutButtons: Array.from(document.querySelectorAll("[data-grid-layout]")),
    timelineNav: document.getElementById("timelineNav"),
    monthRail: document.getElementById("monthRail"),
    jumpToday: document.getElementById("jumpTodayBtn"),
    moreBtn: document.getElementById("moreBtn"),
    moreBackdrop: document.getElementById("moreBackdrop"),
    moreSheet: document.getElementById("moreSheet"),
    closeMore: document.getElementById("closeMoreBtn"),
    bottomNav: document.getElementById("bottomNav"),
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

  const PHONES_KEY = "ssa_party_phones_v1";
  let mainView = "timeline";
  let gridLayout = "cards";
  let toastTimer = null;
  let pickModeContactId = null;
  let shouldFixtureToToday = true;

  function readPhones() {
    try {
      return JSON.parse(localStorage.getItem(PHONES_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function writePhones(map) {
    localStorage.setItem(PHONES_KEY, JSON.stringify(map));
  }

  function getPartyPhone(partyCode) {
    const manual = readPhones()[partyCode];
    if (manual) return store.normalizePhone(manual);
    const fromArea = store.phonesFromText(accountByCode[partyCode]?.rawArea || "");
    if (fromArea[0]) return fromArea[0];
    const contact = store.contactForParty(partyCode);
    return contact?.phones?.[0] ? store.normalizePhone(contact.phones[0]) : "";
  }

  function setPartyPhone(partyCode, phone) {
    const map = readPhones();
    const normalized = store.normalizePhone(phone);
    if (!normalized) {
      delete map[partyCode];
    } else {
      map[partyCode] = normalized;
    }
    writePhones(map);
    return normalized;
  }

  function ensureCallablePhone(partyCode) {
    let phone = getPartyPhone(partyCode);
    if (phone) return phone;
    const entered = window.prompt("No number linked yet. Enter mobile number to call and save:");
    if (!entered) return "";
    phone = setPartyPhone(partyCode, entered);
    if (!phone || phone.length < 10) {
      showToast("Enter a valid 10-digit mobile number", true);
      return "";
    }
    showToast("Number saved");
    return phone;
  }

  function dialParty(partyCode, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const phone = ensureCallablePhone(partyCode);
    if (!phone) return;
    window.location.href = `tel:+91${phone}`;
  }

  function callButtonHtml(partyCode) {
    const phone = getPartyPhone(partyCode);
    const hint = phone ? "" : ' data-needs-number="1"';
    return `<button type="button" class="chip-call call-action"${hint} data-call-party="${escapeHtml(partyCode)}">Call</button>`;
  }

  function todayParts(date = new Date()) {
    const day = date.getDate();
    const week = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
    return { month: date.getMonth() + 1, week, day, year: date.getFullYear() };
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
    const keep = values.includes(current) ? current : "all";
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
    select.value = keep;
    if (select.value !== keep) {
      const match = Array.from(select.options).find((option) => option.value === keep);
      if (match) match.selected = true;
    }
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
    const state = els.state.value || "all";
    const region = els.region.value || "all";
    const area = els.area.value || "all";
    const scopedByState = state === "all" ? accounts : accounts.filter((a) => a.state === state);
    const regions = unique(scopedByState, (a) => a.region);
    setOptions(els.region, regions, "All regions");
    if (region !== "all" && regions.includes(region)) {
      els.region.value = region;
    }
    const nextRegion = els.region.value || "all";
    const scopedByRegion = nextRegion === "all" ? scopedByState : scopedByState.filter((a) => a.region === nextRegion);
    const areas = unique(scopedByRegion, (a) => a.areaGroup);
    setOptions(els.area, areas, "All area groups");
    if (area !== "all" && areas.includes(area)) {
      els.area.value = area;
    }
  }

  function accountHasYearActivity(account, selectedYear) {
    if (!selectedYear || selectedYear === "all") return true;
    const yearData = account.years?.[selectedYear];
    if (!yearData) return false;
    return (yearData.netAmount !== null && yearData.netAmount !== undefined)
      || (yearData.cases !== null && yearData.cases !== undefined);
  }

  function matchesSearch(account, query) {
    if (!query) return true;
    const phone = digitQuery(query);
    if (phone) {
      const hit = matcher.findByPhone(phone, store.getContacts(), [account]);
      if (hit.accounts.length) return true;
      const manual = getPartyPhone(account.partyCode);
      if (manual && (manual.includes(phone) || phone.includes(manual))) return true;
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
      getPartyPhone(account.partyCode),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.toLowerCase());
  }

  function filteredAccounts() {
    const query = (els.search.value || "").trim();
    const selectedYear = els.year.value || "all";
    const selectedState = els.state.value || "all";
    const selectedRegion = els.region.value || "all";
    const selectedArea = els.area.value || "all";
    const phone = digitQuery(query);

    let rows = accounts
      .filter((account) => selectedState === "all" || account.state === selectedState)
      .filter((account) => selectedRegion === "all" || account.region === selectedRegion)
      .filter((account) => selectedArea === "all" || account.areaGroup === selectedArea)
      .filter((account) => matchesSearch(account, query))
      .filter((account) => accountHasYearActivity(account, selectedYear))
      .filter((account) => {
        if (!els.hideEmpty.checked || selectedYear === "all") return true;
        const value = account.years[selectedYear]?.netAmount;
        return value !== null && value !== undefined;
      });

    if (phone) {
      const byPhone = matcher.findByPhone(phone, store.getContacts(), accounts).accounts;
      const codes = new Set(byPhone.map((a) => a.partyCode));
      accounts.forEach((account) => {
        const manual = getPartyPhone(account.partyCode);
        if (manual && (manual.includes(phone) || phone.includes(manual))) codes.add(account.partyCode);
      });
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
    if (!account) return "";
    const contact = store.contactForParty(account.partyCode);
    const phone = getPartyPhone(account.partyCode);
    const contactName = contact?.name ? `<strong>${escapeHtml(contact.name)}</strong>` : "";
    const phoneLabel = phone ? `<span class="tel-link">+91 ${escapeHtml(phone)}</span>` : `<span class="muted-note">No number yet</span>`;
    return `
      <div class="contact-link-row">
        <span class="contact-badge">${contact ? "Contact" : "Phone"}</span>
        ${contactName}
        ${phoneLabel}
        ${callButtonHtml(account.partyCode)}
      </div>
    `;
  }

  function shortYears(yearsList) {
    return (yearsList || []).map((year) => String(year).slice(2)).join(",");
  }

  function partyChip(entry, opts = {}) {
    const account = accountByCode[entry.partyCode];
    const name = account?.partyName || entry.partyCode;
    const meta = opts.hideMeta
      ? ""
      : `<span class="chip-meta">×${entry.lotCount}${entry.years?.length ? ` · ${escapeHtml(shortYears(entry.years))}` : ""}</span>`;
    return `
      <div class="party-chip" data-party-code="${escapeHtml(entry.partyCode)}" data-month="${opts.month || ""}" data-week="${opts.week || ""}">
        <button type="button" class="chip-main" data-open-party="${escapeHtml(entry.partyCode)}">
          <span class="chip-code">${escapeHtml(entry.partyCode)}</span>
          <span class="chip-name">${escapeHtml(name)}</span>
          ${meta}
        </button>
        ${callButtonHtml(entry.partyCode)}
      </div>
    `;
  }

  function bindCallActions(root) {
    root.querySelectorAll("[data-call-party]").forEach((button) => {
      button.addEventListener("click", (event) => dialParty(button.dataset.callParty, event));
    });
  }

  function bindPartyChips(root) {
    root.querySelectorAll("[data-open-party]").forEach((button) => {
      button.addEventListener("click", () => {
        const chip = button.closest(".party-chip");
        openPartySheet(
          button.dataset.openParty,
          Number(chip?.dataset.month) || null,
          Number(chip?.dataset.week) || null
        );
      });
    });
    bindCallActions(root);
  }

  function openPartySheet(partyCode, month, week) {
    const account = accountByCode[partyCode];
    const lots = filteredLots().filter((lot) => lot.partyCode === partyCode);
    const scoped = month && week ? lots.filter((lot) => lot.month === month && lot.week === week) : lots;
    const phone = getPartyPhone(partyCode);
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
      <div class="party-phone-edit">
        <label>
          <span>Mobile number</span>
          <input id="partyPhoneInput" type="tel" inputmode="numeric" placeholder="10-digit mobile" value="${escapeHtml(phone)}" />
        </label>
        <div class="party-phone-actions">
          <button type="button" class="ghost-button compact" id="savePartyPhoneBtn">Save number</button>
          <button type="button" class="primary-button compact" id="callPartySheetBtn" data-call-party="${escapeHtml(partyCode)}">Call</button>
        </div>
      </div>
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
    document.getElementById("savePartyPhoneBtn")?.addEventListener("click", () => {
      const value = document.getElementById("partyPhoneInput")?.value || "";
      const saved = setPartyPhone(partyCode, value);
      if (value && (!saved || saved.length < 10)) {
        showToast("Enter a valid 10-digit mobile number", true);
        return;
      }
      showToast(saved ? "Number saved" : "Number cleared");
      openPartySheet(partyCode, month, week);
      render();
    });
    bindCallActions(els.partySheetBody);
  }

  function closePartySheet() {
    closeSheetPair(els.partyBackdrop, els.partySheet);
  }

  function updateStickyOffsets() {
    const header = document.getElementById("appHeader") || document.querySelector(".app-header");
    const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
    const monthHead = els.timeline.querySelector(".timeline-month-head");
    const monthHeadHeight = monthHead ? Math.ceil(monthHead.getBoundingClientRect().height) : 48;
    const root = document.documentElement;
    root.style.setProperty("--sticky-header-height", `${headerHeight}px`);
    root.style.setProperty("--sticky-month-top", `${headerHeight}px`);
    root.style.setProperty("--sticky-week-top", `${headerHeight + monthHeadHeight}px`);
  }

  function scrollTimelineToToday(behavior = "auto") {
    updateStickyOffsets();
    const marker = document.getElementById("timelineToday");
    if (!marker) return;
    marker.scrollIntoView({ block: "start", behavior });
    const month = todayParts().month;
    const pill = els.monthRail.querySelector(`[data-month="${month}"]`);
    if (pill) pill.scrollIntoView({ inline: "center", block: "nearest", behavior });
  }

  function renderMonthRail(seasonal, activeMonth) {
    const today = todayParts();
    els.monthRail.innerHTML = MONTH_NAMES.map((name, index) => {
      const month = index + 1;
      const count = [1, 2, 3, 4].reduce((sum, week) => sum + ((seasonal[`${month}-${week}`] || []).length), 0);
      const isActive = month === activeMonth;
      const isTodayMonth = month === today.month;
      return `
        <button type="button" class="month-pill${isActive ? " active" : ""}${isTodayMonth ? " is-current" : ""}" data-month="${month}" role="tab" aria-selected="${isActive}">
          <strong>${name.slice(0, 3)}</strong>
          <span>${count}</span>
        </button>
      `;
    }).join("");

    els.monthRail.querySelectorAll("[data-month]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = document.getElementById(`month-${button.dataset.month}`);
        if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
        els.monthRail.querySelectorAll(".month-pill").forEach((pill) => {
          const on = pill === button;
          pill.classList.toggle("active", on);
          pill.setAttribute("aria-selected", on ? "true" : "false");
        });
        button.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      });
    });
  }

  function renderTimeline() {
    const lots = filteredLots();
    const seasonal = buildSeasonalFromLots(lots);
    const today = todayParts();
    const restoreY = window.scrollY;
    renderMonthRail(seasonal, today.month);

    els.timeline.innerHTML = MONTH_NAMES.map((name, index) => {
      const month = index + 1;
      const weeks = [1, 2, 3, 4]
        .map((week) => {
          const entries = seasonal[`${month}-${week}`] || [];
          const isToday = month === today.month && week === today.week;
          return `
            <div class="timeline-week${isToday ? " is-today" : ""}" id="${isToday ? "timelineToday" : `week-${month}-${week}`}" data-month="${month}" data-week="${week}">
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
        <section class="timeline-month" id="month-${month}" data-month="${month}">
          <header class="timeline-month-head">
            <h2>${name}</h2>
            <span>Seasonal pattern across years</span>
          </header>
          ${weeks}
        </section>
      `;
    }).join("");

    bindPartyChips(els.timeline);
    updateStickyOffsets();

    if (shouldFixtureToToday) {
      shouldFixtureToToday = false;
      requestAnimationFrame(() => {
        updateStickyOffsets();
        requestAnimationFrame(() => scrollTimelineToToday("auto"));
      });
    } else {
      requestAnimationFrame(() => {
        updateStickyOffsets();
        window.scrollTo(0, restoreY);
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

    bindCallActions(els.cards);

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
        const phone = getPartyPhone(account.partyCode);
        const contactHtml = `
          <br /><small class="contact-inline">${contact ? escapeHtml(contact.name) : "Party"}${phone ? ` · ${escapeHtml(phone)}` : " · no number"}</small>
          <br />${callButtonHtml(account.partyCode)}
        `;
        return `
          <tr>
            <td><strong>${escapeHtml(account.partyCode)}</strong><br />${escapeHtml(account.partyName)}${contactHtml}</td>
            <td>${escapeHtml(account.state)}<br />${escapeHtml(account.region)}<br /><strong>${escapeHtml(account.areaGroup)}</strong><br /><small>${escapeHtml(account.rawArea)}</small></td>
            ${yearColumns}
          </tr>
        `;
      })
      .join("");
    bindCallActions(els.tableBody);
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
        mainView = "grid";
        gridLayout = "cards";
        syncViewChrome();
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

  function syncViewChrome() {
    els.mainTabs.forEach((tab) => {
      const active = tab.dataset.mainView === mainView;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    els.gridLayoutButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.gridLayout === gridLayout);
    });
    document.querySelectorAll("[data-filter-view]").forEach((button) => {
      const mode = button.dataset.filterView;
      const active =
        (mode === "timeline" && mainView === "timeline") ||
        (mode === "cards" && mainView === "grid" && gridLayout === "cards") ||
        (mode === "table" && mainView === "grid" && gridLayout === "table");
      button.classList.toggle("active", active);
    });
    document.querySelectorAll("[data-nav]").forEach((button) => {
      const nav = button.dataset.nav;
      const active =
        (nav === "timeline" && mainView === "timeline") ||
        (nav === "grid" && mainView === "grid");
      button.classList.toggle("active", active);
      if (nav === "timeline" || nav === "grid") {
        button.setAttribute("aria-current", active ? "page" : "false");
      }
    });
    requestAnimationFrame(updateStickyOffsets);
  }

  function openMoreSheet() {
    openSheet(els.moreBackdrop, els.moreSheet);
  }

  function closeMoreSheet() {
    closeSheetPair(els.moreBackdrop, els.moreSheet);
  }

  function render() {
    renderControls();
    syncViewChrome();
    const rows = filteredAccounts();
    renderSummary(rows);

    const showTimeline = mainView === "timeline";
    const showGrid = mainView === "grid";
    const showCards = showGrid && gridLayout === "cards";
    const showTable = showGrid && gridLayout === "table";

    els.gridToolbar.hidden = !showGrid;
    els.timelineNav.hidden = !showTimeline;
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
  els.state.addEventListener("change", () => {
    updateDependentFilters();
    render();
  });
  els.region.addEventListener("change", () => {
    updateDependentFilters();
    render();
  });
  els.area.addEventListener("change", render);
  els.hideEmpty.addEventListener("change", render);
  els.reset.addEventListener("click", resetFilters);
  els.clear.addEventListener("click", resetFilters);
  els.openFilters.addEventListener("click", openFilterSheet);
  els.closeFilters.addEventListener("click", () => {
    render();
    closeFilterSheet();
  });
  els.filterBackdrop.addEventListener("click", () => {
    render();
    closeFilterSheet();
  });
  els.apply.addEventListener("click", () => {
    render();
    closeFilterSheet();
  });
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
    if (!els.moreSheet.hidden) closeMoreSheet();
    else if (!els.partySheet.hidden) closePartySheet();
    else if (!els.matchSheet.hidden) closeMatchSheet();
    else if (!els.filterSheet.hidden) closeFilterSheet();
    else if (pickModeContactId) {
      pickModeContactId = null;
      document.body.classList.remove("pick-mode");
      showToast("Pick cancelled");
      render();
    }
  });

  els.mainTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      mainView = tab.dataset.mainView;
      if (mainView === "timeline") shouldFixtureToToday = true;
      render();
    });
  });

  els.gridLayoutButtons.forEach((button) => {
    button.addEventListener("click", () => {
      gridLayout = button.dataset.gridLayout;
      mainView = "grid";
      render();
    });
  });

  document.querySelectorAll("[data-filter-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.filterView;
      if (mode === "timeline") {
        mainView = "timeline";
        shouldFixtureToToday = true;
      } else {
        mainView = "grid";
        gridLayout = mode;
      }
      render();
      closeFilterSheet();
    });
  });

  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const nav = button.dataset.nav;
      if (nav === "timeline") {
        mainView = "timeline";
        shouldFixtureToToday = true;
        render();
      } else if (nav === "grid") {
        mainView = "grid";
        render();
      } else if (nav === "filters") {
        openFilterSheet();
      } else if (nav === "more") {
        openMoreSheet();
      }
    });
  });

  els.jumpToday.addEventListener("click", () => {
    scrollTimelineToToday("smooth");
  });

  els.moreBtn?.addEventListener("click", openMoreSheet);
  els.closeMore?.addEventListener("click", closeMoreSheet);
  els.moreBackdrop?.addEventListener("click", closeMoreSheet);

  document.getElementById("connectGoogleBtnMobile")?.addEventListener("click", () => {
    closeMoreSheet();
    handleConnectGoogle();
  });
  document.getElementById("importContactsBtnMobile")?.addEventListener("click", () => {
    closeMoreSheet();
    els.importFile.click();
  });
  document.getElementById("openMatchBtnMobile")?.addEventListener("click", () => {
    closeMoreSheet();
    openMatchSheet();
  });
  document.getElementById("resetBtnMobile")?.addEventListener("click", () => {
    closeMoreSheet();
    resetFilters();
  });
  document.getElementById("jumpTodayBtnMobile")?.addEventListener("click", () => {
    closeMoreSheet();
    mainView = "timeline";
    shouldFixtureToToday = true;
    render();
  });

  window.addEventListener("resize", () => {
    updateStickyOffsets();
  });

  setupFilters();
  render();
})();
