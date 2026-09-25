-- Linus's Sweden Move: seed data.
-- Idempotent: safe to re-run. Only inserts rows that don't already exist by slug.
-- Run this AFTER schema.sql.

-- ----------------------------------------------------------------------------
-- Phases
-- ----------------------------------------------------------------------------
insert into public.phases (slug, name, sort_order) values
  ('prepare_now',              'Prepare now',                 1),
  ('december_visit',           'December visit to Sweden',    2),
  ('waiting_for_registration', 'Waiting for registration',    3),
  ('before_leaving_england',   'Before leaving England',      4),
  ('first_week',               'First week in Sweden',        5),
  ('first_month',              'First month in Sweden',       6),
  ('longer_term',              'Longer-term goals',           7)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Categories
-- ----------------------------------------------------------------------------
insert into public.categories (slug, name, color, sort_order) values
  ('travel_licence',   'Travel & licence',   '#a76bff',  1),
  ('folkbokforing',    'Folkbokföring',      '#3fa4ff',  2),
  ('banking',          'Banking & digital',  '#2fd4d4',  3),
  ('employment',       'Employment',         '#4dc26b',  4),
  ('language',         'Language & studies', '#e5a02f',  5),
  ('accommodation',    'Accommodation',      '#ff8a5c',  6),
  ('public_services',  'Public services',    '#ee5b8b',  7),
  ('leaving_england',  'Leaving England',    '#8892a0',  8),
  ('arrival',          'Arrival in Sweden',  '#5cffb0',  9),
  ('support',          'Support network',    '#c9a0ff', 10)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Task loader helper
-- Inserts a task by slug (idempotent); resolves phase/category by their slug.
-- ----------------------------------------------------------------------------
create or replace function public._seed_task(
  p_slug       text,
  p_title      text,
  p_explanation text,
  p_phase_slug text,
  p_category_slug text,
  p_priority   text default 'medium',
  p_mode       text default 'either',
  p_assigned_to text default 'both',
  p_can_prepare_early boolean default false,
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

create or replace function public._seed_dep(child_slug text, parent_slug text)
returns void language plpgsql as $$
begin
  insert into public.task_dependencies (task_id, depends_on_task_id)
  select
    (select id from public.tasks where slug = child_slug),
    (select id from public.tasks where slug = parent_slug)
  on conflict do nothing;
end;
$$;

-- ----------------------------------------------------------------------------
-- Tasks
-- ----------------------------------------------------------------------------

-- Travel & licence
select public._seed_task('approval_dec_visit', 'Get approval for the December visit', 'Confirm with probation that Linus is permitted to travel to Sweden in December.', 'prepare_now', 'travel_licence', 'urgent', 'in_person', 'linus', true, false);
select public._seed_task('confirm_travel_dates', 'Confirm permitted travel dates and reporting conditions', 'Once approval is given, note exact dates, any check-in requirements, and any restrictions.', 'prepare_now', 'travel_licence', 'high', 'either', 'linus');
select public._seed_task('book_dec_journey', 'Book the December journey', 'Flight or ferry + onward travel to the Swedish address.', 'prepare_now', 'travel_licence', 'high', 'online', 'oscar');
select public._seed_task('confirm_licence_end', 'Confirm Linus''s licence end date', 'Written confirmation of when licence conditions end.', 'prepare_now', 'travel_licence', 'high', 'either', 'linus');
select public._seed_task('confirm_move_date', 'Confirm the permanent move date (Feb 2027)', 'Fix a target date so everything else can plan against it.', 'prepare_now', 'travel_licence', 'high', 'either', 'both');
select public._seed_task('plan_final_journey', 'Plan the final journey from England to Sweden', 'Route, transport, luggage, timing.', 'before_leaving_england', 'travel_licence', 'medium', 'either', 'both');

-- Folkbokföring
select public._seed_task('check_skatteverket_reqs', 'Check current Skatteverket requirements', 'Rules for a Swedish citizen moving back to Sweden. Requirements change; verify close to the visit.', 'prepare_now', 'folkbokforing', 'urgent', 'online', 'oscar', true, false);
select public._seed_task('confirm_docs_to_bring', 'Confirm which documents to bring', 'Passport, proof of address, any other evidence Skatteverket asks for.', 'prepare_now', 'folkbokforing', 'urgent', 'either', 'oscar');
select public._seed_task('gather_passport_spin', 'Gather Swedish passport and personal identity number', 'Locate the passport, note SPIN, store securely in Vault.', 'prepare_now', 'folkbokforing', 'urgent', 'either', 'linus');
select public._seed_task('gather_address_proof', 'Gather proof of intended Swedish address', 'Letter or written statement from the person Linus will live with.', 'prepare_now', 'folkbokforing', 'high', 'either', 'oscar');
select public._seed_task('locate_service_centre', 'Locate the appropriate Swedish state service centre', 'Find the nearest Statens servicecenter that handles folkbokföring.', 'prepare_now', 'folkbokforing', 'high', 'online', 'oscar');
select public._seed_task('check_appointment_needed', 'Check whether an appointment is required', 'Some service centres are drop-in, others require booking.', 'prepare_now', 'folkbokforing', 'high', 'online', 'oscar');
select public._seed_task('attend_service_centre', 'Attend the service centre in person', 'Linus must appear in person for the identity check.', 'december_visit', 'folkbokforing', 'urgent', 'in_person', 'linus');
select public._seed_task('complete_identity_check', 'Complete the identity check', 'In-person ID verification at the service centre.', 'december_visit', 'folkbokforing', 'urgent', 'in_person', 'linus');
select public._seed_task('submit_notification', 'Submit the notification of moving to Sweden', 'Flyttanmälan filed at the service centre.', 'december_visit', 'folkbokforing', 'urgent', 'in_person', 'linus');
select public._seed_task('record_case_number', 'Record the case or reference number', 'Store in the Vault so we can chase it up.', 'december_visit', 'folkbokforing', 'high', 'either', 'both');
select public._seed_task('upload_submitted_docs', 'Upload copies of the submitted documents', 'Photograph everything that was handed in.', 'december_visit', 'folkbokforing', 'medium', 'either', 'linus');
select public._seed_task('track_application_progress', 'Track the application''s progress', 'Weekly check on the case status.', 'waiting_for_registration', 'folkbokforing', 'medium', 'online', 'oscar');
select public._seed_task('respond_skatteverket_requests', 'Respond to any Skatteverket requests', 'If they ask for more information, act quickly.', 'waiting_for_registration', 'folkbokforing', 'high', 'either', 'both');
select public._seed_task('record_registration_decision', 'Record the official population-registration decision', 'The date Skatteverket registers Linus. This unlocks many later steps.', 'waiting_for_registration', 'folkbokforing', 'high', 'either', 'oscar');

-- Banking & digital
select public._seed_task('compare_swedish_banks', 'Compare suitable Swedish bank accounts', 'Shortlist 2-3 banks based on ID requirements and fees.', 'prepare_now', 'banking', 'medium', 'online', 'oscar', true, false);
select public._seed_task('check_bank_id_reqs', 'Check each bank''s identification requirements', 'Some accept passport only, others need folkbokföring.', 'prepare_now', 'banking', 'medium', 'online', 'oscar');
select public._seed_task('collect_bank_docs', 'Collect the documents required by the chosen bank', 'ID, address proof, any employment info if needed.', 'prepare_now', 'banking', 'medium', 'either', 'linus');
select public._seed_task('book_bank_appointment', 'Book a bank appointment if necessary', 'Some accounts need in-person opening.', 'first_week', 'banking', 'medium', 'online', 'linus');
select public._seed_task('open_bank_account', 'Open or reactivate a Swedish bank account', 'May require folkbokföring first.', 'first_week', 'banking', 'high', 'in_person', 'linus', false, true);
select public._seed_task('apply_bankid', 'Apply for BankID', 'Unlocks nearly every Swedish online service. Needs a bank account first.', 'first_month', 'banking', 'urgent', 'online', 'linus');
select public._seed_task('test_online_services', 'Test access to important Swedish online services', '1177, Skatteverket, Försäkringskassan, Arbetsförmedlingen.', 'first_month', 'banking', 'medium', 'online', 'linus');
select public._seed_task('consider_id_card', 'Consider obtaining a Swedish national ID card', 'Useful as a portable ID; requires folkbokföring.', 'first_month', 'banking', 'low', 'in_person', 'linus', false, true);
select public._seed_task('swedish_mobile', 'Set up a Swedish mobile number', 'Prepaid SIM is fine initially.', 'first_week', 'banking', 'high', 'either', 'linus');
select public._seed_task('setup_kivra', 'Set up a digital mailbox (Kivra)', 'Receives official post digitally. Needs BankID.', 'first_month', 'banking', 'medium', 'online', 'linus');

-- Employment
select public._seed_task('swedish_cv', 'Create a Swedish CV', 'Swedish CV conventions differ from UK; include personnummer once available.', 'prepare_now', 'employment', 'medium', 'either', 'linus', true, false);
select public._seed_task('cover_letter_template', 'Prepare a general cover-letter template', 'One base template Linus can tailor per application.', 'prepare_now', 'employment', 'low', 'either', 'linus', true, false);
select public._seed_task('collect_references', 'Collect employment references and certificates', 'Scans of everything from UK employers.', 'prepare_now', 'employment', 'medium', 'either', 'linus');
select public._seed_task('translate_qualifications', 'Translate important qualifications', 'Certified translations for anything Linus wants recognised in Sweden.', 'prepare_now', 'employment', 'low', 'either', 'linus');
select public._seed_task('identify_work_types', 'Identify suitable types of work', 'Shortlist realistic roles based on skills and post-release circumstances.', 'prepare_now', 'employment', 'medium', 'either', 'both');
select public._seed_task('list_potential_employers', 'Create a list of potential employers', 'Local companies, staffing agencies, sectors that hire quickly.', 'prepare_now', 'employment', 'low', 'either', 'oscar');
select public._seed_task('start_job_search', 'Begin searching for jobs', 'Platsbanken, Blocket Jobb, LinkedIn. Log everything in the app.', 'prepare_now', 'employment', 'medium', 'online', 'linus');
select public._seed_task('register_arbetsformedlingen', 'Register with Arbetsförmedlingen if appropriate', 'Free job-support service; some programmes require folkbokföring.', 'first_month', 'employment', 'medium', 'either', 'linus', false, true);
select public._seed_task('track_applications', 'Track job applications and interviews', 'Ongoing log of every application, response, and interview.', 'prepare_now', 'employment', 'medium', 'either', 'linus');
select public._seed_task('employer_contacts', 'Record employer contacts and follow-up dates', 'Names, phone numbers, dates promised for follow-up.', 'prepare_now', 'employment', 'low', 'either', 'linus');

-- Language & studies
select public._seed_task('assess_swedish_level', 'Assess Linus''s current Swedish level', 'Self-assessment plus a rough CEFR estimate.', 'prepare_now', 'language', 'medium', 'either', 'linus');
select public._seed_task('research_sfi_komvux', 'Research suitable SFI or Komvux courses', 'Free Swedish tuition; availability depends on kommun.', 'prepare_now', 'language', 'medium', 'online', 'oscar');
select public._seed_task('check_local_application_reqs', 'Check the local application requirements', 'Every kommun has slightly different rules.', 'prepare_now', 'language', 'medium', 'online', 'oscar');
select public._seed_task('gather_education_records', 'Gather previous education records', 'Certificates, transcripts, anything Komvux might ask for.', 'prepare_now', 'language', 'low', 'either', 'linus');
select public._seed_task('apply_sfi', 'Apply for SFI when eligible', 'Most kommuns require folkbokföring at that address.', 'first_month', 'language', 'high', 'either', 'linus', false, true);
select public._seed_task('record_course_dates', 'Record course dates and attendance information', 'In the Vault so we can plan around it.', 'first_month', 'language', 'low', 'either', 'linus');
select public._seed_task('language_goals', 'Create longer-term language goals', '12-month plan; e.g. reach B1 within a year.', 'longer_term', 'language', 'low', 'either', 'linus');
select public._seed_task('research_beyond_sfi', 'Research progression beyond SFI (SAS)', 'Swedish as a Second Language, university access.', 'longer_term', 'language', 'low', 'online', 'linus');

-- Accommodation
select public._seed_task('confirm_initial_address', 'Confirm where Linus will initially live', 'Address, contact person, arrival arrangements.', 'prepare_now', 'accommodation', 'urgent', 'either', 'oscar');
select public._seed_task('record_full_address', 'Record full Swedish address and contact person', 'Store in the Vault. Needed for folkbokföring and everything else.', 'prepare_now', 'accommodation', 'urgent', 'either', 'oscar');
select public._seed_task('accommodation_budget', 'Prepare a basic accommodation budget', 'Rent contribution, utilities, food.', 'prepare_now', 'accommodation', 'medium', 'either', 'both');
select public._seed_task('search_longer_term_housing', 'Search for longer-term accommodation', 'Rental options, sublet options, second-hand market.', 'first_month', 'accommodation', 'medium', 'online', 'both');
select public._seed_task('register_housing_queues', 'Register with relevant housing queues', 'Bostadsförmedlingen and other kommun queues; queue time is currency.', 'prepare_now', 'accommodation', 'high', 'online', 'oscar', true, false);
select public._seed_task('track_housing_apps', 'Track housing applications', 'Ongoing log of what''s been applied for.', 'first_month', 'accommodation', 'medium', 'either', 'both');
select public._seed_task('store_landlord_details', 'Store landlord or housing-company contacts', 'In Vault contacts.', 'prepare_now', 'accommodation', 'low', 'either', 'oscar');
select public._seed_task('home_insurance', 'Arrange home insurance when required', 'Hemförsäkring is essentially mandatory in Sweden.', 'first_month', 'accommodation', 'medium', 'online', 'linus');

-- Public services
select public._seed_task('check_forsakringskassan', 'Check eligibility with Försäkringskassan', 'Registration is separate from folkbokföring but often linked.', 'first_month', 'public_services', 'medium', 'online', 'linus', false, true);
select public._seed_task('check_financial_support', 'Determine whether financial-support applications are appropriate', 'Do NOT assume entitlement; check case by case.', 'first_month', 'public_services', 'medium', 'either', 'oscar');
select public._seed_task('register_healthcare', 'Register with the relevant healthcare services', 'Region-specific; folkbokföring usually needed.', 'first_month', 'public_services', 'high', 'online', 'linus', false, true);
select public._seed_task('choose_health_centre', 'Choose or register with a local health centre (vårdcentral)', 'Named GP-equivalent; can list preferences.', 'first_month', 'public_services', 'medium', 'online', 'linus');
select public._seed_task('setup_1177', 'Set up access to 1177', 'Healthcare online portal; needs BankID.', 'first_month', 'public_services', 'medium', 'online', 'linus');
select public._seed_task('identify_social_care', 'Identify local social-care or practical support if needed', 'Kommun-run support services.', 'first_month', 'public_services', 'low', 'either', 'oscar');
select public._seed_task('record_municipal_contacts', 'Record important municipal contact details', 'Kommun switchboard, housing, socialtjänst.', 'prepare_now', 'public_services', 'low', 'either', 'oscar');
select public._seed_task('emergency_contact_list', 'Create an emergency contact list', 'Family, closest friend, medical contact, kommun.', 'prepare_now', 'public_services', 'medium', 'either', 'both');

-- Leaving England
select public._seed_task('confirm_probation_ended', 'Confirm all probation or licence requirements have ended', 'Written confirmation before departure.', 'before_leaving_england', 'leaving_england', 'urgent', 'either', 'linus');
select public._seed_task('give_accommodation_notice', 'Give required notice for current UK accommodation', 'Whatever notice period applies.', 'before_leaving_england', 'leaving_england', 'high', 'either', 'linus');
select public._seed_task('notify_uk_orgs', 'Notify relevant UK organisations of the move', 'HMRC, DWP, NHS, DVLA, bank, insurers.', 'before_leaving_england', 'leaving_england', 'high', 'either', 'linus');
select public._seed_task('transfer_medical_records', 'Arrange transfer of medical records and prescriptions', 'Where transferable; keep copies regardless.', 'before_leaving_england', 'leaving_england', 'medium', 'either', 'linus');
select public._seed_task('review_uk_banking', 'Review UK banking and recurring payments', 'Cancel what''s ending, keep what''s still needed.', 'before_leaving_england', 'leaving_england', 'medium', 'either', 'linus');
select public._seed_task('cancel_utilities', 'Cancel or transfer utilities, subscriptions, phone', 'One list; work through it.', 'before_leaving_england', 'leaving_england', 'medium', 'either', 'linus');
select public._seed_task('redirect_post', 'Redirect important post', 'Royal Mail redirection to Oscar or another trusted UK address.', 'before_leaving_england', 'leaving_england', 'medium', 'either', 'linus');
select public._seed_task('decide_belongings', 'Decide what to sell, store, or take to Sweden', 'One decision per category of stuff.', 'before_leaving_england', 'leaving_england', 'medium', 'either', 'linus');
select public._seed_task('arrange_belongings_transport', 'Arrange transport for belongings', 'Courier, freight, or extra luggage.', 'before_leaving_england', 'leaving_england', 'medium', 'either', 'both');
select public._seed_task('keep_uk_records', 'Keep copies of important UK records', 'Scan everything worth scanning; store in Vault.', 'before_leaving_england', 'leaving_england', 'medium', 'either', 'linus');

-- Arrival
select public._seed_task('confirm_address_access', 'Confirm access to the Swedish address', 'Someone is there when Linus arrives.', 'first_week', 'arrival', 'urgent', 'either', 'oscar');
select public._seed_task('obtain_keys', 'Obtain keys', 'Handed over on arrival.', 'first_week', 'arrival', 'urgent', 'in_person', 'oscar');
select public._seed_task('initial_shop', 'Complete an initial food and household shop', 'First 3 days of food and basics.', 'first_week', 'arrival', 'high', 'in_person', 'both');
select public._seed_task('phone_internet_check', 'Confirm phone and internet access', 'Working SIM, working home wifi.', 'first_week', 'arrival', 'high', 'either', 'linus');
select public._seed_task('learn_local_transport', 'Learn the local public transport', 'SL / Skånetrafiken / Västtrafik card, main routes.', 'first_week', 'arrival', 'medium', 'either', 'linus');
select public._seed_task('confirm_banking_bankid', 'Confirm banking and BankID access', 'Everything logs in as expected.', 'first_month', 'arrival', 'high', 'online', 'linus');
select public._seed_task('attend_scheduled_appts', 'Attend any scheduled appointments', 'Whatever is on the calendar for the first weeks.', 'first_week', 'arrival', 'high', 'in_person', 'linus');
select public._seed_task('review_outstanding_apps', 'Review outstanding applications', 'Weekly triage of anything still open.', 'first_month', 'arrival', 'medium', 'either', 'both');
select public._seed_task('first_month_budget', 'Create a first-month budget', 'What comes in, what goes out.', 'first_week', 'arrival', 'medium', 'either', 'both');
select public._seed_task('weekly_checkin', 'Arrange a weekly check-in with Oscar', 'Fixed day and time; short and honest.', 'first_week', 'arrival', 'high', 'either', 'both');

-- Support network
select public._seed_task('family_contact_list', 'List family and trusted contacts in Sweden', 'Everyone who could realistically be called on.', 'prepare_now', 'support', 'medium', 'either', 'oscar');
select public._seed_task('record_who_helps_with_what', 'Record who can help with different matters', 'One person per topic (housing, health, work, admin).', 'prepare_now', 'support', 'low', 'either', 'oscar');
select public._seed_task('schedule_checkins', 'Arrange regular check-ins between Linus and Oscar', 'Before the move too, not just after.', 'prepare_now', 'support', 'high', 'either', 'both');
select public._seed_task('questions_for_officials', 'Shared list of questions to ask officials', 'Living document; add as things come up.', 'prepare_now', 'support', 'low', 'either', 'both');

-- ----------------------------------------------------------------------------
-- Dependencies
-- ----------------------------------------------------------------------------
select public._seed_dep('confirm_travel_dates', 'approval_dec_visit');
select public._seed_dep('book_dec_journey', 'confirm_travel_dates');
select public._seed_dep('confirm_move_date', 'confirm_licence_end');
select public._seed_dep('plan_final_journey', 'confirm_move_date');

select public._seed_dep('confirm_docs_to_bring', 'check_skatteverket_reqs');
select public._seed_dep('check_appointment_needed', 'locate_service_centre');
select public._seed_dep('attend_service_centre', 'confirm_docs_to_bring');
select public._seed_dep('attend_service_centre', 'gather_passport_spin');
select public._seed_dep('attend_service_centre', 'gather_address_proof');
select public._seed_dep('attend_service_centre', 'check_appointment_needed');
select public._seed_dep('complete_identity_check', 'attend_service_centre');
select public._seed_dep('submit_notification', 'complete_identity_check');
select public._seed_dep('record_case_number', 'submit_notification');
select public._seed_dep('upload_submitted_docs', 'submit_notification');
select public._seed_dep('track_application_progress', 'record_case_number');
select public._seed_dep('record_registration_decision', 'track_application_progress');

select public._seed_dep('check_bank_id_reqs', 'compare_swedish_banks');
select public._seed_dep('collect_bank_docs', 'check_bank_id_reqs');
select public._seed_dep('book_bank_appointment', 'collect_bank_docs');
select public._seed_dep('open_bank_account', 'book_bank_appointment');
select public._seed_dep('apply_bankid', 'open_bank_account');
select public._seed_dep('test_online_services', 'apply_bankid');
select public._seed_dep('setup_kivra', 'apply_bankid');
select public._seed_dep('setup_1177', 'apply_bankid');

select public._seed_dep('list_potential_employers', 'identify_work_types');
select public._seed_dep('start_job_search', 'swedish_cv');

select public._seed_dep('research_sfi_komvux', 'assess_swedish_level');
select public._seed_dep('check_local_application_reqs', 'research_sfi_komvux');
select public._seed_dep('apply_sfi', 'check_local_application_reqs');
select public._seed_dep('record_course_dates', 'apply_sfi');

select public._seed_dep('record_full_address', 'confirm_initial_address');

select public._seed_dep('check_financial_support', 'check_forsakringskassan');
select public._seed_dep('choose_health_centre', 'register_healthcare');

select public._seed_dep('confirm_probation_ended', 'confirm_licence_end');
select public._seed_dep('give_accommodation_notice', 'confirm_move_date');
select public._seed_dep('arrange_belongings_transport', 'decide_belongings');

select public._seed_dep('obtain_keys', 'confirm_address_access');
select public._seed_dep('phone_internet_check', 'swedish_mobile');
select public._seed_dep('confirm_banking_bankid', 'apply_bankid');

select public._seed_dep('record_who_helps_with_what', 'family_contact_list');

-- ----------------------------------------------------------------------------
-- Info-record placeholders (created empty; fill in from the Vault UI)
-- ----------------------------------------------------------------------------
insert into public.info_records (key, notes, visibility)
select v.key, v.notes, v.visibility
from (values
  ('swedish_personal_number', 'YYYYMMDD-XXXX. Enter once known.', 'private_to_linus'),
  ('passport_number',         'Swedish passport number, expiry, issuing authority.', 'private_to_linus'),
  ('initial_swedish_address', 'Full street address including postcode.', 'shared'),
  ('skatteverket_case_number','Assigned after the December visit.', 'shared')
) as v(key, notes, visibility)
where not exists (
  select 1 from public.info_records ir where ir.key = v.key
);
