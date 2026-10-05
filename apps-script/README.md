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
