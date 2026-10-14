const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

function loadParser() {
  const source = fs.readFileSync(
    path.join(__dirname, "../lib/official-flight-log.ts"),
    "utf8"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const module = { exports: {} };
  new Function("module", "exports", "require", compiled)(
    module,
    module.exports,
    require
  );
  return module.exports;
}

const { parseKoreanAirFlightLogText } = loadParser();

test("Korean Air parser handles JasperReports rows concatenated without line breaks", () => {
  const text =
    "Flight Log Report WOO MYUNG WOO | 2594423 | 32S | FO Generated 2026-10-14 " +
    "2026-10-01 HL8556 3QP KE2085 PUS TPE F 23:57 02:19 02:22 02:22 02:22 00:00 02:00 Y Y N" +
    "2026-10-06 HL8528 3QP KE163 ICN DYG GF 10:29 14:12 03:43 01:52 01:52 03:43 03:10 Y Y N" +
    "2026-10-06 HL8528 3QP KE164 DYG ICN GF 15:26 18:27 03:01 01:31 01:31 03:01 02:35 N N";

  const result = parseKoreanAirFlightLogText(text);

  assert.equal(result.records.length, 3);
  assert.equal(result.coverageFrom, "2026-10-01");
  assert.equal(result.coverageTo, "2026-10-06");
  assert.deepEqual(result.warnings, []);

  assert.deepEqual(result.records[2], {
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
  });
});

test("parser deduplicates identical source rows and rejects non-flight text", () => {
  const row =
    "2026-10-06 HL8528 3QP KE163 ICN DYG GF 10:29 14:12 03:43 01:52 01:52 03:43 03:10 Y Y N";

  const result = parseKoreanAirFlightLogText(row + row);
  assert.equal(result.records.length, 1);

  assert.throws(
    () => parseKoreanAirFlightLogText("Flight Log Report\nno sector rows"),
    /No Korean Air Flight Log rows/
  );
});
