// East Creek Living — form handler
// Serves the static site from ./public and forwards the two website forms to Airtable.
// The Airtable token lives ONLY in the Cloudflare secret AIRTABLE_PERSONAL_ACCESS_TOKEN.

// ═══════════════════════════════════════════════════════════════
//  CONFIG — edit here if Airtable names or options change
// ═══════════════════════════════════════════════════════════════
const BASE_ID = "appkqBmIv7gFTqblK";
const SOURCE_LABEL = "eastcreekliving.com"; // must be an option in the "Source" single-select

// Single-select columns: website value → exact Airtable option label.
// If a value isn't listed here, that one field is skipped (the rest of the record still saves).
const OPTIONS = {
  respondingFor: { myself: "Myself", parent: "Parent or family member", community: "Following the project" },
  prospectiveResident: { myself: "Myself", parent: "Parent or family member" },
  monthlyBudget: allow([
    "Under $1,500/month",
    "$1,500 – $2,500/month",
    "$2,500 – $3,500/month",
    "Above $3,500/month",
    "Depends on what's included",
    "Not sure yet",
  ]),
  familyDistance: allow(["Within 30 minutes", "30–60 minutes", "1–2 hours is fine", "Distance isn't a concern"]),
  timeline: allow([
    "As soon as possible",
    "Within 3–6 months",
    "Within the next year",
    "Not sure yet — just getting ahead of it",
  ]),
  consent: { true: "Yes", false: "No" },
};

const FORMS = {
  "/api/survey": {
    table: "tblMk7aWd98sP8liJ", // Community Survey
    text: { name: "Name", location: "City / Town", email: "Email", phone: "Phone", message: "Comments" },
    select: {
      for_whom: ["Responding For", OPTIONS.respondingFor],
      budget: ["Monthly Budget", OPTIONS.monthlyBudget],
      distance: ["Family Distance", OPTIONS.familyDistance],
      consent: ["Contact Consent", OPTIONS.consent],
    },
  },
  "/api/housing-interest": {
    table: "tblOZ3OBRutGhXmeP", // Housing Interest
    text: { name: "Name", location: "City / Town", email: "Email", phone: "Phone", needs: "Notes (nonclinical)" },
    select: {
      resident: ["Prospective Resident", OPTIONS.prospectiveResident],
      timeline: ["Timeline", OPTIONS.timeline],
      consent: ["Contact Consent", OPTIONS.consent],
    },
  },
};
const TIMESTAMP_FIELD = "Submitted At";
const SOURCE_FIELD = "Source";
const MAX_LEN = 2000;
const MIN_FILL_MS = 3000; // faster than this = bot
// ═══════════════════════════════════════════════════════════════

function allow(labels) {
  return Object.fromEntries(labels.map((l) => [l, l]));
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(v) {
  return typeof v === "string" ? v.trim().slice(0, MAX_LEN) : "";
}

async function handleForm(request, env, form) {
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) {
    return json({ ok: false, error: "Unsupported request." }, 415);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }
  if (!body || typeof body !== "object") return json({ ok: false, error: "Invalid request." }, 400);

  // Spam checks: honeypot filled or submitted impossibly fast → pretend success, save nothing.
  if (clean(body.website) || (typeof body.elapsed_ms === "number" && body.elapsed_ms < MIN_FILL_MS)) {
    return json({ ok: true });
  }

  const fields = {};
  for (const [key, col] of Object.entries(form.text)) {
    const v = clean(body[key]);
    if (v) fields[col] = v;
  }

  if (!fields["Name"]) return json({ ok: false, error: "Please add your name." }, 400);
  if (!fields["Email"] && !fields["Phone"]) {
    return json({ ok: false, error: "Please add an email or phone number." }, 400);
  }
  if (fields["Email"] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields["Email"])) {
    return json({ ok: false, error: "Please check your email address." }, 400);
  }

  for (const [key, [col, map]] of Object.entries(form.select)) {
    const raw = key === "consent" ? String(body[key] === true) : clean(body[key]);
    if (!raw) continue;
    const label = map[raw];
    if (label) fields[col] = label;
    else console.error(`Unknown option for "${col}": ${JSON.stringify(raw)} — field skipped`);
  }

  fields[TIMESTAMP_FIELD] = new Date().toISOString();
  fields[SOURCE_FIELD] = SOURCE_LABEL;

  if (!env.AIRTABLE_PERSONAL_ACCESS_TOKEN) {
    console.error("AIRTABLE_PERSONAL_ACCESS_TOKEN secret is not set");
    return json({ ok: false, error: "Something went wrong — please try again later." }, 500);
  }

  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${form.table}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_PERSONAL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ records: [{ fields }] }),
  });

  if (!res.ok) {
    console.error("Airtable error", res.status, await res.text());
    return json({ ok: false, error: "Something went wrong — please try again." }, 502);
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const form = FORMS[url.pathname];

    if (form) {
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
      try {
        return await handleForm(request, env, form);
      } catch (err) {
        console.error("Unhandled error", err);
        return json({ ok: false, error: "Something went wrong — please try again." }, 500);
      }
    }
    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "Not found." }, 404);

    return env.ASSETS.fetch(request);
  },
};
