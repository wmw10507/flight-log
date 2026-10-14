const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");

const code = fs.readFileSync(
  path.join(__dirname, "../apps-script/Code.gs"),
  "utf8"
);
new vm.Script(code);

function makeMaster(status = "FLOWN / PROVISIONAL") {
  const row = Array(70).fill("");
  row[0] = "KAL-20261006-KE164-DYG-ICN";
  row[1] = "2026-10-06";
  row[2] = "ILS Z 33R";
  row[3] = "1";
  row[4] = "KE164";
  row[5] = "DYG";
  row[6] = "ICN";
  row[7] = "DYG-ICN";
  row[8] = "PM";
  row[9] = "user comment";
  row[10] = status.includes("OFFICIAL") ? "HL8528" : "";
  row[11] = status.includes("OFFICIAL") ? "GF" : "";
  row[12] = "FO";
  row[13] = "JANG JIHUN";
  row[14] = status.includes("OFFICIAL") ? "15:26" : "";
  row[15] = status.includes("OFFICIAL") ? "18:27" : "";
  row[16] = status.includes("OFFICIAL") ? "3:01" : "3:00";
  row[17] = status.includes("OFFICIAL") ? "1:31" : "";
  row[18] = status.includes("OFFICIAL") ? "1:31" : "";
  row[20] = status.includes("OFFICIAL") ? "3:01" : "";
  row[21] = status.includes("OFFICIAL") ? "2:35" : "";
  row[25] = status.includes("OFFICIAL") ? "N" : "Y";
  row[26] = "N";
  row[27] = "";
  row[32] = "N";
  row[42] = "4-CREW (USER FO)";
  row[63] = status;
  row[65] = "COMPLETE";
  row[68] = "evt-164";
  return row;
}

function makeQueue() {
  return [
    "evt-164",
    "2026-10-07",
    "KE164",
    "DYG",
    "ICN",
    "DYG-ICN",
    "2026-10-07 00:26",
    "2026-10-07 03:27",
    "",
    "",
    "MASTER / OFFICIAL",
    "",
    "KAL-20261006-KE164-DYG-ICN",
    "FLT SCH",
  ];
}

const source = {
  fileName: "Flight Voyage Record Detail1791315013561.pdf",
  fileSize: 61482,
  sha256: "a".repeat(64),
  totalPages: 5,
  coverageFrom: "2026-10-06",
  coverageTo: "2026-10-06",
  sectorCount: 1,
};

const official = {
  date: "2026-10-06",
  registration: "HL8528",
  aircraftType: "3QP",
  flight: "KE164",
  dep: "DYG",
  arr: "ICN",
  dutyCode: "GF",
  outGmt: "15:26",
  inGmt: "18:27",
  block: "03:01",
  companyTime: "01:31",
  molitTime: "01:31",
  night: "03:01",
  inst: "02:35",
  takeoff: "N",
  landing: "N",
  autoland: "",
};

function env(masterRows, queueRows, documentRows = []) {
  const writes = [];
  const data = {
    FLIGHT_LOG_MASTER: masterRows,
    SCHEDULE_QUEUE: queueRows,
    DOCUMENT_REGISTER: documentRows,
    OFFICIAL_IMPORT: [],
  };

  function makeRange(name, r, c, n = 1, w = 1) {
    const sheetData = data[name];

    function valueAt(row, col) {
      const value = sheetData[row - 2]?.[col - 1] ?? "";
      if (typeof value === "number" && [17,18,19,21,22].includes(col)) {
        const mins = Math.round(value * 1440);
        return Math.floor(mins / 60) + ":" + String(mins % 60).padStart(2, "0");
      }
      return value;
    }

    return {
      getDisplayValues() {
        return Array.from({ length: n }, (_, i) =>
          Array.from({ length: w }, (_, j) => valueAt(r + i, c + j))
        );
      },
      getDisplayValue() {
        return valueAt(r, c);
      },
      setValue(value) {
        writes.push([name, r, c, value]);
        while (sheetData.length < r - 1) sheetData.push([]);
        while (sheetData[r - 2].length < c) sheetData[r - 2].push("");
        sheetData[r - 2][c - 1] = value;
        return this;
      },
      setFormula(value) {
        return this.setValue(value);
      },
      setValues(values) {
        values.forEach((row, i) =>
          row.forEach((value, j) => {
            while (sheetData.length < r - 1 + i) sheetData.push([]);
            while (sheetData[r - 2 + i].length < c + j) {
              sheetData[r - 2 + i].push("");
            }
            sheetData[r - 2 + i][c - 1 + j] = value;
          })
        );
        return this;
      },
      copyTo() {
        return this;
      },
    };
  }

  const sheets = Object.fromEntries(
    Object.keys(data).map((name) => [
      name,
      {
        getLastRow: () => data[name].length + 1,
        getRange: (r, c, n = 1, w = 1) => makeRange(name, r, c, n, w),
        appendRow(row) {
          data[name].push([...row]);
          writes.push([name, "append"]);
        },
      },
    ])
  );

  const props = new Map();
  const ctx = vm.createContext({
    Date,
    Logger: { log() {} },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
    },
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: (name) => sheets[name] }),
      flush() {},
      CopyPasteType: { PASTE_FORMAT: "PASTE_FORMAT" },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => props.get(key),
        setProperty: (key, value) => props.set(key, value),
      }),
    },
    CacheService: {
      getScriptCache: () => ({ get: () => null, put() {} }),
    },
    Utilities: {
      getUuid: () => "uuid",
      formatDate(date, zone, format) {
        const iso = new Date(date).toISOString();
        if (format === "yyyy-MM-dd") return iso.slice(0, 10);
        return iso.slice(0, 10) + " " + iso.slice(11, 16);
      },
      computeDigest: () => [1, 2, 3],
      base64EncodeWebSafe: () => "digest",
      Charset: { UTF_8: "UTF_8" },
      DigestAlgorithm: { SHA_256: "SHA_256" },
    },
  });

  vm.runInContext(code, ctx);

  return {
    ctx,
    data,
    writes,
    run(expression) {
      return JSON.parse(
        JSON.stringify(vm.runInContext(expression, ctx))
      );
    },
  };
}

test("official preview follows Queue Master Log ID across the KE164 date boundary", () => {
  const e = env([makeMaster()], [makeQueue()]);
  const result = e.run(
    "previewOfficialImport(" +
      JSON.stringify({ source, records: [official] }) +
      ")"
  );

  assert.equal(result.counts.MATCHED_PROVISIONAL, 1);
  assert.equal(result.counts.MISMATCH, 0);
  assert.equal(result.items[0].queueDate, "2026-10-07");
  assert.equal(result.items[0].masterDate, "2026-10-06");
  assert.equal(
    result.items[0].masterLogId,
    "KAL-20261006-KE164-DYG-ICN"
  );
});

test("identical official values are idempotent and a changed official value is blocked", () => {
  const e = env([makeMaster("OFFICIAL CONFIRMED")], [makeQueue()]);
  const matched = e.run(
    "previewOfficialImport(" +
      JSON.stringify({ source, records: [official] }) +
      ")"
  );
  assert.equal(matched.counts.ALREADY_OFFICIAL, 1);
  assert.equal(matched.canConfirm, true);

  const changed = { ...official, block: "03:02" };
  const mismatch = e.run(
    "previewOfficialImport(" +
      JSON.stringify({ source, records: [changed] }) +
      ")"
  );
  assert.equal(mismatch.counts.MISMATCH, 1);
  assert.equal(mismatch.canConfirm, false);
  assert.equal(mismatch.items[0].changes[0].field, "Block");
});

test("official reconciliation preserves user-owned approach, override and comment", () => {
  const row = makeMaster();
  const before = [row[2], row[3], row[8], row[9]];
  const e = env([row], [makeQueue()]);

  const preview = e.run(
    "previewOfficialImport(" +
      JSON.stringify({ source, records: [official] }) +
      ")"
  );

  e.run(
    "applyOfficialToExistingRow_(" +
      'SpreadsheetApp.openById("x").getSheetByName("FLIGHT_LOG_MASTER"),' +
      JSON.stringify(preview.items[0]) +
      ',"SRC-TEST")'
  );

  assert.deepEqual([row[2], row[3], row[8], row[9]], before);
  assert.equal(row[10], "HL8528");
  assert.equal(row[11], "GF");
  assert.equal(row[63], "OFFICIAL CONFIRMED");
  assert.equal(row[39], "SRC-TEST");
  assert.equal(row[65], "COMPLETE");
});

test("deadhead EX is excluded and never becomes a new operating Master sector", () => {
  const deadhead = {
    ...official,
    flight: "KE1405",
    dep: "ICN",
    arr: "PUS",
    dutyCode: "EX",
    companyTime: "00:00",
    molitTime: "00:00",
  };
  const e = env([], []);
  const result = e.run(
    "previewOfficialImport(" +
      JSON.stringify({ source, records: [deadhead] }) +
      ")"
  );

  assert.equal(result.counts.EXCLUDED, 1);
  assert.equal(result.counts.NEW, 0);
});

function revisionFixture(overrides = {}) {
  const row = makeMaster("OFFICIAL CONFIRMED");
  row[39] = "SRC-KAL-FLIGHTLOG-20261006";
  row[25] = "Y"; row[26] = "Y"; row[27] = "N";
  const document = [row[39], "Flight Log Report", "Korean Air (source report)", "2026-10-06",
    "2026-04-12 to 2026-10-06", "", "SOURCE PROVIDED", "Flight Voyage Record Detail1791315013561.pdf", ""];
  const incoming = { ...source, fileName: "Flight Voyage Record Detail1791955383212.pdf",
    coverageFrom: "2026-10-06", coverageTo: "2026-10-06", ...overrides };
  return { row, document, incoming };
}

test("verified newer company report is OFFICIAL REVISION; preview is read-only", () => {
  const f = revisionFixture();
  const e = env([f.row], [makeQueue()], [f.document]);
  const p = e.run("previewOfficialImport(" + JSON.stringify({ source: f.incoming, records: [official] }) + ")");
  assert.equal(p.counts.OFFICIAL_REVISION, 1);
  assert.equal(p.counts.MISMATCH, 0);
  assert.equal(p.hasMismatches, false);
  assert.equal(p.alreadyImported, false);
  assert.deepEqual(p.items[0].changes.map(c => [c.field, c.before, c.after]),
    [["T/O","Y","N"],["L/D","Y","N"],["A/L","N",""]]);
  assert.equal(p.items[0].revision.previous.sourceId, f.row[39]);
  assert.deepEqual(e.writes, []);
});

test("older/equal reports, missing provenance and mismatched linked identity stay blocked", () => {
  for (const mode of ["older", "equal", "missing", "duplicate", "wrong-route", "different-clock", "failed"]) {
    const f = revisionFixture(mode === "older" ? { fileName: "Flight Voyage Record Detail1790837896021.pdf" }
      : mode === "equal" ? { fileName: "Flight Voyage Record Detail1791315013561.pdf" } : {});
    if (mode === "wrong-route") f.row[6] = "PUS";
    if (mode === "different-clock") f.row[14] = "15:25";
    if (mode === "failed") f.document[6] = "IMPORT FAILED";
    const docs = mode === "missing" ? [] : mode === "duplicate" ? [f.document, [...f.document]] : [f.document];
    const e = env([f.row], [makeQueue()], docs);
    const p = e.run("previewOfficialImport(" + JSON.stringify({ source: f.incoming, records: [official] }) + ")");
    assert.equal(p.counts.MISMATCH, 1, mode);
    assert.equal(p.counts.OFFICIAL_REVISION, 0, mode);
    assert.deepEqual(e.writes, []);
  }
});

test("revision pre-audit retains blank transitions and provenance before writes; user fields survive", () => {
  const f = revisionFixture();
  f.row[44] = "PF"; f.row[54] = "user mirror"; f.row[55] = "ILS Z 33R"; f.row[56] = "1";
  const userColumns = [2,3,8,9,44,54,55,56,65];
  const before = userColumns.map(i => f.row[i]);
  const e = env([f.row], [makeQueue()], [f.document]);
  const p = e.run("previewOfficialImport(" + JSON.stringify({ source:f.incoming,records:[official] }) + ")");
  e.ctx.prepareOfficialRevisionAudit_(e.ctx.SpreadsheetApp.openById("x").getSheetByName("OFFICIAL_IMPORT"), p, p.sourceId, "pdf-url", "backup-url");
  assert.deepEqual(userColumns.map(i => f.row[i]), before);
  assert.equal(f.row[25], "Y");
  assert.equal(e.data.OFFICIAL_IMPORT[0][8], "REVISION PREPARED");
  assert.equal(JSON.parse(e.data.OFFICIAL_IMPORT[0][6]).takeoff, "Y");
  assert.equal(JSON.parse(e.data.OFFICIAL_IMPORT[0][5]).takeoff, "N");
  const master = e.ctx.SpreadsheetApp.openById("x").getSheetByName("FLIGHT_LOG_MASTER");
  e.ctx.applyOfficialToExistingRow_(master, p.items[0], p.sourceId);
  assert.deepEqual(userColumns.map(i => f.row[i]), before);
  assert.deepEqual([f.row[25],f.row[26],f.row[27]], ["N","N",""]);
  e.ctx.appendOfficialImportAudit_(e.ctx.SpreadsheetApp.openById("x").getSheetByName("OFFICIAL_IMPORT"), p, p.sourceId, "pdf-url", {0:f.row[0]}, "backup-url");
  const audited = e.data.OFFICIAL_IMPORT.find(r => r[8] === "OFFICIAL REVISION");
  assert.ok(audited);
  assert.equal(JSON.parse(audited[6]).autoland, "N");
  assert.match(audited[7], /A\/L N → blank/);
  const rerun = e.run("previewOfficialImport(" + JSON.stringify({source:f.incoming,records:[official]}) + ")");
  assert.equal(rerun.counts.OFFICIAL_REVISION, 0);
  assert.equal(rerun.counts.ALREADY_OFFICIAL, 1);
});

test("revision audit failure stops before changing Master", () => {
  const f = revisionFixture();
  const e = env([f.row], [makeQueue()], [f.document]);
  const p = e.run("previewOfficialImport(" + JSON.stringify({source:f.incoming,records:[official]}) + ")");
  const snapshot = [...f.row];
  assert.throws(() => e.ctx.prepareOfficialRevisionAudit_({getLastRow:()=>1,appendRow(){throw Error("audit failed");}},p,p.sourceId,"pdf","backup"),/audit failed/);
  assert.deepEqual(f.row,snapshot);
});

test("Confirm orchestration requires durable revision audit before calling Master mutation", () => {
  const f = revisionFixture();
  const e = env([f.row], [makeQueue()], [f.document]);
  const snapshot = [...f.row];
  e.ctx.PropertiesService.getScriptProperties().setProperty("OFFICIAL_IMPORT_CONFIRM_ENABLED","true");
  const originalOpen = e.ctx.SpreadsheetApp.openById;
  const ss = originalOpen("x");
  e.ctx.openFlightSpreadsheet_ = () => ({getSheetByName:name => name==="OFFICIAL_IMPORT"
    ? {getLastRow:()=>1,appendRow(){throw Error("audit unavailable");}}
    : ss.getSheetByName(name)});
  e.ctx.createStagedOfficialPdf_ = () => ({id:"file",url:"pdf",file:{},storage:{}});
  e.ctx.appendDocumentRegister_ = () => 2;
  e.ctx.updateDocumentRegisterStorage_ = () => {};
  e.ctx.createOfficialImportBackup_ = () => ({url:"backup"});
  let writes=0;
  e.ctx.applyOfficialToExistingRow_ = () => {writes++;};
  assert.throws(()=>e.ctx.confirmOfficialImportUncached_({source:f.incoming,records:[official],pdfBase64:"AA=="}),/audit unavailable/);
  assert.equal(writes,0);
  assert.deepEqual(f.row,snapshot);
});

test("rolling coverage keeps the older report when the newest report drops the first date", () => {
  const e = env([], []);
  const plan = e.run(
    'selectMinimalCoverageIntervals_([' +
      '{from:"2026-04-11",to:"2026-10-01",fileInfo:{id:"old"}},' +
      '{from:"2026-04-12",to:"2026-10-06",fileInfo:{id:"new"}}' +
    '])'
  );

  assert.equal(plan.gap, false);
  assert.equal(plan.selected.old, true);
  assert.equal(plan.selected.new, true);
  assert.equal(plan.earliest, "2026-04-11");
  assert.equal(plan.latest, "2026-10-06");
});


test("coverage gaps prevent archive minimization", () => {
  const e = env([], []);
  const plan = e.run(
    'selectMinimalCoverageIntervals_([' +
      '{from:"2026-04-11",to:"2026-09-01",fileInfo:{id:"a"}},' +
      '{from:"2026-09-03",to:"2026-10-06",fileInfo:{id:"b"}}' +
    '])'
  );

  assert.equal(plan.gap, true);
  assert.equal(plan.gapAt, "2026-09-02");
  assert.equal(plan.selected.a, true);
  assert.equal(plan.selected.b, undefined);
});


test("blank official A/L clears a provisional nonblank value without inference", () => {
  const row = makeMaster();
  row[27] = "N";
  const e = env([row], [makeQueue()]);

  const preview = e.run(
    "previewOfficialImport(" +
      JSON.stringify({ source, records: [official] }) +
      ")"
  );

  assert.equal(
    preview.items[0].changes.some(
      (change) =>
        change.field === "A/L" &&
        change.before === "N" &&
        change.after === ""
    ),
    true
  );

  e.run(
    "applyOfficialToExistingRow_(" +
      'SpreadsheetApp.openById("x").getSheetByName("FLIGHT_LOG_MASTER"),' +
      JSON.stringify(preview.items[0]) +
      ',"SRC-TEST")'
  );

  assert.equal(row[27], "");
});


test("day time derives from block minus night, not MOLIT partial credit", () => {
  const mixed = {
    ...official,
    block: "10:00",
    companyTime: "05:00",
    molitTime: "05:00",
    night: "03:00",
  };

  const existingRow = makeMaster();
  const e = env([existingRow], [makeQueue()]);
  const preview = e.run(
    "previewOfficialImport(" +
      JSON.stringify({ source, records: [mixed] }) +
      ")"
  );

  e.run(
    "applyOfficialToExistingRow_(" +
      'SpreadsheetApp.openById("x").getSheetByName("FLIGHT_LOG_MASTER"),' +
      JSON.stringify(preview.items[0]) +
      ',"SRC-TEST")'
  );

  assert.equal(existingRow[19], "=MAX(0,Q2-U2)");

  const item = {
    ...preview.items[0],
    status: "NEW",
    masterRow: null,
    masterLogId: "",
  };
  const built = e.run(
    "buildOfficialNewMasterRow_(2," +
      JSON.stringify(item) +
      ',"SRC-TEST",' +
      JSON.stringify([makeQueue()]) +
      ")"
  );

  assert.equal(built.row[19], "=MAX(0,Q2-U2)");
});


test("stale Queue Event ID cannot redirect official import to a different flight", () => {
  const correct = makeMaster();
  correct[68] = "evt-correct";

  const wrong = makeMaster();
  wrong[0] = "KAL-20261006-KE999-ICN-PUS";
  wrong[4] = "KE999";
  wrong[5] = "ICN";
  wrong[6] = "PUS";
  wrong[7] = "ICN-PUS";
  wrong[68] = "evt-164";

  const q = makeQueue();
  q[12] = "";

  const e = env([correct, wrong], [q]);
  const result = e.run(
    "previewOfficialImport(" +
      JSON.stringify({ source, records: [official] }) +
      ")"
  );

  assert.equal(result.counts.MATCHED_PROVISIONAL, 1);
  assert.equal(
    result.items[0].masterLogId,
    "KAL-20261006-KE164-DYG-ICN"
  );
});
