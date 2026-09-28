-- Linus till Sverige: focused pre-arrival seed.
-- Wipes existing tasks/categories/phases/links and re-seeds with a small,
-- opinionated list of things Linus can start now, from anywhere. Contacts,
-- info_records and profiles are preserved.
--
-- Safe to re-run. Run this AFTER schema.sql.

-- ----------------------------------------------------------------------------
-- Reset app data (leave contacts, info_records, profiles alone)
-- ----------------------------------------------------------------------------
delete from public.links;
delete from public.subtasks;
delete from public.comments;
delete from public.task_dependencies;
delete from public.tasks;
delete from public.categories;
delete from public.phases;

-- ----------------------------------------------------------------------------
-- One phase: prepare before arriving
-- ----------------------------------------------------------------------------
insert into public.phases (slug, name, sort_order) values
  ('prepare_now', 'Before arriving in Sweden', 1);

-- ----------------------------------------------------------------------------
-- Four categories, focused
-- ----------------------------------------------------------------------------
insert into public.categories (slug, name, color, sort_order) values
  ('language',   'Language (SFI)',      '#e5a02f', 1),
  ('employment', 'Employment',          '#4dc26b', 2),
  ('education',  'Education & study',   '#a76bff', 3),
  ('life_admin', 'Life admin basics',   '#3d7cff', 4);

-- ----------------------------------------------------------------------------
-- Helper: idempotent task loader
-- ----------------------------------------------------------------------------
create or replace function public._seed_task(
  p_slug text,
  p_title text,
  p_explanation text,
  p_phase_slug text,
  p_category_slug text,
  p_priority text default 'medium',
  p_mode text default 'either',
  p_assigned_to text default 'linus',
  p_can_prepare_early boolean default true,
  p_requires_folkbokforing boolean default false
) returns void language plpgsql as $$
begin
  insert into public.tasks (
    slug, title, explanation, phase_id, category_id,
    priority, mode, assigned_to, can_prepare_early, requires_folkbokforing
  )
  select
    p_slug, p_title, p_explanation,
    (select id from public.phases where slug = p_phase_slug),
    (select id from public.categories where slug = p_category_slug),
    p_priority, p_mode, p_assigned_to, p_can_prepare_early, p_requires_folkbokforing
  on conflict (slug) do nothing;
end;
$$;

-- Helper: attach a useful link to a task by slug.
create or replace function public._seed_link(
  p_task_slug text, p_label text, p_url text, p_is_official boolean default true
) returns void language plpgsql as $$
begin
  insert into public.links (task_id, label, url, is_official)
  select id, p_label, p_url, p_is_official
  from public.tasks where slug = p_task_slug;
end;
$$;

-- ============================================================================
-- Language / SFI
-- ============================================================================
select public._seed_task('sfi_understand',   'Understand what SFI is and how it works',
  'SFI (Svenska för invandrare) is free tuition in Swedish. Each kommun runs it a little differently, but the national outline is a good place to start.',
  'prepare_now', 'language', 'high');
select public._seed_link('sfi_understand', 'Skolverket: what SFI is (Swedish)', 'https://www.skolverket.se/skolformer/vuxenutbildning/utbildning-i-svenska-for-invandrare-sfi');
select public._seed_link('sfi_understand', 'Informationsverige: SFI overview (English)', 'https://www.informationsverige.se/en/jag-har-fatt-uppehallstillstand/etablering/svenska-for-invandrare-sfi/');

select public._seed_task('sfi_local_kommun', 'Find which kommun would run your SFI course',
  'SFI is delivered by whichever kommun (municipality) you live in. Confirm your intended kommun so you can look up its specific SFI page.',
  'prepare_now', 'language', 'high');
select public._seed_link('sfi_local_kommun', 'Full list of kommuns (SKR)', 'https://skr.se/skr/tjanster/kommunerochregioner.431.html');

select public._seed_task('assess_swedish_level', 'Rough self-check of your Swedish level',
  'Get a rough CEFR band (A1/A2/B1…) so SFI or Komvux can place you correctly. Nothing formal, just a starting point.',
  'prepare_now', 'language', 'medium');
select public._seed_link('assess_swedish_level', 'Council of Europe self-assessment grid', 'https://europa.eu/europass/en/self-assessment-grid');

select public._seed_task('gather_school_records', 'Gather previous school records',
  'Certificates, transcripts, any evidence of prior study. SFI/Komvux may ask, and translations take time.',
  'prepare_now', 'language', 'low');

select public._seed_task('beyond_sfi', 'Read about what comes after SFI',
  'After SFI most people continue with Swedish as a Second Language (SAS) through Komvux to reach a level that unlocks work and study.',
  'prepare_now', 'language', 'low');
select public._seed_link('beyond_sfi', 'Skolverket: Komvux', 'https://www.skolverket.se/skolformer/vuxenutbildning/kommunal-vuxenutbildning');

-- ============================================================================
-- Employment
-- ============================================================================
select public._seed_task('swedish_cv', 'Write a Swedish-style CV',
  'Swedish CVs are short and direct. Include a photo if you like, keep it to 1-2 pages, and lead with recent work.',
  'prepare_now', 'employment', 'high');
select public._seed_link('swedish_cv', 'Arbetsförmedlingen: writing a CV', 'https://arbetsformedlingen.se/for-arbetssokande/tips-och-rad/skriv-ett-cv');

select public._seed_task('cover_letter_template', 'Prepare a cover-letter template you can adapt',
  'One base template you can tailor per application. Keeps the barrier low so you actually apply.',
  'prepare_now', 'employment', 'medium');
select public._seed_link('cover_letter_template', 'Arbetsförmedlingen: writing a cover letter', 'https://arbetsformedlingen.se/for-arbetssokande/tips-och-rad/skriv-ett-personligt-brev');

select public._seed_task('bookmark_job_boards', 'Bookmark the main Swedish job boards',
  'The three that most people use. Set aside 20 minutes per week to skim them.',
  'prepare_now', 'employment', 'medium');
select public._seed_link('bookmark_job_boards', 'Platsbanken (national)', 'https://arbetsformedlingen.se/platsbanken');
select public._seed_link('bookmark_job_boards', 'Blocket Jobb', 'https://jobb.blocket.se');
select public._seed_link('bookmark_job_boards', 'LinkedIn Jobs (Sweden)', 'https://www.linkedin.com/jobs/search/?location=Sweden');

select public._seed_task('understand_arbetsformedlingen', 'Learn how Arbetsförmedlingen works',
  'Free public employment service. Once folkbokförd, registering opens up support programmes; understanding it now saves time later.',
  'prepare_now', 'employment', 'medium');
select public._seed_link('understand_arbetsformedlingen', 'Arbetsförmedlingen (English)', 'https://arbetsformedlingen.se/other-languages/english-engelska');

select public._seed_task('start_job_search', 'Start browsing jobs weekly and note what looks good',
  'Even before you can apply, browsing regularly builds a feel for the market and turns up realistic targets.',
  'prepare_now', 'employment', 'medium');

-- ============================================================================
-- Education & study
-- ============================================================================
select public._seed_task('research_komvux', 'Look into Komvux (adult education)',
  'Free adult education covering everything from primary-level catch-up to university-prep courses. Runs alongside SFI.',
  'prepare_now', 'education', 'medium');
select public._seed_link('research_komvux', 'Skolverket: Komvux overview', 'https://www.skolverket.se/skolformer/vuxenutbildning');

select public._seed_task('research_higher_ed', 'Look at higher-education options (if relevant)',
  'Universities and yrkeshögskola (vocational) programs. Free for Swedish citizens; CSN can cover living costs.',
  'prepare_now', 'education', 'low');
select public._seed_link('research_higher_ed', 'universityadmissions.se (English)', 'https://www.universityadmissions.se/en/');
select public._seed_link('research_higher_ed', 'Yrkeshögskolan (vocational)', 'https://www.myh.se/');

select public._seed_task('understand_csn', 'Understand student finance (CSN)',
  'CSN pays out study grants and student loans to people studying in Sweden. Rules depend on age and course type.',
  'prepare_now', 'education', 'low');
select public._seed_link('understand_csn', 'CSN (English)', 'https://www.csn.se/languages/english.html');

-- ============================================================================
-- Life admin basics
-- ============================================================================
select public._seed_task('understand_folkbokforing', 'Understand folkbokföring (why it unlocks everything)',
  'Population registration at Skatteverket. Almost everything (bank, healthcare, BankID) needs this. Cannot be done from abroad.',
  'prepare_now', 'life_admin', 'high');
select public._seed_link('understand_folkbokforing', 'Skatteverket: moving to Sweden (English)', 'https://www.skatteverket.se/servicelankar/otherlanguages/inenglish/individualsandemployees/livinginsweden/movingtoswedenfromabroad.4.7be5268414bea064694c40c.html');

select public._seed_task('understand_bankid', 'Understand BankID (needed for nearly every online service)',
  'Digital ID issued through a Swedish bank; unlocks 1177, Skatteverket, Försäkringskassan, Arbetsförmedlingen and more.',
  'prepare_now', 'life_admin', 'medium');
select public._seed_link('understand_bankid', 'BankID (English)', 'https://www.bankid.com/en/');

select public._seed_task('bookmark_1177', 'Bookmark 1177.se (healthcare portal)',
  'Once you have BankID and are folkbokförd, everything healthcare-related happens through 1177.',
  'prepare_now', 'life_admin', 'low');
select public._seed_link('bookmark_1177', '1177.se', 'https://www.1177.se/');

select public._seed_task('personnummer_basics', 'Learn what personnummer is and how it works',
  'The Swedish personal identity number, assigned when you register at Skatteverket. It follows you everywhere.',
  'prepare_now', 'life_admin', 'medium');
select public._seed_link('personnummer_basics', 'Skatteverket: personal identity number', 'https://www.skatteverket.se/servicelankar/otherlanguages/inenglish/individualsandemployees/livinginsweden/personalidentitynumberandcoordinationnumber.4.2cf1b5cd163796a5c8b4295.html');

-- ----------------------------------------------------------------------------
-- Info-record placeholders (only insert if the vault is empty of these keys)
-- ----------------------------------------------------------------------------
insert into public.info_records (key, notes, visibility)
select v.key, v.notes, v.visibility
from (values
  ('swedish_personal_number', 'YYYYMMDD-XXXX. Enter once assigned.', 'private_to_linus'),
  ('passport_number',         'Swedish passport number, expiry, issuing authority.', 'private_to_linus'),
  ('intended_swedish_address','Full street address including postcode.', 'shared')
) as v(key, notes, visibility)
where not exists (
  select 1 from public.info_records ir where ir.key = v.key
);
