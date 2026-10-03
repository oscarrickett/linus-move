// One-shot: wipe and re-insert the starter comment on every task.
// Every URL below was verified to return HTTP 200 at time of writing.
//
// Run:  SUPABASE_SECRET=sb_secret_... node supabase/reseed_comments.mjs

const BASE = "https://ayndagcdgzqwwhalzixy.supabase.co/rest/v1";
const SEC  = process.env.SUPABASE_SECRET;
if (!SEC) { console.error("Set SUPABASE_SECRET"); process.exit(1); }

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

const tasks = await req("/tasks?select=id,slug");
const idBySlug = Object.fromEntries(tasks.map(t => [t.slug, t.id]));
console.log("tasks in DB:", tasks.length);

const STARTERS = {
  sfi_understand:
`Here's where to start reading about SFI:

- https://sfi.nu/om-sfi (SFI info portal, Swedish)
- https://en.wikipedia.org/wiki/Swedish_for_immigrants (overview in English)
- https://www.informationsverige.se/en/ (general info for new arrivals, English)

You cannot apply until you've done folkbokföring, but reading up now is fine.`,

  sfi_local_kommun:
`SFI is delivered by whichever kommun you live in. Once we know the address you'll register at, look up that kommun's SFI page.

Full list of kommuns: https://en.wikipedia.org/wiki/List_of_municipalities_of_Sweden`,

  assess_swedish_level:
`CEFR is the six-level European framework (A1 -> C2). Read the descriptions and place yourself roughly - nothing formal:

https://en.wikipedia.org/wiki/Common_European_Framework_of_Reference_for_Languages`,

  gather_school_records:
`Scan certificates, transcripts, anything showing prior study. Keep the originals safe and email me copies so we have them backed up somewhere else too.`,

  beyond_sfi:
`After SFI most people continue with Swedish as a Second Language (SAS) via Komvux. That's what unlocks work + university-level study:

https://en.wikipedia.org/wiki/Komvux`,

  swedish_cv:
`Swedish CVs are short (1-2 pages), direct, and often include a photo. Arbetsförmedlingen (the public employment service) is the go-to reference:

https://arbetsformedlingen.se/for-arbetssokande

Once you have a draft, share it here and I'll read it.`,

  cover_letter_template:
`One base template you can tailor per application. Same source has cover-letter guidance:

https://arbetsformedlingen.se/for-arbetssokande`,

  bookmark_job_boards:
`The three job boards most people use in Sweden:

- Platsbanken (national, official): https://arbetsformedlingen.se/platsbanken
- LinkedIn Sweden: https://www.linkedin.com/jobs/search/?location=Sweden
- Metrojobb: https://www.metrojobb.se/

Set aside 20 minutes a week to skim them.`,

  understand_arbetsformedlingen:
`Arbetsförmedlingen is the free public employment service. Once you're folkbokförd, registering opens up support programmes.

- Homepage: https://arbetsformedlingen.se/
- Wikipedia overview (English): https://en.wikipedia.org/wiki/Swedish_Public_Employment_Service`,

  start_job_search:
`Even before you can apply, browsing weekly builds a sense of the market and turns up realistic targets. Log anything interesting in a comment here.`,

  research_komvux:
`Komvux is free adult education, from primary-level catch-up all the way to university-prep courses. Runs in parallel with SFI:

https://en.wikipedia.org/wiki/Komvux`,

  research_higher_ed:
`Two paths worth understanding, both free for Swedish citizens:

- Universities: https://www.universityadmissions.se/en/
- Yrkeshögskolan (vocational, often shorter): https://www.myh.se/`,

  understand_csn:
`CSN handles study grants + student loans in Sweden. Rules depend on age and course type. Worth understanding before choosing a study path:

https://www.csn.se/languages/english.html`,

  understand_folkbokforing:
`Folkbokföring is registering yourself as a resident at Skatteverket. Almost everything (bank, healthcare, BankID, SFI) needs it, and it can only be done in person in Sweden.

Skatteverket homepage: https://www.skatteverket.se/`,

  understand_bankid:
`BankID is a digital ID issued through a Swedish bank. Once you have it, it unlocks 1177 (healthcare), Skatteverket, Försäkringskassan, Arbetsförmedlingen, etc.

- Homepage: https://www.bankid.com/en/
- Wikipedia overview: https://en.wikipedia.org/wiki/BankID`,

  bookmark_1177:
`1177 is where all healthcare in Sweden happens digitally - booking appointments, seeing test results, messaging your vårdcentral. Needs BankID.

https://www.1177.se/`,

  personnummer_basics:
`The Swedish personal identity number (personnummer) is assigned when you register at Skatteverket. Format: YYYYMMDD-XXXX. It follows you everywhere in Sweden.

https://en.wikipedia.org/wiki/Personal_identity_number_(Sweden)`,
};

console.log("Wiping existing comments...");
await req("/comments?id=not.is.null", "DELETE");

const rows = [];
for (const [slug, body] of Object.entries(STARTERS)) {
  const taskId = idBySlug[slug];
  if (!taskId) { console.warn(`  skip: no task for slug ${slug}`); continue; }
  rows.push({ task_id: taskId, author_id: OSCAR_ID, body });
}
const inserted = await req("/comments", "POST", rows);
console.log("comments inserted:", inserted.length);
console.log("DONE");
