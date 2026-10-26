# Family learning — 2026-10-26

Entry points: `/#/parent`, `/#/child` (and `/#/family`). One website, separate
Supabase Auth users. This release is deployed to the existing Story Fox project;
it does not replace or widen policies on `public.user_learning_state`.

## First use

1. The parent registers/signs in with their own account, opens Parent, chooses
   the parent role and a nickname. Role is fixed after setup; use a separate
   account for each child.
2. Generate a single-use binding code (15 minutes). The child signs in with a
   different account, opens Child, chooses the child role, and pastes the code.
3. The parent confirms the pending request. Either side can unlink later;
   unlinking immediately revokes record/task access at the database layer.
4. Default: select a child, enter a free-text title and instructions, optionally
   attach files or paste website/cloud-drive share text (including extraction
   codes), and set a deadline. No course selection or Quiz is required.
   Optional: choose course mode to assign one episode and its available modules.
5. The child reads the instructions and resources, completes the work, and can
   upload photos/files or paste a submission link before checking in. Course-mode
   tasks additionally use the existing Watch/Read/Words/Quiz pages. Assigned
   lessons can be opened without unlocking every earlier episode, for that child.
6. Parent approves or requests revision with feedback. Free-text work is completed
   by child check-in and parent confirmation; no automatic course criteria apply.
   Course-mode revisions require new module marks and a new passing Quiz attempt.

Deadlines and displayed times use Asia/Shanghai. Lists refresh after actions,
when returning to the page and about every 45 seconds; unsaved forms/notes are
not replaced automatically. There are no email/push notifications in v1.

## Data and access

Private schema `sf_family_private`: profiles, hashed invites, confirmed/pending
links, public-course grading catalog, assignments, per-attempt events. All tables
have RLS and deny direct client access. Public RPC `sf_family` is SECURITY INVOKER
and calls an authenticated, authorization-checking private function with a fixed
empty search_path. Explicit grants restrict RPC execution to signed-in users.
The catalog write RPC is executable only by service_role.

Every action checks current Auth identity, role, confirmed relationship and task
ownership as appropriate. Parent records return course progress, historic best
scores and recent events only; they do not return wordbanks, saved sentences,
credentials or quiz answer keys. Other families, pending relationships and
unlinked accounts are denied. The original own-account RLS stays unchanged.

`family-lesson-catalog` is a JWT-protected Edge Function, with an additional
Auth getUser check. It fetches only fixed-origin public course files from
`https://yqxyy.netlify.app/data/`, validates course IDs, and uses its built-in
server-side service-role credential to register public metadata/answer keys.
Browser-supplied answer keys or scores are not trusted. The Supabase SDK import
is pinned in deno.json. New courses need no separate manual catalog import:
lesson metadata is prepared when assigning or when a child submits a Quiz.

Quiz answers are graded against those keys in Postgres. Every attempt is
recorded before the old best-score filter, so old best scores cannot substitute
for new homework. Module events are self-reported completion marks; these do not
prove full video viewing or reading. Completed task submissions still require
parent approval. Prior cloud history remains visible separately and does not
complete new work automatically. Review resets the task's evidence cutoff.

Offline event queues are stored under the child's user ID, replayed with stable
UUIDs (server idempotency), and retained on failure. Submission waits for queued
events to sync. Login switches/logout clear dashboard data and invalidate
in-flight UI renders. Parents/guests do not create child learning events.

## Deployment

Remote migrations have been applied and the Edge Function deployed. Matching
migration versions are checked into `supabase/migrations/`. No existing personal
learning rows were modified. Function deployment source is under
`supabase/functions/family-lesson-catalog/`; deploy to the existing project with
JWT verification enabled. Never put service-role credentials in frontend files.

Security advisors: no new warnings from the family tables/functions. The
existing project has leaked-password protection disabled; it was not changed by
this feature. Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

## Verification

- `node --check js/app.js`, `node --check js/family.js`,
  `node --check js/cloud-account.js`, `git diff --check`.
- `node tests/family.test.cjs`: offline queue, every Quiz attempt, historic-best
  compatibility, assigned lesson access, account isolation, logout cleanup.
- `supabase/tests/family-learning.sql`: transactional test fixtures, rolled back;
  real signed-in/anonymous database roles, invite reuse, pending/cross-family
  denial, protected grading keys, wrong answers, fresh task evidence, submission,
  approval, idempotency, private collection exclusion, unlink revocation.
- `tests/family.browser.cjs`: actual Auth/REST/Edge Function with disposable
  confirmed test identities (no email delivery), local frontend source and
  separate browser contexts. Covers binding, publishing, submission, revision,
  rejection of a lower new score despite an old full score, approval, parent
  history and 390px layout. Set FAMILY_E2E_CREDENTIALS to a temporary test-only
  credential file; never use a real family's account. Optional screenshots via
  FAMILY_SCREENSHOT_DIR. Delete test sessions/users and the temporary credential
  file afterwards. This was done for the release verification.
- Existing admin-access, game-access and movie-playback regression suites passed.

Rollback UI: remove the two navigation entries and family script/hooks. Keep the
new private data while investigating; do not drop original learning-state data.


## Private attachments and links

A new private Storage bucket `family-homework` accepts up to 10 MB per file;
assignments/submissions allow five files and ten HTTP(S) links. Supported files:
JPEG/PNG/WebP/GIF/HEIC/HEIF, PDF, Word, Excel, PowerPoint and TXT. HTML/SVG/scripts
are not accepted. Original share text (including extraction codes) is kept.
Storage keys use ASCII names with random UUIDs, while original Chinese filenames
are retained in the private assignment metadata and shown in the UI.
Only the uploader can reference a newly uploaded object when creating/submitting.
The other side gains SELECT only after it is attached to their assignment or
submission and their family link is active. No public bucket URLs are used.
Opening a file creates a 60-second signed URL; unlinking prevents new signed
URLs, while an already issued URL can remain valid until its short expiry.
Upload paths contain the owner's Auth UUID and a random UUID. Abandoned uploads
are private; this release does not automatically delete user files.

Unused own uploads can be deleted through the Storage API; attachments still
referenced by an assignment/submission cannot be deleted directly by clients.

The real-browser test also passed free-text math homework with a private text
attachment, cloud-drive share link/extraction code, child photo upload, parent
reading the submitted photo, approval without any course work, and attachment
access denial after unlink. The optional course workflow remains tested.
