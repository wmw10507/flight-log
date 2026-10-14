const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const code = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');
new vm.Script(code);
const frozen = '2026-10-08T03:00:00Z';
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [frozen])); }
  static now() { return new Date(frozen).getTime(); }
}
function master(date, no, dep, arr, id) {
  const row = Array.from({ length: 70 }, (_, i) => 'preserve-' + (i + 1));
  Object.entries({ 0: id, 1: date, 4: no, 5: dep, 6: arr, 7: dep + '-' + arr,
    13: 'JANG JIHUN', 14: '15:41', 15: '18:42', 16: '3:01', 17: '3:01', 18: '1:31',
    25: 'Y', 26: 'N', 32: 'N', 42: '4-CREW (USER FO)', 63: 'OFFICIAL CONFIRMED',
    65: 'COMPLETE', 66: '', 67: '', 68: '' }).forEach(([key, value]) => { row[key] = value; });
  return row;
}
function queue(date, no, dep, arr, id, event = 'evt-' + no) {
  return [event, date, no, dep, arr, dep + '-' + arr,
    date + ' 00:30', date + ' 03:30', '', '', 'MASTER / OFFICIAL', '', id, 'CALENDAR'];
}
function env(rows, queued) {
  const writes = [];
  const ranges = [];
  const sheets = Object.fromEntries(Object.entries({ FLIGHT_LOG_MASTER: rows, SCHEDULE_QUEUE: queued }).map(([name, data]) => [name, {
    getLastRow: () => data.length + 1,
    getRange(r, c, n = 1, w = 1) {
      return {
        getDisplayValues: () => {
          ranges.push([name, r, c, n, w]);
          return Array.from({ length: n }, (_, i) => Array.from({ length: w }, (_, j) => data[r - 2 + i]?.[c - 1 + j] ?? ''));
        },
        setValue(value) { writes.push([name, r, c, value]); data[r - 2][c - 1] = value; }
      };
    },
    appendRow(row) { writes.push([name, 'append']); data.push([...row]); }
  }]));
  const properties = new Map();
  const ctx = vm.createContext({ Date: TestDate, Logger: { log() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => sheets[name] }), flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value) }) },
    Utilities: { getUuid: () => 'generation-' + Math.random(), formatDate(date, tz, format) {
      const shifted = new Date(date.getTime() + (tz === 'Asia/Seoul' ? 9 : 0) * 3600000);
      const day = shifted.toISOString().slice(0, 10);
      return format === 'yyyy-MM-dd' ? day : day + ' ' + shifted.toISOString().slice(11, 16);
    } }
  });
  vm.runInContext(code, ctx);
  return { ctx, writes, ranges, run(expr) { return JSON.parse(JSON.stringify(vm.runInContext(expr, ctx))); } };
}
const id164 = 'KAL-20261006-KE164-DYG-ICN';
const payload = { eventId: 'evt-KE164', masterLogId: id164, approachType: 'ILS33R', approachNo: '1', pfpmOverride: 'PM', comment: 'user comment',
  takeoff: 'N', landing: 'Y', registration: 'ATTEMPTED OVERWRITE', block: '9:59', outGmt: '01:00', molit: '9:59' };

test('KE164 Today prefers Queue ID over a conflicting calendar-date row and event ID', () => {
  const correct = master('2026-10-06', 'KE164', 'DYG', 'ICN', id164);
  const wrong = master('2026-10-07', 'KE164', 'DYG', 'ICN', 'wrong-id');
  wrong[13] = 'WRONG PIC'; wrong[68] = 'evt-KE164';
  const e = env([correct, wrong], [queue('2026-10-07', 'KE164', 'DYG', 'ICN', ' ' + id164 + ' ')]);
  const f = e.run('getAppData()').pastFlights[0];
  assert.equal(f.masterLogId, id164); assert.equal(f.date, '2026-10-07'); assert.equal(f.officialDate, '2026-10-06');
  assert.equal(f.official, true); assert.equal(f.pic, 'JANG JIHUN'); assert.equal(f.crewType, '4-CREW (USER FO)');
  assert.equal(f.postFlightStatus, 'COMPLETE'); assert.equal(f.outDisplay, '00:41'); assert.equal(f.inDisplay, '03:42');
  assert.equal(f.outGmt, '15:41'); assert.equal(f.block, '3:01'); assert.equal(f.molit, '1:31'); assert.deepEqual(e.writes, []);
});
test('SAVE updates only the canonical row and preserves all official values and both dates', () => {
  const correct = master('2026-10-06', 'KE164', 'DYG', 'ICN', id164);
  const wrong = master('2026-10-07', 'KE164', 'DYG', 'ICN', 'wrong-id');
  const before = [...correct], wrongBefore = [...wrong];
  const q = queue('2026-10-07', 'KE164', 'DYG', 'ICN', id164);
  const e = env([correct, wrong], [q]);
  const result = e.run('savePostFlight(' + JSON.stringify(payload) + ')');
  assert.deepEqual(result, { action: 'UPDATED', logId: id164, official: true });
  const allowed = new Set([3, 4, 9, 10, 45, 55, 56, 57, 66]);
  correct.forEach((value, i) => { if (!allowed.has(i + 1)) assert.equal(value, before[i], 'protected column ' + (i + 1)); });
  assert.equal(correct[2], 'ILS33R'); assert.equal(correct[8], 'PM'); assert.equal(correct[9], 'user comment');
  assert.deepEqual(wrong, wrongBefore); assert.equal(q[1], '2026-10-07'); assert.equal(q[12], id164);
  assert.ok(e.writes.every(([name, row, col]) => name !== 'FLIGHT_LOG_MASTER' || (row === 2 && allowed.has(col))));
});
test('KE163 and same-date flights with/without Master ID retain their exact rows', () => {
  for (const [no, dep, arr] of [['KE163', 'ICN', 'DYG'], ['KE1401', 'ICN', 'PUS']]) {
    for (const withId of [true, false]) {
      const id = 'KAL-20261006-' + no + '-' + dep + '-' + arr;
      const rows = [master('2026-10-06', no, dep, arr, id)];
      const e = env(rows, [queue('2026-10-06', no, dep, arr, withId ? id : '')]);
      assert.equal(e.run('getQueueFlights({readOnly:true})')[0].masterLogId, id);
      const result = e.run('savePostFlight(' + JSON.stringify({ ...payload, eventId: 'evt-' + no, masterLogId: withId ? id : undefined }) + ')');
      assert.equal(result.logId, id); assert.equal(result.action, 'UPDATED'); assert.equal(rows.length, 1);
    }
  }
});
test('legacy Queue without ID uses only exact Date+Flight+DEP+ARR, not adjacent dates/events', () => {
  const row = master('2026-10-06', 'KE164', 'DYG', 'ICN', id164); row[68] = 'evt-KE164';
  const e = env([row], [queue('2026-10-07', 'KE164', 'DYG', 'ICN', '')]);
  assert.equal(e.run('getQueueFlights()')[0].official, false);
  assert.equal(e.run('savePostFlight(' + JSON.stringify({ ...payload, masterLogId: undefined }) + ')').action, 'CREATED');
  assert.equal(e.writes.filter(w => w[1] === 'append').length, 1);
});
test('missing/duplicate referenced IDs and stale client ID stop save before any sheet write', () => {
  for (const scenario of ['missing', 'duplicate', 'stale']) {
    const rows = [master('2026-10-07', 'KE164', 'DYG', 'ICN', scenario === 'missing' ? 'wrong-id' : id164)];
    if (scenario === 'duplicate') rows.push(master('2026-10-06', 'KE164', 'DYG', 'ICN', id164));
    const e = env(rows, [queue('2026-10-07', 'KE164', 'DYG', 'ICN', id164)]);
    assert.throws(() => e.run('savePostFlight(' + JSON.stringify({ ...payload, masterLogId: scenario === 'stale' ? 'old-id' : id164 }) + ')'), /Master Log ID|link changed/);
    assert.deepEqual(e.writes, []);
    if (scenario !== 'stale') assert.equal(e.run('getQueueFlights({readOnly:true})')[0].official, false);
  }
});
test('Log ID index preserves colliding tuple rows and selective reads include distant ID dates', () => {
  const target = master('2026-09-20', 'KE164', 'DYG', 'ICN', id164);
  const rows = Array.from({ length: 300 }, (_, i) => master('2020-01-01', 'KE' + i, 'ICN', 'PUS', 'id-' + i));
  rows[155] = target;
  rows[156] = master('2026-09-20', 'KE164', 'DYG', 'ICN', 'same-tuple-other-id');
  const e = env(rows, [queue('2026-10-07', 'KE164', 'DYG', 'ICN', id164)]);
  assert.equal(e.run('getQueueFlights({readOnly:true})')[0].masterLogId, id164);
  assert.equal(e.run('findMasterForQueue_(buildMasterIndex(), {masterLogId:' + JSON.stringify(id164) + '}).sheetRow'), 157);
  assert.ok(e.ranges.some(([name, , col, , width]) => name === 'FLIGHT_LOG_MASTER' && col === 1 && width === 1));
  assert.ok(e.ranges.filter(([name, , , , width]) => name === 'FLIGHT_LOG_MASTER' && width === 70).some(([, , , count]) => count < 300));
});
test('provisional rows preserve actual/provenance fields and retain explicit T/O, L/D editing', () => {
  const row = master('2026-10-06', 'KE164', 'DYG', 'ICN', id164); row[63] = 'FLOWN / PROVISIONAL';
  const before = [...row], e = env([row], [queue('2026-10-07', 'KE164', 'DYG', 'ICN', id164)]);
  e.run('savePostFlight(' + JSON.stringify(payload) + ')');
  assert.equal(row[25], 'N'); assert.equal(row[26], 'Y');
  for (const col of [1,2,11,12,15,16,17,18,19,21,22,28,39,40,41,54,64,67,68,69,70]) assert.equal(row[col-1], before[col-1]);
  e.run('savePostFlight(' + JSON.stringify({ ...payload, takeoff: '', landing: '' }) + ')');
  assert.equal(row[25], 'N'); assert.equal(row[26], 'Y');
});
