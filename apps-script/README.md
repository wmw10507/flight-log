# Captains directory backend

`getCaptains.gs` is an additive function for the existing **Myungwoo Flight Log Backend** project, not a standalone backend. It reuses `FLIGHT_LOG_SS_ID`, `normalizeCaptainName_`, and `parseCaptainTags_` from the existing Code.gs. Existing `getCaptainProfile` and `saveCaptainProfile` remain unchanged.

Add this branch inside the existing authenticated `doPost` dispatcher before the unknown-action error:

```js
if (action === 'getCaptains') {
  return jsonResponse_({ ok: true, data: getCaptains() });
}
```

The response is `{ captains: [{ captain, note, tags, computed: { sectors, lastFlown, lastFlight, lastRoute } }] }` after the Next.js bridge unwraps `data`.

- Membership, Captain Comment, and Tags come from CAPTAIN_NOTES, rows 4 onward, columns A/F/G. Blank names are skipped; duplicate normalized names use the first row, matching the existing profile lookup.
- Statistics come from FLIGHT_LOG_MASTER, rows 2 onward, using the same flight inclusion and display-date ordering as getCaptainProfile. Stored CAPTAIN_NOTES statistics do not override computed statistics.
- Captains without flights have zero sectors and an empty lastFlown. Results sort by latest flight first, then name.
- Each sheet is read once. No sheet data is written by this action.

The function and dispatcher were applied to the existing cloud project and deployed as version **23** on **2026-10-06 (Asia/Seoul)**. The existing deployment ID/URL, authentication, execution identity, and access settings were preserved. No changes to Vercel environment variables are needed. GitHub/Vercel continues to deploy the Next.js app through its existing workflow.


## Master Log ID fix (v0.2.8)

Code.gs is the complete backend source, imported from the existing Myungwoo Flight Log Backend editor on 2026-10-14 (Asia/Seoul). Before modification it matched the local v0.2.7 replacement byte-for-byte in length and content fingerprint (94,658 characters; FNV-1a 3365260425). The initial source comparison was read only. Deployment and live validation followed explicit user authorization.

- Today and savePostFlight share findMasterForQueue_: a nonblank SCHEDULE_QUEUE column M Master Log ID resolves only FLIGHT_LOG_MASTER column A. Missing or duplicated IDs do not fall back; saving stops before any sheet write.
- Queue rows without an ID use the exact Date + Flight + DEP + ARR legacy key. Event ID/adjacent-day matching remains available for the separate official reconciliation path, but no longer decides Today/save row ownership.
- The Log ID index retains physical rows even when legacy tuple keys collide. Selective Today reads include referenced IDs outside the Queue date window. Save continues to use a full, fresh Master index under the existing lock.
- Today preserves Calendar date in date and exposes the matched official date separately in officialDate. Official GMT clock values are converted to KST for the existing OUT/IN displays; Block, Company and MOLIT come from that same matched row. Calendar timestamps still determine schedule ordering/completion. No dates or official timestamps are rewritten.
- The client sends its displayed Master ID as an optional stale-link check. The server selects the Queue row by eventId and re-reads its ID; client input cannot redirect a write. The save response keeps the client ID current after provisional creation.
- Existing updateExistingMasterRow is unchanged: Approach type/no, PF/PM override, comment and their mirrors plus post-flight completion are written. Official T/O, L/D and every other official/provenance column are preserved. Explicit provisional T/O, L/D editing remains supported. Captain comment/tags saving is unchanged.

Local verification: npm test, npm run typecheck, npm run build. Tests use in-memory Apps Script/Sheets mocks and never contact production.

Backend deployed on 2026-10-14 at 10:34 (Asia/Seoul) as Apps Script version 27, retaining the existing deployment ID/URL, execution identity and access settings. Production /api/flight reports backendVersion 0.2.8. A live save of KE164 with its existing user values returned UPDATED for KAL-20261006-KE164-DYG-ICN and official: true. Independent before/after reads of Master A135:BR136 (KE163/KE164, 70 columns each) and Queue A16:N17 were identical. The current Today seven-day window no longer includes KE164; its live History/API and save path were verified, with Today hydration covered by local regression tests.

For future backend deployments, replace that project's Code.gs with this file and retain Index.html. Code.gs already includes getCaptains; the separate getCaptains.gs here is a historical additive snippet and must not be uploaded alongside it. GitHub/Vercel continues to deploy the Next.js app from main.


## Official PDF Import v1 (v0.3.0-import-v1)

This branch adds a guarded **Analyze → Preview → Confirm** import path for Korean Air `Flight Log Report` PDFs.

### Data rules

- Preview is read-only.
- Confirm runs under `ScriptLock` and re-runs Preview before any Master mutation.
- Existing `OFFICIAL CONFIRMED` rows are idempotent when source-controlled values match.
- If an existing official value differs from the incoming PDF, the item becomes `MISMATCH` and automatic import is blocked.
- `SCHEDULE_QUEUE.Master Log ID` is used first when available, including Calendar/Official date-boundary sectors such as KE164.
- `Duty Code EX` / deadhead / travel evidence remains outside the operating Master. If an excluded sector unexpectedly already has an operating Master row, import is blocked for review.
- User-owned Approach Type/No., PF/PM override, Flight Comment, Tags, and post-flight completion state are not overwritten by official import.
- Official Registration, Duty Code, OUT/IN, Block, Company/MOLIT, Night, INST, T/O and L/D win when a provisional row is officialized. A/L is also authoritative when the source field is blank; blank is never inferred as `N`.
- New official operating sectors are created with `PENDING USER INPUT` post-flight state unless a pre-existing Master row already contains user input.

### Original PDF management

Confirm stores the exact uploaded bytes and validates SHA-256 again inside Apps Script before creating the Drive file.

Target hierarchy:

```text
FLT DATA/
  01_OFFICIAL_RECORDS/
    Korean Air/
      <year>/
        Flight Log Report/
          Import_Staging/
          Archive_Redundant/
```

The verified 2026 Flight Log Report folder is used only as the bootstrap anchor; future year folders are resolved/created below the same `Korean Air` parent.

After Master/Queue writes pass read-back reconciliation:

1. the staged PDF moves to the year's active `Flight Log Report` folder,
2. `DOCUMENT_REGISTER` and `OFFICIAL_IMPORT` are written,
3. active/archive coverage is recalculated,
4. only physically present, registered PDFs are allowed to justify archive moves,
5. the smallest interval set that covers the entire available evidence window is kept active,
6. redundant PDFs move to `Archive_Redundant`; files are never deleted,
7. if a coverage gap is detected, no archive moves are made.

Each confirm also creates a full Google Sheet backup before Master writes. A failed import leaves the original in staging, marks the source registration as failed when possible, and retains the backup for recovery.

### Deployment requirements

The Next.js route uses `unpdf@1.8.1` and therefore requires Node.js 22 or newer.

`Analyze` is read-only. `Confirm` additionally requires the server-side Vercel environment variable `OFFICIAL_IMPORT_CONFIRM_ENABLED=true`. Leave it unset/false until the Apps Script v0.3 backend is deployed, the feature preview has been validated, and deployment access protection has been reviewed.

The Apps Script deployment now uses `DriveApp` for backup/original-file management. The first deployment of this version may require Google OAuth re-authorization for Drive access. Re-deploy the existing web app only after reviewing the new Drive scope; preserve the current deployment identity, access policy, and `FLIGHT_LOG_API_KEY`.

Do not upload `getCaptains.gs` separately; `Code.gs` remains the complete backend source.

### Confirm guard (v0.3.1-import-v1)

The generic `/api/flight` bridge permits only existing app actions and rejects all Official Import actions. Official imports use the dedicated route, whose Vercel `OFFICIAL_IMPORT_CONFIRM_ENABLED` flag rejects Confirm before PDF extraction when unset/false.

Apps Script independently requires its own Script Property `OFFICIAL_IMPORT_CONFIRM_ENABLED` to equal `true`. Both Confirm entry points check this before any lock/cache/Sheet/Drive mutation. Missing, false, and other values fail closed. Preview does not require this property. Keep both switches OFF until a separately authorized actual import test.

### Verified official revisions (v0.3.2-import-v1)

Analyze classifies differences as OFFICIAL_REVISION only when the prior Master source uniquely resolves to a registered Korean Air Flight Log Report, date/flight/DEP/ARR/registration/OUT/IN identify the same sector, and the incoming report was generated later. PDF CreationDate is extracted server-side; original JasperReports filename timestamps support legacy registrations. Unknown chronology, stale reports, ambiguous identities and conflicting clocks remain MISMATCH.

Before any revision Master write, Confirm stores the full previous official snapshot, source IDs/timestamps, new values and delta in OFFICIAL_IMPORT and flushes that audit. Audit failure blocks Master mutation. A verified completed revision is additionally recorded as OFFICIAL REVISION. Existing Approach, PFPM overrides, Comment/mirrors and completion inputs remain intact. Confirm re-analyzes under lock and verifies that no actionable revisions remain. Both original PDFs remain retained through the existing coverage-aware archive flow. Deployment and Analyze do not enable either Confirm switch.
