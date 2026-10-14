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
      return sheetData[row - 2]?.[col - 1] ?? "";
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
