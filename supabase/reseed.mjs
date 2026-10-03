// Wipe and re-seed via Supabase REST. Uses the SECRET key from env
// (SUPABASE_SECRET) to bypass RLS. Contacts / info_records / auth users
// are left alone.
//
// Run:  SUPABASE_SECRET=sb_secret_... node supabase/reseed.mjs

const BASE = "https://ayndagcdgzqwwhalzixy.supabase.co/rest/v1";
const SEC  = process.env.SUPABASE_SECRET;
if (!SEC) { console.error("Set SUPABASE_SECRET"); process.exit(1); }

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

// -------- 1. Wipe existing task/reference data (leave contacts/info_records/profiles)
console.log("Wiping tasks / categories / phases / links / subtasks / comments / deps...");
// task_dependencies has a composite key with no `id` column.
const FILTERS = { task_dependencies: "task_id=not.is.null" };
for (const t of ["links","subtasks","comments","task_dependencies","tasks","categories","phases"]) {
  const filter = FILTERS[t] || "id=not.is.null";
  const del = await req(`/${t}?${filter}`, "DELETE");
  console.log(`  deleted from ${t}: ${Array.isArray(del) ? del.length : "ok"}`);
}

// -------- 2. Phases + categories
const [phase] = await req("/phases", "POST", [
  { slug: "prepare_now", name: "Before arriving in Sweden", sort_order: 1 },
]);
console.log("phase:", phase.name);

const cats = await req("/categories", "POST", [
  { slug: "language",   name: "Language (SFI)",    color: "#e5a02f", sort_order: 1 },
  { slug: "employment", name: "Employment",        color: "#4dc26b", sort_order: 2 },
  { slug: "education",  name: "Education & study", color: "#a76bff", sort_order: 3 },
  { slug: "life_admin", name: "Life admin basics", color: "#3d7cff", sort_order: 4 },
]);
const catBy = Object.fromEntries(cats.map(c => [c.slug, c.id]));
console.log("categories:", cats.length);

// -------- 3. Tasks
const TASKS = [
  // LANGUAGE
  { slug: "sfi_understand",       cat: "language",   priority: "high",
    title: "Understand what SFI is and how it works",
    explanation: "SFI (Svenska för invandrare) is free tuition in Swedish. Each kommun runs it a little differently, but the national outline is a good place to start." },
  { slug: "sfi_local_kommun",     cat: "language",   priority: "high",
    title: "Find which kommun would run your SFI course",
    explanation: "SFI is delivered by whichever kommun (municipality) you live in. Confirm your intended kommun so you can look up its specific SFI page." },
  { slug: "assess_swedish_level", cat: "language",   priority: "medium",
    title: "Rough self-check of your Swedish level",
    explanation: "Get a rough CEFR band (A1/A2/B1…) so SFI or Komvux can place you correctly. Nothing formal, just a starting point." },
  { slug: "gather_school_records", cat: "language",  priority: "low",
    title: "Gather previous school records",
    explanation: "Certificates, transcripts, any evidence of prior study. SFI/Komvux may ask, and translations take time." },
  { slug: "beyond_sfi",           cat: "language",   priority: "low",
    title: "Read about what comes after SFI",
    explanation: "After SFI most people continue with Swedish as a Second Language (SAS) through Komvux to reach a level that unlocks work and study." },

  // EMPLOYMENT
  { slug: "swedish_cv",           cat: "employment", priority: "high",
    title: "Write a Swedish-style CV",
    explanation: "Swedish CVs are short and direct. Include a photo if you like, keep it to 1-2 pages, and lead with recent work." },
  { slug: "cover_letter_template",cat: "employment", priority: "medium",
    title: "Prepare a cover-letter template you can adapt",
    explanation: "One base template you can tailor per application. Keeps the barrier low so you actually apply." },
  { slug: "bookmark_job_boards",  cat: "employment", priority: "medium",
    title: "Bookmark the main Swedish job boards",
    explanation: "The three that most people use. Set aside 20 minutes per week to skim them." },
  { slug: "understand_arbetsformedlingen", cat: "employment", priority: "medium",
    title: "Learn how Arbetsförmedlingen works",
    explanation: "Free public employment service. Once folkbokförd, registering opens up support programmes; understanding it now saves time later." },
  { slug: "start_job_search",     cat: "employment", priority: "medium",
    title: "Start browsing jobs weekly and note what looks good",
    explanation: "Even before you can apply, browsing regularly builds a feel for the market and turns up realistic targets." },

  // EDUCATION
  { slug: "research_komvux",      cat: "education",  priority: "medium",
    title: "Look into Komvux (adult education)",
    explanation: "Free adult education covering everything from primary-level catch-up to university-prep courses. Runs alongside SFI." },
  { slug: "research_higher_ed",   cat: "education",  priority: "low",
    title: "Look at higher-education options (if relevant)",
    explanation: "Universities and yrkeshögskola (vocational) programs. Free for Swedish citizens; CSN can cover living costs." },
  { slug: "understand_csn",       cat: "education",  priority: "low",
    title: "Understand student finance (CSN)",
    explanation: "CSN pays out study grants and student loans to people studying in Sweden. Rules depend on age and course type." },

  // LIFE ADMIN
  { slug: "understand_folkbokforing", cat: "life_admin", priority: "high",
    title: "Understand folkbokföring (why it unlocks everything)",
    explanation: "Population registration at Skatteverket. Almost everything (bank, healthcare, BankID) needs this. Cannot be done from abroad." },
  { slug: "understand_bankid",    cat: "life_admin", priority: "medium",
    title: "Understand BankID (needed for nearly every online service)",
    explanation: "Digital ID issued through a Swedish bank; unlocks 1177, Skatteverket, Försäkringskassan, Arbetsförmedlingen and more." },
  { slug: "bookmark_1177",        cat: "life_admin", priority: "low",
    title: "Bookmark 1177.se (healthcare portal)",
    explanation: "Once you have BankID and are folkbokförd, everything healthcare-related happens through 1177." },
  { slug: "personnummer_basics",  cat: "life_admin", priority: "medium",
    title: "Learn what personnummer is and how it works",
    explanation: "The Swedish personal identity number, assigned when you register at Skatteverket. It follows you everywhere." },
];

const insertedTasks = await req("/tasks", "POST", TASKS.map(t => ({
  slug: t.slug,
  title: t.title,
  explanation: t.explanation,
  category_id: catBy[t.cat],
  phase_id: phase.id,
  priority: t.priority,
  status: "not_started",
  mode: "either",
  assigned_to: "linus",
  can_prepare_early: true,
  requires_folkbokforing: false,
})));
const taskBy = Object.fromEntries(insertedTasks.map(t => [t.slug, t.id]));
console.log("tasks:", insertedTasks.length);

// -------- 4. Useful links per task
const LINKS = [
  ["sfi_understand", "Skolverket: SFI overview", "https://www.skolverket.se/skolformer/vuxenutbildning/utbildning-i-svenska-for-invandrare-sfi"],
  ["sfi_understand", "Informationsverige: SFI (English)", "https://www.informationsverige.se/en/jag-har-fatt-uppehallstillstand/etablering/svenska-for-invandrare-sfi/"],
  ["sfi_local_kommun", "Full list of kommuns (SKR)", "https://skr.se/skr/tjanster/kommunerochregioner.431.html"],
  ["assess_swedish_level", "Council of Europe self-assessment grid", "https://europa.eu/europass/en/self-assessment-grid"],
  ["beyond_sfi", "Skolverket: Komvux", "https://www.skolverket.se/skolformer/vuxenutbildning/kommunal-vuxenutbildning"],
  ["swedish_cv", "Arbetsförmedlingen: writing a CV", "https://arbetsformedlingen.se/for-arbetssokande/tips-och-rad/skriv-ett-cv"],
  ["cover_letter_template", "Arbetsförmedlingen: writing a cover letter", "https://arbetsformedlingen.se/for-arbetssokande/tips-och-rad/skriv-ett-personligt-brev"],
  ["bookmark_job_boards", "Platsbanken (national)", "https://arbetsformedlingen.se/platsbanken"],
  ["bookmark_job_boards", "Blocket Jobb", "https://jobb.blocket.se"],
  ["bookmark_job_boards", "LinkedIn Jobs (Sweden)", "https://www.linkedin.com/jobs/search/?location=Sweden"],
  ["understand_arbetsformedlingen", "Arbetsförmedlingen (English)", "https://arbetsformedlingen.se/other-languages/english-engelska"],
  ["research_komvux", "Skolverket: Komvux overview", "https://www.skolverket.se/skolformer/vuxenutbildning"],
  ["research_higher_ed", "universityadmissions.se (English)", "https://www.universityadmissions.se/en/"],
  ["research_higher_ed", "Yrkeshögskolan (vocational)", "https://www.myh.se/"],
  ["understand_csn", "CSN (English)", "https://www.csn.se/languages/english.html"],
  ["understand_folkbokforing", "Skatteverket: moving to Sweden (English)", "https://www.skatteverket.se/servicelankar/otherlanguages/inenglish/individualsandemployees/livinginsweden/movingtoswedenfromabroad.4.7be5268414bea064694c40c.html"],
  ["understand_bankid", "BankID (English)", "https://www.bankid.com/en/"],
  ["bookmark_1177", "1177.se", "https://www.1177.se/"],
  ["personnummer_basics", "Skatteverket: personal identity number", "https://www.skatteverket.se/servicelankar/otherlanguages/inenglish/individualsandemployees/livinginsweden/personalidentitynumberandcoordinationnumber.4.2cf1b5cd163796a5c8b4295.html"],
];
const linkRows = LINKS.map(([slug, label, url]) => ({
  task_id: taskBy[slug], label, url, is_official: true,
}));
const insertedLinks = await req("/links", "POST", linkRows);
console.log("links:", insertedLinks.length);

console.log("\nDONE");
