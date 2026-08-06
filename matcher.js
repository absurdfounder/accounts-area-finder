(function (global) {
  const STOP_WORDS = new Set([
    "m",
    "s",
    "ms",
    "mrs",
    "mr",
    "prop",
    "proprietor",
    "orch",
    "orchard",
    "ltd",
    "pvt",
    "private",
    "limited",
    "and",
    "the",
    "of",
    "co",
    "company",
  ]);

  function normalizeName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/m\/s\.?/g, " ")
      .replace(/prop\.?\s*:?/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(value) {
    return normalizeName(value)
      .split(" ")
      .filter((token) => token && token.length > 1 && !STOP_WORDS.has(token));
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const rows = a.length + 1;
    const cols = b.length + 1;
    const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
    for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  }

  function partyPhones(account, normalizePhone, phonesFromText) {
    const fromArea = phonesFromText(account.rawArea || "");
    const fromName = phonesFromText(account.partyName || "");
    return Array.from(new Set([...fromArea, ...fromName].map(normalizePhone).filter(Boolean)));
  }

  function contactHaystack(contact) {
    return [contact.name, contact.org, ...(contact.emails || []), contact.notes || ""]
      .filter(Boolean)
      .join(" ");
  }

  function scoreContactAgainstParty(contact, account, helpers) {
    const { normalizePhone, phonesFromText } = helpers;
    let score = 0;
    const reasons = [];

    const cPhones = (contact.phones || []).map(normalizePhone).filter(Boolean);
    const aPhones = partyPhones(account, normalizePhone, phonesFromText);
    const phoneHit = cPhones.find((phone) => aPhones.includes(phone));
    if (phoneHit) {
      score += 100;
      reasons.push(`phone ${phoneHit}`);
    }

    const contactNames = [contact.name, contact.org].filter(Boolean);
    const partyNames = [account.partyName, account.areaGroup].filter(Boolean);
    let bestName = 0;

    contactNames.forEach((cName) => {
      const cNorm = normalizeName(cName);
      const cTokens = tokens(cName);
      partyNames.forEach((pName) => {
        const pNorm = normalizeName(pName);
        const pTokens = tokens(pName);
        if (!cNorm || !pNorm) return;

        if (cNorm === pNorm) {
          bestName = Math.max(bestName, 80);
          return;
        }
        const longer = cNorm.length >= pNorm.length ? cNorm : pNorm;
        const shorter = cNorm.length >= pNorm.length ? pNorm : cNorm;
        if (shorter.length >= 4 && longer.includes(shorter)) {
          bestName = Math.max(bestName, 62);
        }

        if (cTokens.length && pTokens.length) {
          const overlap = cTokens.filter((token) => pTokens.includes(token));
          const ratio = overlap.length / Math.max(cTokens.length, pTokens.length);
          if (ratio >= 0.66) bestName = Math.max(bestName, 55 + Math.round(ratio * 20));
          else if (ratio >= 0.4) bestName = Math.max(bestName, 40 + Math.round(ratio * 15));
          else if (overlap.length >= 2) bestName = Math.max(bestName, 36);
        }

        const maxLen = Math.max(cNorm.length, pNorm.length);
        if (maxLen > 0 && maxLen <= 48) {
          const dist = levenshtein(cNorm, pNorm);
          const similarity = 1 - dist / maxLen;
          if (similarity >= 0.86) bestName = Math.max(bestName, Math.round(similarity * 70));
        }
      });
    });

    if (bestName) {
      score += bestName;
      reasons.push(`name ~${bestName}`);
    }

    const hay = contactHaystack(contact).toLowerCase();
    if (account.partyCode && hay.includes(String(account.partyCode).toLowerCase())) {
      score += 35;
      reasons.push("party code");
    }

    let tier = null;
    if (score >= 100 || (phoneHit && bestName >= 30)) tier = "exact";
    else if (score >= 70) tier = "likely";
    else if (score >= 42) tier = "possible";

    return tier
      ? {
          contactId: contact.id,
          partyCode: account.partyCode,
          score,
          tier,
          reasons,
          contact,
          account,
        }
      : null;
  }

  function buildSuggestions(contacts, accounts, options = {}) {
    const store = global.ContactsStore;
    const links = options.links || store.getLinks();
    const skipped = options.skipped || store.getSkipped();
    const helpers = {
      normalizePhone: store.normalizePhone,
      phonesFromText: store.phonesFromText,
    };
    const linkedPartyCodes = new Set(Object.values(links));
    const suggestions = [];

    contacts.forEach((contact) => {
      if (links[contact.id] || skipped[contact.id]) return;
      const ranked = [];
      accounts.forEach((account) => {
        if (linkedPartyCodes.has(account.partyCode)) return;
        const match = scoreContactAgainstParty(contact, account, helpers);
        if (match) ranked.push(match);
      });
      ranked.sort((a, b) => b.score - a.score || a.partyCode.localeCompare(b.partyCode));
      const top = ranked.slice(0, 3);
      if (top.length) {
        suggestions.push({
          contact,
          primary: top[0],
          alternatives: top.slice(1),
        });
      }
    });

    suggestions.sort((a, b) => {
      const tierRank = { exact: 0, likely: 1, possible: 2 };
      return (
        tierRank[a.primary.tier] - tierRank[b.primary.tier] ||
        b.primary.score - a.primary.score ||
        a.contact.name.localeCompare(b.contact.name)
      );
    });

    return suggestions;
  }

  function findByPhone(queryDigits, contacts, accounts) {
    const store = global.ContactsStore;
    const phone = store.normalizePhone(queryDigits);
    if (!phone || phone.length < 7) return { contacts: [], accounts: [] };

    const matchedContacts = contacts.filter((contact) =>
      (contact.phones || []).some((p) => store.normalizePhone(p).includes(phone) || phone.includes(store.normalizePhone(p)))
    );

    const matchedAccounts = accounts.filter((account) => {
      const phones = store.phonesFromText(`${account.rawArea || ""} ${account.partyName || ""}`);
      const linked = store.contactForParty(account.partyCode);
      const linkedPhones = linked?.phones || [];
      return [...phones, ...linkedPhones].some(
        (p) => store.normalizePhone(p).includes(phone) || phone.includes(store.normalizePhone(p))
      );
    });

    const links = store.getLinks();
    matchedContacts.forEach((contact) => {
      const partyCode = links[contact.id];
      if (!partyCode) return;
      const account = accounts.find((a) => a.partyCode === partyCode);
      if (account && !matchedAccounts.some((a) => a.partyCode === partyCode)) {
        matchedAccounts.push(account);
      }
    });

    return { phone, contacts: matchedContacts, accounts: matchedAccounts };
  }

  function summaryStats(contacts, accounts) {
    const links = global.ContactsStore.getLinks();
    const skipped = global.ContactsStore.getSkipped();
    const suggestions = buildSuggestions(contacts, accounts, { links, skipped });
    return {
      contacts: contacts.length,
      linked: Object.keys(links).length,
      skipped: Object.keys(skipped).length,
      needsReview: suggestions.length,
      noMatch: Math.max(
        0,
        contacts.length - Object.keys(links).length - Object.keys(skipped).length - suggestions.length
      ),
    };
  }

  global.ContactMatcher = {
    normalizeName,
    tokens,
    scoreContactAgainstParty,
    buildSuggestions,
    findByPhone,
    summaryStats,
  };
})(window);
