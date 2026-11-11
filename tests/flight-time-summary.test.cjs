const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');

function flight(id, date, status, block, molit, duty = 'F', position = 'FO') {
  const row = Array(64).fill('');
  Object.assign(row, { 0: id, 1: date, 11: duty, 12: position, 16: block, 18: molit, 63: status });
  return row;
}

function certificate(type, aircraftClass, subtotal, verification) {
  const row = Array(29).fill('');
  Object.assign(row, { 1: type, 6: aircraftClass, 15: subtotal, 28: verification });
  return row;
}

test('personal totals separate official and pending flights across Korean date periods', () => {
  const official = 'OFFICIAL CONFIRMED', pending = 'FLOWN / PROVISIONAL';
  const civilian = 'Civil training certificate', military = 'Military flight experience certificate';
  const data = {
    FLIGHT_LOG_MASTER: [
      flight('prior-year', '2025-12-31', official, '9:10', '8:00'),
      flight('prior-month', '2026-10-31', official, '3:05', '1:30'),
      flight('current-month', '2026-11-11', official, '2:50', '2:20'),
      flight('unconfirmed', '2026-11-11', pending, '3:58', ''),
      flight('tomorrow', '2026-11-12', official, '4:00', '3:00'),
      flight('observer', '2026-11-11', official, '2:00', '0:00', 'O'),
      flight('travel', '2026-11-11', official, '2:00', '0:00', 'EX'),
      flight('planned', '2026-11-11', 'SCHEDULED', '1:00', '1:00'),
    ],
    HISTORICAL_SUMMARY: [
      certificate(civilian, 'AIRCRAFT', '116:30', 'VERIFIED'),
      certificate(military, 'AIRCRAFT', '104:12', 'CHECK'),
      certificate(military, 'SIMULATOR', '22:00', 'VERIFIED'),
      certificate(military, 'AIRCRAFT', '50:00', 'PENDING'),
    ],
  };
  const ctx = vm.createContext({
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => ({
      getLastRow: () => data[name].length + 1,
      getRange: (r, c, n, w) => ({ getDisplayValues: () =>
        data[name].slice(r - 2, r - 2 + n).map(row => row.slice(c - 1, c - 1 + w)) }),
    }) }) },
    Utilities: { formatDate: (_, zone) => {
      assert.equal(zone, 'Asia/Seoul');
      return '2026-11-11';
    } },
  });
  vm.runInContext(code, ctx);
  const summary = JSON.parse(JSON.stringify(ctx.getFlightTimeSummary()));
  assert.equal(summary.historicalMinutes, 220 * 60 + 42);
  assert.deepEqual(summary.periods, {
    total: { officialBlock: 905, officialMolit: 710, officialSectors: 3, pendingBlock: 238, pendingMolit: 0, pendingSectors: 1 },
    year: { officialBlock: 355, officialMolit: 230, officialSectors: 2, pendingBlock: 238, pendingMolit: 0, pendingSectors: 1 },
    month: { officialBlock: 170, officialMolit: 140, officialSectors: 1, pendingBlock: 238, pendingMolit: 0, pendingSectors: 1 },
  });
});
