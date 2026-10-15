# Tanishka Pathways CRM

Internal CRM for **Admin** and **Employee** accounts. New enquiries begin at **Lead**, then convert to **Prospect**. The Add prospect shortcut is also available. There is no applicant account or portal.

## Implemented

- Lead creation and conversion, direct prospect creation, full profile editing, Admin assignment, recoverable Delete/Trash/Restore, search, filters, pagination and CSV export.
- Admin task assignment with due dates; employees update their own task progress. Admin activity can be filtered by employee (latest 100 events).
- Dashboard and employee reports derived from persistent records; no production seed applicants.
- Server-side employee isolation, administrator-only global settings and employee management. Employees can verify, approve and issue agreements for their assigned records.
- Private PDF/JPG/PNG uploads, size/content checks, document review, replacement/version history, checklist overrides by country or `country/visa`.
- Verification rejection/resubmission, profile prerequisites, current verified-document checks, and audit history.
- Server-generated, font-embedded A4 PDFs with immutable applicant/template snapshots and versioned private storage.
- Original and signed PDFs stored separately. Downloading never changes signing status. The assigned employee or an administrator reviews uploaded signed copies before accepting them.
- Payments with unique receipt references, appointment scheduling/completion/cancellation and controlled case transitions.
- Transactional optimistic concurrency guards for record mutations; stale profile edits are rejected.
- Company logo and genuine authorized signature uploads, approved agreement terms, and configurable company details.

## Stack

React 19 + TypeScript on Vinext/Vite, Cloudflare Workers, D1 SQLite, private R2 object storage, Drizzle schema/migrations, Zod, pdf-lib and Noto Sans under the SIL Open Font License.

Admin and Employee accounts now support ID/password sign-in, automatically resolving the role from the database. Passwords use salted PBKDF2-SHA256 hashes; random session tokens are stored only as SHA-256 hashes in the database. Cookies are HttpOnly/SameSite=Strict and Secure on HTTPS, with an eight-hour expiry. Login attempts are limited by account and IP. Temporary passwords require a first-login change, and resets revoke all prior sessions. Once password accounts are provisioned, the legacy Sites identity fallback is disabled. Sites hosting, if later approved, remains a separate outer access boundary.

## Free backend setup (no R2 subscription)

For this client's zero recurring backend budget, `npm run build:backend` builds a
Cloudflare Worker with **only D1**, using the existing `tanishq-crm` database.
Keep the Cloudflare account on **Workers Free**. Do not enable R2 or upgrade to a
paid Workers plan for this setup. This does not cancel any existing subscription.

- Applicant records, accounts and files persist on the server across browsers.
- Files are private, stored as D1 BLOB chunks, and served through existing role checks.
- Total file payload is capped at **200 MB**, including old document versions,
  company images and generated agreements. Maximum individual file: **3 MB**.
- SQLite triggers enforce the cap transactionally, even for simultaneous uploads.
  At capacity new uploads stop; existing documents are retained. Admin sees usage.
- D1 Free has a 500 MB per-database limit. The file cap leaves space for database
  overhead and CRM records; provider limits can still stop writes earlier.
- Daily Free limits stop requests instead of charging overages. This may temporarily
  interrupt login, reads or writes. Free-tier CPU limits also apply to PDFs.
- This is a small-workspace configuration, **not 10 GB of free file storage**.
  External hosting/domain fees and other account subscriptions are separate.
- The local/Sites profile still supports its existing R2 files. Switching an existing
  R2-backed production workspace needs a separate file migration; do not switch it
  without migrating and verifying its documents. The supplied production D1 was empty.

### First production deployment

From this project folder:

```sh
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js login
npm run db:migrate:backend
npm run admin:provision:backend
npm run deploy:backend
```

Login happens in your browser; never commit or share account tokens. Provisioning
creates only the initial Admin when the database has no users. Temporary credentials
are saved privately in `.local/production-admin.json`, excluded from Git. Change the
password on first login, update Admin details, then create real employee accounts.
It never overwrites an existing user's password. Keep this file securely with the
client handover; a retry against an existing account does not verify its contents.

The deployed Worker prints an HTTPS `workers.dev` URL. Configure that origin as
`CLOUDFLARE_BACKEND_ORIGIN` in Vercel, then redeploy the Vercel project. Check login,
employee isolation, save/reload, upload/download and generated PDFs on the live
Free plan before client handover. Local tests cannot prove production CPU usage.

For a local isolated check, use `wrangler.backend.json` with `d1 migrations apply
DB --local --persist-to .local/free-backend-test`, then run the built Worker with
`wrangler dev --config dist/server/wrangler.json --persist-to .local/free-backend-test`.
Do not run destructive test fixtures against production data.

### Vercel frontend

`vercel.json` selects Next.js, `npm run build:vercel` and `.next`. Node is pinned to
`22.x`. API requests are forwarded to the configured backend with browser-origin
validation and incoming identity headers removed. Password authentication is
required on the public Cloudflare backend; Sites identity bootstrap is disabled.
Missing backend configuration returns 503, not simulated successful saves.

```sh
npm run build:vercel
npm run start:vercel
node --experimental-strip-types tests/backend-proxy.mjs
node --experimental-strip-types tests/d1-storage.mjs
```

## Run locally

```sh
npm install
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_conscious_thunderbird.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_flawless_lord_tyger.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_blushing_kitty_pryde.sql
node --experimental-strip-types scripts/provision-local.mjs
npm run dev -- --host 127.0.0.1
```

Apply each local migration once. The dev server prints its address, normally `http://127.0.0.1:5173`. Open `/` for Home, `/about` for About, `/sign-in` for login and `/workspace` for the CRM. Provisioning creates `admin`, `employee01`, `employee02` and `employee03` locally. Each has a different random temporary password, written only to the ignored `.local/Login Details.txt` and `.local/account-credentials.json` files with owner-only file permissions. The three employee names and reserved `.invalid` emails are placeholders; update their work details in Employees. Re-running provisioning does not reset existing passwords. Local and hosted databases are separate; `.wrangler/` and test data are never published.

## First-use configuration

1. Sign in with the provisioned Admin ID and change its temporary password. The Admin has all-employee/all-applicant access. Employees can view and edit only assigned applicants and upload their documents; employees can also verify documents, approve applications and issue agreements on those assigned records.
2. In **Settings**, verify the company name/address/contact details, upload the official print-quality PNG/JPG logo and genuine business-authorized signature, and enter the authorized signatory/designation.
3. Paste legally reviewed terms, payment schedules, taxes if applicable, refund/cancellation policy and jurisdiction into the template. Confirm approval only after actual company review. No legal terms, registrations, addresses or signatures are invented by this app. Generation is blocked without this configuration.
4. Set default and country/visa-specific document checklists. An override is a full replacement of the default checklist.
5. In **Employees**, the Admin can create additional employee IDs, update employee details, deactivate accounts, and reset passwords. A newly generated password is displayed once to the Admin; plaintext passwords cannot be retrieved from the database. Provisioning and password reset do not email anyone. There is no applicant login. Hosted access and production account provisioning require a separate deployment step; these local accounts are not published.
6. Add a Lead, convert it to Prospect, complete details, upload documents, verify the documents, submit and approve verification, then record the actual payment in Payments, preview/download its receipt, have Admin verify the required fee or configured advance, then generate, issue and download the agreement as the assigned employee or Admin. Obtain the applicant’s actual signature, upload the received signed PDF, then review and accept it. Download alone never marks an agreement signed.

The UI logo is the matching public company asset from `https://tanishkapathways.com/assets/img/logo-360.webp`, retrieved 13 October 2026. Agreement settings require an administrator-confirmed print asset separately. No signature was extracted or fabricated.

## Checks

```sh
npx tsc --noEmit
npm run build
node tests/workflow.mjs
node --experimental-strip-types tests/auth.mjs
```

Run integration tests **only against a disposable local database**. They create clearly labeled synthetic applicants and temporary test-only company configuration, then restore the settings. Authentication tests check the provisioned temporary credentials without changing them, then use a disposable Admin/Employee fixture to verify password changes and access restrictions. Test fixtures are removed in `finally`. Never run these against real customer data. Workflow tests cover first-stage Prospect creation, prerequisites, rejection/resubmission, multi-page PDF generation/download, signature review, duplicate-payment rejection, case transitions, stale agreements and archives. Permission tests cover employee isolation, disabled users, protected files/settings and identity-header spoofing in local preview.

## Operational boundaries

- Current uploaded-signature flow is a manual review of a physically signed document. It is **not** a cryptographically verified digital-signature service. E-sign provider integration remains a separately configured phase.
- Retention days are a manual review setting, not an automatic deletion job. Before customer use, establish approved retention/deletion procedures, backups, recovery, monitoring and incident response with the hosting provider.
- No blanket verification override is implemented; missing applicant details or required verified documents must be corrected before approval.
- One approved agreement template is configured per workspace. Previous versions retain their complete template snapshot. Separate named template catalogs and dedicated tax/fee-schedule editors are not implemented; approved clauses can specify those terms.
- PDF font coverage is Latin-script Noto Sans. Add and validate an appropriate licensed Unicode font before issuing agreements containing unsupported scripts.
- ID/password authentication is implemented at `/sign-in`. Account roles are database-controlled; there is no public registration. An Admin can reset employee passwords; owner account recovery is an operator task. Private Sites hosting, if enabled later, adds its own platform sign-in boundary.
- Payments are internal records, not a payment gateway. Appointments do not send external invitations.
- The first hosted release is owner-private and contains no local test records. No public sharing is enabled.

## Release verification

The updated implementation passed TypeScript checking, the production build, 43 integration workflow checks and 63 password-authentication/permission checks. Desktop UI was inspected in Chrome. The generated five-page synthetic agreement was rendered and its first/last pages visually inspected. Mobile CSS is implemented; a complete interactive mobile pass is still outstanding.

Private publication was not completed: automatic approval review rejected the helper's external source upload because explicit authorization for that hosting destination was missing. The registered Site URL is not a verified live deployment. The working local app is available through `npm run dev`.

## Employee approval policy (updated)

The assigned Employee may review their own uploads, approve or reject applicant verification, generate/issue/download agreements, record declines, and review received signed copies. Admin retains access across all employees and remains the only role permitted to manage accounts, approved templates, official company assets and global settings. Required profile/document checks, version checks, actual signed-copy prerequisites, assignment restrictions and audit attribution apply to both roles. No applicant signature is fabricated, and a PDF download never marks an agreement signed.

Validation for this policy: 48 employee workflow checks and 39 authentication/isolation checks passed, with existing user credentials unchanged. Re-run with `CRM_WORKFLOW_EMPLOYEE=1 node tests/workflow.mjs` and `CRM_SKIP_INITIAL_CREDENTIALS=1 node --experimental-strip-types tests/auth.mjs` on a disposable local database.

## Current local login configuration

The owner explicitly requested the same chosen password for `admin`, `employee01`, `employee02` and `employee03`. These four existing local accounts have been reset accordingly and no longer require a first-login change. Their current credentials are in the ignored, owner-readable `.local/Login Details.txt`; the chosen password is not embedded in application source or frontend bundles. Old sessions were revoked. New accounts and Admin-issued password resets still use generated temporary passwords with mandatory change.

Login now reserves the per-IP failure budget for failed authentication rather than successful sign-ins, preventing ordinary repeated logins from exhausting a shared limit. The sign-in form waits for the initial session check before allowing submission to avoid a redirect race. Authentication tests include all four current local credentials, dashboard access, logout, 32 repeated successful logins, password reset revocation, approval isolation and failed-login throttling.

### Current local storage
All saved CRM records and tasks are in the local D1 database under `.wrangler/state`; uploaded files and versioned agreements are in local R2 storage under the same directory. Browser refresh/sign-out does not clear these. Do not delete this directory. This localhost instance is not a shared hosted service or an off-device backup. Back up the complete `.wrangler/state` directory while the server is stopped for a consistent database/file backup.

Delete moves an assigned record to recoverable Trash; files and activity remain linked by the original ID. Admins can reassign a record without invalidating its verified applicant details. Pipeline permissions and persistence can be checked with `node tests/pipeline.mjs`; it uses isolated fixture records and does not change company settings.

### Employee assignment management

Admin → Employees → Manage now opens an employee work view with all assigned tasks and leads/prospects, task status and overdue/completed counts, search, Trash, and links to related documents, agreements, payments and appointments. Admins can assign new tasks, edit task instructions/deadlines/status, reassign tasks, transfer existing applicant records, and open full applicant workflows. Account & access retains the existing employee account editor. Opening an applicant from this view provides a Back to employee action.

Task editing/reassignment is enforced as Admin-only on the server, validates the destination employee and date, and records an audit event. Existing employee permissions and stored records are unchanged. Verified with TypeScript, a production build, 22 employee-management API checks, 22 existing pipeline checks, and a desktop browser pass covering Manage, task editing and applicant navigation. API tests ran against a separate disposable local database; mobile interaction was not manually tested. Run `tests/employee-management.mjs` from a disposable database workspace; `CRM_TEST_URL` selects its local server (default port 5173).

## Country / plan agreements

Agreement generation now requires selecting a country and an approved plan matching the applicant's verified destination and visa category. Seven supported destinations each start with five independently editable draft plans: Study, Work, Visitor, Business and Residency (35 templates total). Admin can add further plans, including Family Visa, under Settings → Country & plan agreement templates. Prices remain applicant-specific; selecting a plan does not invent or change the professional fee or recorded payments.

Draft templates are business starting points, not a certification of local legal compliance. Admin must review the actual service scope, applicable adviser authorisation, fee/tax schedule and terms before approving each template. Initial regulatory references: [Canada representatives](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigration-citizenship-representative/learn-about-representatives.html), [Australia migration agents](https://immi.homeaffairs.gov.au/help-support/who-can-help-with-your-application/using-a-migration-agent), [UK advisers](https://www.gov.uk/find-an-immigration-adviser). Other destination notes are operational review prompts, not exhaustive statements of local law.

Changing a template in the editor clears its approval. Generated agreement versions retain a snapshot of the chosen plan, title, scope, terms, payment position and template version. Earlier PDFs stay available in history. Changing an applicant destination or visa category requires re-verification; selecting a different dropdown option cannot bypass it. Existing company assets, applicant verification and verified-payment prerequisites still apply.

Checks: `node --experimental-strip-types tests/agreement-plans.mjs`, `node tests/workflow.mjs`, and `CRM_WORKFLOW_EMPLOYEE=1 node tests/workflow.mjs` against the disposable local database.

## CRM save/upload visibility

Database and file storage run behind the CRM; staff do not need a database console
for normal work. Employees create applicant records and upload documents from their
workspace. Admin can see all records; each Employee can see only assigned records
and their files. Existing review, payment and agreement steps remain in place.

The workspace refreshes visible, idle views every 15 seconds and when the browser
regains focus or connectivity. Save/upload still refreshes the current workspace
immediately. Automatic refresh pauses while a modal, applicant edit, settings or
creation form is open. Requests bypass the browser cache, and older responses do
not replace a newer overview or a different applicant's details.

`next.config.ts` selects Cloudflare runtime bindings for the Worker build and the
Vercel adapter for the Vercel build. Using the Vercel adapter in the Worker prevents
all database access even when D1 is correctly bound.

Regression checks:

```sh
npm run build:backend
node --experimental-strip-types tests/upload-sharing.mjs
node --experimental-strip-types tests/d1-storage.mjs
npm run build:vercel
```

The upload-sharing test creates its own temporary local database/server, checks
Admin and assigned-Employee visibility, denies another Employee, compares the
saved PDF bytes and repeats checks after a server restart. It never uses the real
workspace database. These local checks do not deploy or verify a hosted backend;
Vercel still requires the configured shared backend described above.
