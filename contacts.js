(function (global) {
  const CONTACTS_KEY = "ssa_contacts_v1";
  const LINKS_KEY = "ssa_contact_links_v1";
  const SESSION_KEY = "ssa_google_session";
  const SKIPPED_KEY = "ssa_contact_skipped_v1";
  const SCOPE = "https://www.googleapis.com/auth/contacts.readonly";
  const DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/people/v1/rest";

  let tokenClient = null;
  let gapiReady = false;
  let gisReady = false;
  let accessToken = null;
  let initPromise = null;

  function config() {
    return global.APP_CONFIG || {};
  }

  function normalizePhone(value) {
    if (value == null) return "";
    let digits = String(value).replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("91") && digits.length > 10) digits = digits.slice(-10);
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length > 10) digits = digits.slice(-10);
    return digits.length === 10 ? digits : digits;
  }

  function phonesFromText(text) {
    const found = [];
    const re = /(?<!\d)([6-9]\d{9})(?!\d)/g;
    const source = String(text || "");
    let match;
    while ((match = re.exec(source))) {
      const phone = normalizePhone(match[1]);
      if (phone && !found.includes(phone)) found.push(phone);
    }
    return found;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getContacts() {
    return readJson(CONTACTS_KEY, []);
  }

  function setContacts(contacts) {
    writeJson(CONTACTS_KEY, contacts);
  }

  function getLinks() {
    return readJson(LINKS_KEY, {});
  }

  function setLinks(links) {
    writeJson(LINKS_KEY, links);
  }

  function getSkipped() {
    return readJson(SKIPPED_KEY, {});
  }

  function setSkipped(skipped) {
    writeJson(SKIPPED_KEY, skipped);
  }

  function getSession() {
    return readJson(SESSION_KEY, null);
  }

  function setSession(session) {
    if (!session) localStorage.removeItem(SESSION_KEY);
    else writeJson(SESSION_KEY, session);
  }

  function confirmLink(contactId, partyCode) {
    const links = getLinks();
    links[contactId] = partyCode;
    setLinks(links);
    const skipped = getSkipped();
    if (skipped[contactId]) {
      delete skipped[contactId];
      setSkipped(skipped);
    }
  }

  function unlinkContact(contactId) {
    const links = getLinks();
    delete links[contactId];
    setLinks(links);
  }

  function skipContact(contactId) {
    const skipped = getSkipped();
    skipped[contactId] = true;
    setSkipped(skipped);
  }

  function contactForParty(partyCode) {
    const links = getLinks();
    const contacts = getContacts();
    const entry = Object.entries(links).find(([, code]) => code === partyCode);
    if (!entry) return null;
    return contacts.find((c) => c.id === entry[0]) || null;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureGoogleLibs() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const clientId = config().GOOGLE_CLIENT_ID;
      if (!clientId) {
        throw new Error("Missing GOOGLE_CLIENT_ID in config.js. See README.md.");
      }

      await Promise.all([
        loadScript("https://apis.google.com/js/api.js"),
        loadScript("https://accounts.google.com/gsi/client"),
      ]);

      await new Promise((resolve, reject) => {
        global.gapi.load("client", {
          callback: resolve,
          onerror: () => reject(new Error("Failed to load gapi client")),
        });
      });

      const initOpts = { discoveryDocs: [DISCOVERY_DOC] };
      if (config().GOOGLE_API_KEY) initOpts.apiKey = config().GOOGLE_API_KEY;
      await global.gapi.client.init(initOpts);
      gapiReady = true;

      tokenClient = global.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: () => {},
      });
      gisReady = true;
    })();
    return initPromise;
  }

  function requestAccessToken(prompt) {
    return new Promise((resolve, reject) => {
      if (!tokenClient) {
        reject(new Error("Google Identity not ready"));
        return;
      }
      tokenClient.callback = (resp) => {
        if (resp.error) {
          reject(new Error(resp.error));
          return;
        }
        accessToken = resp.access_token;
        global.gapi.client.setToken({ access_token: accessToken });
        resolve(resp);
      };
      tokenClient.requestAccessToken({ prompt: prompt || "" });
    });
  }

  function personToContact(person) {
    const names = person.names || [];
    const primaryName =
      names.find((n) => n.metadata?.primary)?.displayName ||
      names[0]?.displayName ||
      [names[0]?.givenName, names[0]?.familyName].filter(Boolean).join(" ") ||
      "";
    const org =
      (person.organizations || []).find((o) => o.metadata?.primary)?.name ||
      (person.organizations || [])[0]?.name ||
      "";
    const phones = [];
    for (const phone of person.phoneNumbers || []) {
      const normalized = normalizePhone(phone.value || phone.canonicalForm || "");
      if (normalized && !phones.includes(normalized)) phones.push(normalized);
    }
    const emails = (person.emailAddresses || []).map((e) => e.value).filter(Boolean);
    const notes = (person.biographies || []).map((b) => b.value).filter(Boolean).join(" ");
    return {
      id: person.resourceName || `people/${primaryName}-${phones[0] || emails[0] || Math.random()}`,
      name: primaryName || org || emails[0] || "Unnamed contact",
      phones,
      org,
      emails,
      notes,
      source: "google",
    };
  }

  async function fetchAllConnections() {
    const contacts = [];
    let pageToken = "";
    do {
      const response = await global.gapi.client.people.people.connections.list({
        resourceName: "people/me",
        pageSize: 1000,
        personFields: "names,emailAddresses,phoneNumbers,organizations,biographies",
        pageToken: pageToken || undefined,
        sortOrder: "LAST_MODIFIED_DESCENDING",
      });
      const batch = response.result.connections || [];
      batch.forEach((person) => {
        const contact = personToContact(person);
        if (contact.name || contact.phones.length) contacts.push(contact);
      });
      pageToken = response.result.nextPageToken || "";
    } while (pageToken);
    return contacts;
  }

  async function fetchProfileEmail() {
    try {
      const response = await global.gapi.client.people.people.get({
        resourceName: "people/me",
        personFields: "emailAddresses,names",
      });
      const emails = response.result.emailAddresses || [];
      return (
        emails.find((e) => e.metadata?.primary)?.value ||
        emails[0]?.value ||
        response.result.names?.[0]?.displayName ||
        ""
      );
    } catch {
      return "";
    }
  }

  async function connectGoogle({ forceConsent = false } = {}) {
    await ensureGoogleLibs();
    await requestAccessToken(forceConsent || !accessToken ? "consent" : "");
    const email = await fetchProfileEmail();
    const contacts = await fetchAllConnections();
    setContacts(contacts);
    setSession({
      email,
      connectedAt: new Date().toISOString(),
      source: "google",
      count: contacts.length,
    });
    return { contacts, email };
  }

  async function refreshGoogle() {
    await ensureGoogleLibs();
    if (!accessToken) await requestAccessToken("");
    else global.gapi.client.setToken({ access_token: accessToken });
    const email = await fetchProfileEmail();
    const contacts = await fetchAllConnections();
    setContacts(contacts);
    setSession({
      email: email || getSession()?.email || "",
      connectedAt: new Date().toISOString(),
      source: "google",
      count: contacts.length,
    });
    return { contacts, email };
  }

  function signOut() {
    const token = accessToken || global.gapi?.client?.getToken()?.access_token;
    if (token && global.google?.accounts?.oauth2?.revoke) {
      global.google.accounts.oauth2.revoke(token, () => {});
    }
    accessToken = null;
    if (global.gapi?.client) global.gapi.client.setToken(null);
    setSession(null);
  }

  function parseCsvLine(line) {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  }

  function parseGoogleCsv(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return [];
    const headers = parseCsvLine(lines[0]).map((h) => h.trim());
    const contacts = [];

    for (let i = 1; i < lines.length; i += 1) {
      const cells = parseCsvLine(lines[i]);
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = cells[idx] || "";
      });

      const name =
        row.Name ||
        [row["First Name"], row["Middle Name"], row["Last Name"]].filter(Boolean).join(" ") ||
        row["Organization Name"] ||
        "";
      const phones = [];
      Object.keys(row).forEach((key) => {
        if (/phone/i.test(key) && !/type|label/i.test(key) && row[key]) {
          const normalized = normalizePhone(row[key]);
          if (normalized && !phones.includes(normalized)) phones.push(normalized);
        }
      });
      const org = row["Organization Name"] || row.Organization || "";
      const notes = row.Notes || "";
      const emails = [];
      Object.keys(row).forEach((key) => {
        if (/e-?mail/i.test(key) && !/type|label/i.test(key) && row[key]) emails.push(row[key]);
      });

      if (!name && !phones.length && !emails.length) continue;
      contacts.push({
        id: `csv:${i}:${name}:${phones[0] || emails[0] || ""}`,
        name: name || org || emails[0] || "Unnamed contact",
        phones,
        org,
        emails,
        notes,
        source: "csv",
      });
    }
    return contacts;
  }

  function parseVCard(text) {
    const cards = text.split(/BEGIN:VCARD/i).slice(1);
    const contacts = [];
    cards.forEach((chunk, index) => {
      const body = chunk.split(/END:VCARD/i)[0] || "";
      const unfolded = body.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
      const lines = unfolded.split(/\r?\n/);
      let name = "";
      let org = "";
      const phones = [];
      const emails = [];
      let notes = "";

      lines.forEach((line) => {
        const upper = line.toUpperCase();
        if (upper.startsWith("FN:")) name = line.slice(3).trim();
        else if (upper.startsWith("N:") && !name) {
          const parts = line.slice(2).split(";");
          name = [parts[1], parts[0]].filter(Boolean).join(" ").trim();
        } else if (upper.startsWith("ORG:")) org = line.slice(4).split(";")[0].trim();
        else if (upper.startsWith("TEL") || upper.includes(".TEL")) {
          const value = line.split(":").slice(1).join(":").trim();
          const phone = normalizePhone(value);
          if (phone && !phones.includes(phone)) phones.push(phone);
        } else if (upper.startsWith("EMAIL") || upper.includes(".EMAIL")) {
          emails.push(line.split(":").slice(1).join(":").trim());
        } else if (upper.startsWith("NOTE:")) notes = line.slice(5).trim();
      });

      if (!name && !phones.length && !emails.length) return;
      contacts.push({
        id: `vcf:${index}:${name}:${phones[0] || emails[0] || ""}`,
        name: name || org || emails[0] || "Unnamed contact",
        phones,
        org,
        emails,
        notes,
        source: "vcf",
      });
    });
    return contacts;
  }

  async function importFile(file) {
    const text = await file.text();
    const name = (file.name || "").toLowerCase();
    let contacts = [];
    if (name.endsWith(".vcf") || /BEGIN:VCARD/i.test(text)) {
      contacts = parseVCard(text);
    } else {
      contacts = parseGoogleCsv(text);
    }
    if (!contacts.length) throw new Error("No contacts found in that file.");
    setContacts(contacts);
    setSession({
      email: "",
      connectedAt: new Date().toISOString(),
      source: name.endsWith(".vcf") ? "vcf" : "csv",
      count: contacts.length,
      fileName: file.name,
    });
    return contacts;
  }

  function clearContacts() {
    setContacts([]);
    setSession(null);
  }

  global.ContactsStore = {
    SCOPE,
    normalizePhone,
    phonesFromText,
    getContacts,
    setContacts,
    getLinks,
    setLinks,
    getSkipped,
    setSkipped,
    getSession,
    setSession,
    confirmLink,
    unlinkContact,
    skipContact,
    contactForParty,
    connectGoogle,
    refreshGoogle,
    signOut,
    importFile,
    clearContacts,
    ensureGoogleLibs,
    hasGoogleClientId: () => Boolean(config().GOOGLE_CLIENT_ID),
  };
})(window);
