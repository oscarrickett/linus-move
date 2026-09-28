// One-shot: convert the pre-seeded useful-links into starter comments
// from Oscar, then delete the links (since the detail panel only shows
// comments now).
//
// Run:  SUPABASE_SECRET=sb_secret_... node supabase/reseed_comments.mjs

const BASE = "https://alomimvbbovjjjlwfxyq.supabase.co/rest/v1";
const SEC  = process.env.SUPABASE_SECRET;
if (!SEC) { console.error("Set SUPABASE_SECRET"); process.exit(1); }

// Oscar's user id (from profiles table).
const OSCAR_ID = "097d74ad-f145-4991-a1a2-d281e7133328";

const H = {
  apikey: SEC,
  Authorization: `Bearer ${SEC}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function req(path, method = "GET", body) {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

// -- 1. Fetch tasks by slug so we know their ids
const tasks = await req("/tasks?select=id,slug");
const idBySlug = Object.fromEntries(tasks.map(t => [t.slug, t.id]));
console.log("tasks in DB:", tasks.length);

// -- 2. Starter comments per task slug.
//    Each entry becomes ONE comment from Oscar. URLs autolink in the UI.
const STARTERS = {
  sfi_understand:
`Here's where to start reading about SFI:

- Skolverket (official, Swedish): https://www.skolverket.se/skolformer/vuxenutbildning/utbildning-i-svenska-for-invandrare-sfi
- Informationsverige (English overview): https://www.informationsverige.se/en/jag-har-fatt-uppehallstillstand/etablering/svenska-for-invandrare-sfi/

You cannot apply until you've done folkbokföring, but you can read up now.`,

  sfi_local_kommun:
`SFI is delivered by whichever kommun you live in. Once we know the address you'll register at, look up that kommun's SFI page.

Full list of kommuns: https://skr.se/skr/tjanster/kommunerochregioner.431.html`,

  assess_swedish_level:
`Use the CEFR self-assessment grid to place yourself roughly on A1 -> C2. Nothing formal - just so we know what SFI level to aim for:
https://europa.eu/europass/en/self-assessment-grid`,

  gather_school_records:
`Scan certificates, transcripts, anything showing prior study. Keep the originals safe and email me copies so we have them backed up.`,

  beyond_sfi:
`After SFI most people continue with Swedish as a Second Language (SAS) via Komvux. That's what unlocks work + university-level study:
https://www.skolverket.se/skolformer/vuxenutbildning/kommunal-vuxenutbildning`,

  swedish_cv:
`Swedish CVs are short (1-2 pages), direct, and often include a photo. Arbetsförmedlingen has a good template + guidance:
https://arbetsformedlingen.se/for-arbetssokande/tips-och-rad/skriv-ett-cv

Once you have a draft, share it here and I'll read it.`,

  cover_letter_template:
`One base template you can tailor per application. Same source has cover-letter guidance:
https://arbetsformedlingen.se/for-arbetssokande/tips-och-rad/skriv-ett-personligt-brev`,

  bookmark_job_boards:
`The three job boards most people use in Sweden:

- Platsbanken (national, official): https://arbetsformedlingen.se/platsbanken
- Blocket Jobb: https://jobb.blocket.se
- LinkedIn Sweden: https://www.linkedin.com/jobs/search/?location=Sweden

Set aside 20 minutes a week to skim them.`,

  understand_arbetsformedlingen:
`Arbetsförmedlingen is the free public employment service. Once you're folkbokförd, registering opens up support programmes. Good place to read up:
https://arbetsformedlingen.se/other-languages/english-engelska`,

  start_job_search:
`Even before you can apply, browsing weekly builds a sense of the market and turns up realistic targets. Log anything interesting in a comment here.`,

  research_komvux:
`Komvux is free adult education, from primary-level catch-up all the way to university-prep courses. Runs in parallel with SFI:
https://www.skolverket.se/skolformer/vuxenutbildning`,

  research_higher_ed:
`Two paths worth understanding, both free for Swedish citizens:

- Universities: https://www.universityadmissions.se/en/
- Yrkeshögskolan (vocational, often shorter): https://www.myh.se/`,

  understand_csn:
`CSN handles study grants + student loans in Sweden. Rules depend on age and course type. Worth understanding before choosing a study path:
https://www.csn.se/languages/english.html`,

  understand_folkbokforing:
`Folkbokföring is registering yourself as a resident at Skatteverket. Almost everything (bank, healthcare, BankID, SFI) needs it, and it can only be done in person in Sweden.

Official English guide: https://www.skatteverket.se/servicelankar/otherlanguages/inenglish/individualsandemployees/livinginsweden/movingtoswedenfromabroad.4.7be5268414bea064694c40c.html`,

  understand_bankid:
`BankID is a digital ID issued through a Swedish bank. Once you have it, it unlocks 1177 (healthcare), Skatteverket, Försäkringskassan, Arbetsförmedlingen, etc.
https://www.bankid.com/en/`,

  bookmark_1177:
`1177 is where all healthcare in Sweden happens digitally - booking appointments, seeing test results, messaging your vårdcentral. Needs BankID.
https://www.1177.se/`,

  personnummer_basics:
`The Swedish personal identity number (personnummer) is assigned when you fold-register at Skatteverket. Format: YYYYMMDD-XXXX. It follows you everywhere in Sweden.
https://www.skatteverket.se/servicelankar/otherlanguages/inenglish/individualsandemployees/livinginsweden/personalidentitynumberandcoordinationnumber.4.2cf1b5cd163796a5c8b4295.html`,
};

// -- 3. Delete existing comments (avoid duplicates on re-runs)
console.log("Wiping existing comments + links...");
await req("/comments?id=not.is.null", "DELETE");
await req("/links?id=not.is.null", "DELETE");

// -- 4. Insert starter comments
const rows = [];
for (const [slug, body] of Object.entries(STARTERS)) {
  const taskId = idBySlug[slug];
  if (!taskId) { console.warn(`  skip: no task for slug ${slug}`); continue; }
  rows.push({ task_id: taskId, author_id: OSCAR_ID, body });
}
const inserted = await req("/comments", "POST", rows);
console.log("comments inserted:", inserted.length);
console.log("DONE");
