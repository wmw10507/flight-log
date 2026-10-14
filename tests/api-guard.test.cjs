const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadRoute(relative, enabled) {
  const calls = [];
  const source = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({
    exports: {}, console, Response, File, Buffer, TextDecoder, Uint8Array, setTimeout,
    process: { env: { APPS_SCRIPT_URL: "https://backend.example.test", FLIGHT_LOG_API_KEY: "server-key", OFFICIAL_IMPORT_CONFIRM_ENABLED: enabled } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ ok: true, data: { result: "ok" } });
    },
    require(name) {
      if (name === "next/server") return { NextResponse: Response };
      if (name === "unpdf") return {
        getDocumentProxy() { throw new Error("Disabled Confirm must not parse a PDF"); },
        extractText() { throw new Error("Unexpected extraction"); },
      };
      if (name === "@/lib/official-flight-log") return {};
      return require(name);
    },
  });
  vm.runInContext(compiled, context);
  return { post: context.exports.POST, calls };
}

test("Flight bridge rejects official and unknown actions without contacting Apps Script", async () => {
  const route = loadRoute("app/api/flight/route.ts", "true");
  for (const action of ["confirmOfficialImport", "previewOfficialImport", "reconcileOfficialFlightRecord", "unknown", "", null, ["getAppData"]]) {
    const response = await route.post({ json: async () => ({ action, payload: {} }) });
    assert.equal(response.status, 403);
  }
  assert.equal(route.calls.length, 0);
});

test("Existing app actions still forward, using only the server API key", async () => {
  const route = loadRoute("app/api/flight/route.ts");
  for (const action of ["getAppData", "savePostFlight", "getHistoryMonth", "getRecencyData", "getCaptainCard", "getCaptains", "getCaptainProfile", "saveCaptainProfile"]) {
    const response = await route.post({ json: async () => ({ action, payload: { test: 1 }, apiKey: "caller-key" }) });
    assert.equal(response.status, 200);
    const forwarded = JSON.parse(route.calls.at(-1).options.body);
    assert.equal(forwarded.action, action);
    assert.equal(forwarded.apiKey, "server-key");
    assert.deepEqual(forwarded.payload, { test: 1 });
  }
});

const officialRouteExists = fs.existsSync(path.join(__dirname, "../app/api/official-import/route.ts"));
test("Dedicated Confirm rejects unset/false flags before PDF parsing or backend calls", { skip: !officialRouteExists }, async () => {
  for (const enabled of [undefined, "false", "TRUE", "1"]) {
    const route = loadRoute("app/api/official-import/route.ts", enabled);
    const form = new FormData();
    form.set("mode", "confirm");
    form.set("file", new File(["%PDF-test"], "test.pdf", { type: "application/pdf" }));
    const response = await route.post({ formData: async () => form });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /disabled/);
    assert.equal(route.calls.length, 0);
  }
});
