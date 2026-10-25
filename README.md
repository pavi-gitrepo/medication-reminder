# Medication Reminder — Patient + Caregiver Prototype

## Setup
1. Install Node.js 20+.
2. Create a Supabase project at https://supabase.com/dashboard.
3. In SQL Editor, run `schema.sql` once in a new, empty project.
4. In Authentication > Users, create two users with confirmed email addresses: one patient and one caregiver. Use fictional identities for testing.
5. Copy their UUIDs from Authentication > Users. In SQL Editor run the following, replacing UUID placeholders:

```sql
insert into public.profiles(id,display_name,role) values
 ('PATIENT_UUID','Test Patient','patient'),
 ('CAREGIVER_UUID','Test Caregiver','caregiver');
insert into public.caregiver_patients(caregiver_id,patient_id)
values ('CAREGIVER_UUID','PATIENT_UUID');
```

Only run the provisioning SQL as an administrator in Supabase SQL Editor. Never put the service-role key in browser code. No public self-signup is implemented.

6. In Project Settings > API (or Connect), copy the Project URL and publishable/anon key.
7. Copy `.env.example` to `.env.local`, then fill the two values. Never use a secret/service-role key here.
8. In this folder, run `npm install` then `npm run dev`. Open the localhost URL shown by Vite.
9. Sign in as caregiver, add a fictional medication and schedule. Sign out and sign in as patient, then click **I took this medication**. Sign back in as caregiver to see the confirmation.

## Limitations / important safety notes
- Demonstration only. No AI, phone calls, caregiver escalation, real scheduling, or Arduino synchronization yet.
- Medication reminder times are interpreted as the local timezone of the person using the app; this is not suitable for patients/caregivers in different timezones. A production system needs a patient timezone (IANA), timezone-aware scheduling, DST handling, and reliable background jobs.
- The patient button records **patient-reported taken**, not proof of ingestion.
- No clinical instructions or automatic medication adjustments.
- Free database hosting, authentication and TLS do not establish HIPAA compliance. Use fictional data until privacy/legal requirements, consent, vendor agreements, audit controls and security reviews are completed.
- RLS restricts each patient and linked caregiver. User/relationship provisioning is admin-only. For production, add invitation/acceptance and revocation workflows, MFA, rate limits, server-side auditing, backup/recovery and monitoring.
- Daily confirmation only: this MVP supports one reminder time per medication per day. Add a separate medication schedules/dose occurrences model for multiple daily doses and historical versioning.
- Confirmation UI shows 'not confirmed today' even before reminder time. This is not a missed-dose determination.
- For testing with SQL Editor, remember its admin role bypasses RLS; test access boundaries by logging in with distinct patient/caregiver accounts.
