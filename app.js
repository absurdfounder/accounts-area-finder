(function () {
  const data = window.ACCOUNTS_DATA || { years: [], accounts: [] };
  const years = data.years;
  const accounts = data.accounts;
  const store = window.ContactsStore;
  const matcher = window.ContactMatcher;

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
  };

  const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  const money = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

  let currentView = "cards";
  let toastTimer = null;
  let pickModeContactId = null;

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
    renderCards(rows);
    renderTable(rows);
    els.empty.hidden = rows.length !== 0;
    els.cards.hidden = currentView !== "cards" || rows.length === 0;
    els.table.hidden = currentView !== "table" || rows.length === 0;
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

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.matchSheet.hidden) closeMatchSheet();
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
      render();
    });
  });

  setupFilters();
  render();
})();
