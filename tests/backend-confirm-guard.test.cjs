const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const code = fs.readFileSync(require("node:path").join(__dirname, "../apps-script/Code.gs"), "utf8");

function backend(flag) {
  const effects = [];
  const props = new Map([["FLIGHT_LOG_API_KEY", "test-key"]]);
  if (flag !== undefined) props.set("OFFICIAL_IMPORT_CONFIRM_ENABLED", flag);
  const ctx = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => props.get(key),
      setProperty() { effects.push("property write"); },
    }) },
    LockService: { getScriptLock() { effects.push("lock"); throw new Error("Unexpected lock"); } },
    SpreadsheetApp: { openById() { effects.push("sheet"); throw new Error("Unexpected sheet access"); }, flush() { effects.push("flush"); } },
    DriveApp: new Proxy({}, { get() { effects.push("drive"); throw new Error("Unexpected Drive access"); } }),
    ContentService: { MimeType: { JSON: "JSON" }, createTextOutput(text) { return { setMimeType: () => JSON.parse(text) }; } },
  });
  vm.runInContext(code, ctx);
  return { ctx, effects };
}

test("Backend denies both Confirm entry points and authenticated doPost before side effects", () => {
  for (const flag of [undefined, "false", "TRUE", "1", " true "]) {
    const b = backend(flag);
    for (const fn of ["confirmOfficialImport", "confirmOfficialImportUncached_"]) {
      assert.throws(() => b.ctx[fn]({}), /Confirm is disabled/);
    }
    const result = b.ctx.doPost({ postData: { contents: JSON.stringify({ apiKey: "test-key", action: "confirmOfficialImport", payload: {} }) } });
    assert.equal(result.ok, false);
    assert.match(result.error, /Confirm is disabled/);
    assert.equal(result.backendVersion, "0.3.1-import-v1");
    assert.deepEqual(b.effects, []);
  }
});

test("Only the exact true flag opens the guard; test does not run an import", () => {
  const b = backend("true");
  assert.doesNotThrow(() => b.ctx.requireOfficialImportConfirmEnabled_());
  b.ctx.validateOfficialImportPayload_ = () => { throw new Error("validation reached"); };
  assert.throws(() => b.ctx.confirmOfficialImportUncached_({}), /validation reached/);
  assert.deepEqual(b.effects, []);
});
