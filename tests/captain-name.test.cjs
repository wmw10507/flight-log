const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), context);

test('Roster PIC name excludes known rank suffix while preserving crew interpretation', () => {
  const actual = context.parseCrewMemo('Crew Roster 2026-10-27: PIC LEE JONGHUN (CAP/P1); USER FO/F1; 32SCONSOL;');
  assert.equal(actual.pic, 'LEE JONGHUN');
  assert.equal(actual.safetyPilot, false);
  assert.equal(actual.crewType, 'CAP + FO (USER)');
  assert.equal(context.parseCrewMemo('PIC PARK DONG-JIN; USER=FO; FDT KIM TEST;').pic, 'PARK DONG-JIN');
});

test('Captain profile identity shares known role aliases without discarding arbitrary text', () => {
  for (const suffix of [' (CAP/P1)', ' (CAP)', ' [P1]', ' ( cap / p1 )']) {
    assert.equal(context.normalizeCaptainName_(' LEE   JONGHUN' + suffix), 'LEE JONGHUN');
  }
  assert.equal(context.normalizeCaptainName_('LEE JONGHUN (OTHER)'), 'LEE JONGHUN (OTHER)');
});
