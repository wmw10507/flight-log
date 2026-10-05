/**
 * Add to the existing Flight Log Apps Script project.
 * doPost: if (action === 'getCaptains') return jsonResponse_({ok: true, data: getCaptains()});
 * Existing normalizeCaptainName_, parseCaptainTags_, and FLIGHT_LOG_SS_ID are reused.
 */
function getCaptains() {
  const ss = SpreadsheetApp.openById(FLIGHT_LOG_SS_ID);
  const captainSheet = ss.getSheetByName('CAPTAIN_NOTES');
  const masterSheet = ss.getSheetByName('FLIGHT_LOG_MASTER');
  if (!captainSheet || !masterSheet) throw new Error('Required sheet not found.');

  const notesLastRow = captainSheet.getLastRow();
  const notes = notesLastRow >= 4
    ? captainSheet.getRange(4, 1, notesLastRow - 3, 7).getDisplayValues()
    : [];
  const byName = new Map();
  notes.forEach(function(row) {
    const captain = String(row[0] || '').trim();
    const key = normalizeCaptainName_(captain);
    // Match getCaptainProfile: the first normalized name owns note/tags.
    if (!key || byName.has(key)) return;
    byName.set(key, {
      captain: captain,
      note: row[5] || '',
      tags: parseCaptainTags_(row[6]),
      computed: { sectors: 0, lastFlown: '', lastFlight: '', lastRoute: '' }
    });
  });

  const masterLastRow = masterSheet.getLastRow();
  const flights = masterLastRow >= 2
    ? masterSheet.getRange(2, 1, masterLastRow - 1, 14).getDisplayValues()
    : [];
  flights.forEach(function(row) {
    const captain = byName.get(normalizeCaptainName_(row[13]));
    if (!captain) return;
    const stats = captain.computed;
    const date = row[1] || '';
    // Same flight inclusion and date ordering as getCaptainProfile.
    if (stats.sectors === 0 || String(date).localeCompare(String(stats.lastFlown)) > 0) {
      stats.lastFlown = date;
      stats.lastFlight = row[4] || '';
      stats.lastRoute = row[7] || (row[5] && row[6] ? row[5] + '-' + row[6] : '');
    }
    stats.sectors++;
  });

  return {
    captains: Array.from(byName.values()).sort(function(a, b) {
      return String(b.computed.lastFlown).localeCompare(String(a.computed.lastFlown)) ||
        a.captain.localeCompare(b.captain);
    })
  };
}
