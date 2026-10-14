"use client";

import { useMemo, useState } from "react";

type ImportStatus =
  | "ALREADY_OFFICIAL"
  | "MATCHED_PROVISIONAL"
  | "NEW"
  | "MISMATCH"
  | "EXCLUDED";

type ImportChange = {
  field: string;
  before: string;
  after: string;
};

type ImportItem = {
  index: number;
  status: ImportStatus;
  reason: string;
  changes: ImportChange[];
  masterLogId?: string;
  masterDate?: string;
  queueDate?: string;
  record: {
    date: string;
    flight: string;
    dep: string;
    arr: string;
    registration: string;
    dutyCode: string;
    outGmt: string;
    inGmt: string;
    block: string;
    companyTime: string;
    molitTime: string;
    night: string;
    inst: string;
    takeoff: string;
    landing: string;
    autoland: string;
  };
};

type Preview = {
  sourceId: string;
  sourcePreviouslyRegistered: boolean;
  registeredSourceId?: string;
  alreadyImported: boolean;
  hasMismatches: boolean;
  canConfirm: boolean;
  counts: Record<ImportStatus, number>;
  items: ImportItem[];
};

type AnalyzeResponse = {
  source: {
    fileName: string;
    fileSize: number;
    sha256: string;
    totalPages: number;
    coverageFrom: string;
    coverageTo: string;
    sectorCount: number;
  };
  parserWarnings: string[];
  preview: Preview;
  confirmEnabled: boolean;
};

type ConfirmResponse = {
  result: {
    status: "IMPORTED" | "ALREADY_IMPORTED";
    sourceId: string;
    driveUrl?: string;
    counts: Record<ImportStatus, number>;
    verificationCounts?: Record<ImportStatus, number>;
    storage?: {
      movedToActive?: string[];
      movedToArchive?: string[];
      warning?: string;
      warnings?: string[];
      coverageFrom?: string;
      coverageTo?: string;
    };
  };
};

const labels: Record<ImportStatus, string> = {
  ALREADY_OFFICIAL: "Already official",
  MATCHED_PROVISIONAL: "Provisional → Official",
  NEW: "New official",
  MISMATCH: "Mismatch",
  EXCLUDED: "Excluded",
};

function Stat({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: number;
  tone?: "normal" | "good" | "warn" | "danger";
}) {
  const toneClass =
    tone === "good"
      ? "text-[var(--green)]"
      : tone === "warn"
      ? "text-[var(--amber)]"
      : tone === "danger"
      ? "text-[var(--danger)]"
      : "text-[var(--text)]";

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className={`text-[24px] font-bold tracking-[-0.03em] ${toneClass}`}>
        {value}
      </div>
      <div className="mt-1 text-[12px] font-semibold text-[var(--muted)]">
        {label}
      </div>
    </div>
  );
}

async function postPdf(
  file: File,
  mode: "analyze" | "confirm",
  expectedSha256?: string
) {
  const form = new FormData();
  form.set("mode", mode);
  form.set("file", file);
  if (expectedSha256) form.set("expectedSha256", expectedSha256);

  const response = await fetch("/api/official-import", {
    method: "POST",
    body: form,
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || "Official PDF import request failed.");
  }

  return data;
}

export default function OfficialImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [result, setResult] = useState<ConfirmResponse | null>(null);
  const [busy, setBusy] = useState<"" | "analyze" | "confirm">("");
  const [error, setError] = useState("");

  const reviewItems = useMemo(
    () =>
      analysis?.preview.items.filter(
        (item) => item.status !== "ALREADY_OFFICIAL"
      ) ?? [],
    [analysis]
  );

  async function analyze() {
    if (!file) return;

    setBusy("analyze");
    setError("");
    setResult(null);

    try {
      const data = (await postPdf(file, "analyze")) as AnalyzeResponse;
      setAnalysis(data);
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setBusy("");
    }
  }

  async function confirmImport() {
    if (!file || !analysis) return;

    setBusy("confirm");
    setError("");

    try {
      const data = (await postPdf(
        file,
        "confirm",
        analysis.source.sha256
      )) as ConfirmResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy("");
    }
  }

  const confirmBlocked =
    !analysis ||
    analysis.parserWarnings.length > 0 ||
    !analysis.preview.canConfirm ||
    analysis.preview.alreadyImported ||
    !analysis.confirmEnabled ||
    busy !== "";

  return (
    <div className="pt-8">
      <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="text-[13px] font-semibold text-[var(--muted)]">
          OFFICIAL SOURCE
        </div>
        <h2 className="mt-2 text-[24px] font-bold tracking-[-0.03em]">
          Flight Log PDF Import
        </h2>
        <p className="mt-2 max-w-[720px] text-[14px] leading-6 text-[var(--text-2)]">
          대한항공 Flight Log Report 원본을 분석한 뒤 Master와 비교합니다.
          Confirm 전에는 Master나 공식 원본 폴더를 수정하지 않습니다.
        </p>

        <label className="mt-6 block rounded-2xl border border-dashed border-[var(--line)] bg-[var(--soft)] p-5">
          <div className="text-[14px] font-semibold">PDF 선택</div>
          <div className="mt-1 text-[12px] text-[var(--muted)]">
            원본 Flight Log Report PDF · 최대 5 MB
          </div>
          <input
            className="mt-4 block w-full text-[13px]"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setFile(next);
              setAnalysis(null);
              setResult(null);
              setError("");
            }}
          />
        </label>

        <button
          type="button"
          disabled={!file || busy !== ""}
          onClick={() => void analyze()}
          className="mt-4 h-12 w-full rounded-2xl bg-[var(--blue)] px-5 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {busy === "analyze" ? "Analyzing…" : "Analyze PDF"}
        </button>

        {error ? (
          <div className="mt-4 rounded-2xl bg-red-500/10 p-4 text-[13px] font-semibold text-[var(--danger)]">
            {error}
          </div>
        ) : null}
      </section>

      {analysis ? (
        <section className="mt-6">
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[13px] font-semibold text-[var(--muted)]">
                  ANALYSIS
                </div>
                <div className="mt-2 text-[18px] font-bold">
                  {analysis.source.fileName}
                </div>
                <div className="mt-2 text-[13px] leading-6 text-[var(--text-2)]">
                  Coverage {analysis.source.coverageFrom} →{" "}
                  {analysis.source.coverageTo}
                  <br />
                  {analysis.source.sectorCount} sectors ·{" "}
                  {analysis.source.totalPages} pages
                </div>
              </div>
              <div className="rounded-xl bg-[var(--soft)] px-3 py-2 font-mono text-[11px] text-[var(--muted)]">
                {analysis.preview.sourceId}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat
                label="Matched"
                value={analysis.preview.counts.ALREADY_OFFICIAL}
                tone="good"
              />
              <Stat
                label="Officialize"
                value={analysis.preview.counts.MATCHED_PROVISIONAL}
                tone="warn"
              />
              <Stat
                label="New"
                value={analysis.preview.counts.NEW}
                tone="warn"
              />
              <Stat
                label="Mismatch"
                value={analysis.preview.counts.MISMATCH}
                tone={
                  analysis.preview.counts.MISMATCH ? "danger" : "normal"
                }
              />
              <Stat
                label="Excluded"
                value={analysis.preview.counts.EXCLUDED}
              />
            </div>

            {analysis.parserWarnings.length ? (
              <div className="mt-5 rounded-2xl bg-red-500/10 p-4 text-[13px] text-[var(--danger)]">
                <div className="font-bold">
                  Parser warning {analysis.parserWarnings.length}건
                </div>
                <div className="mt-1">
                  모든 source row가 해석되기 전에는 Confirm할 수 없습니다.
                </div>
              </div>
            ) : null}

            {analysis.preview.hasMismatches ? (
              <div className="mt-5 rounded-2xl bg-red-500/10 p-4 text-[13px] text-[var(--danger)]">
                기존 OFFICIAL 값과 다른 sector가 있습니다. 자동 overwrite하지
                않고 import를 차단합니다.
              </div>
            ) : null}

            {analysis.preview.alreadyImported ? (
              <div className="mt-5 rounded-2xl bg-[var(--green-soft)] p-4 text-[13px] font-semibold text-[var(--green)]">
                이미 반영된 PDF입니다. 중복 import하지 않습니다.
              </div>
            ) : null}
          </div>

          {reviewItems.length ? (
            <div className="mt-5 space-y-3">
              {reviewItems.slice(0, 30).map((item) => (
                <article
                  key={`${item.index}-${item.record.flight}`}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold">
                      {item.record.date} · {item.record.flight} ·{" "}
                      {item.record.dep} → {item.record.arr}
                    </div>
                    <div
                      className={
                        item.status === "MISMATCH"
                          ? "text-[12px] font-bold text-[var(--danger)]"
                          : item.status === "MATCHED_PROVISIONAL" ||
                            item.status === "NEW"
                          ? "text-[12px] font-bold text-[var(--amber)]"
                          : "text-[12px] font-bold text-[var(--muted)]"
                      }
                    >
                      {labels[item.status]}
                    </div>
                  </div>

                  <div className="mt-2 text-[12px] leading-5 text-[var(--muted)]">
                    {item.reason}
                  </div>

                  {item.queueDate && item.queueDate !== item.record.date ? (
                    <div className="mt-2 text-[12px] font-semibold text-[var(--blue)]">
                      Date boundary: Queue {item.queueDate} ↔ Official{" "}
                      {item.record.date}
                    </div>
                  ) : null}

                  {item.changes.length ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {item.changes.map((change) => (
                        <div
                          key={change.field}
                          className="rounded-xl bg-[var(--soft)] px-3 py-2 text-[12px]"
                        >
                          <span className="font-bold">{change.field}</span>{" "}
                          <span className="text-[var(--muted)]">
                            {change.before || "blank"} →{" "}
                          </span>
                          <span>{change.after || "blank"}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}

              {reviewItems.length > 30 ? (
                <div className="text-center text-[12px] text-[var(--muted)]">
                  + {reviewItems.length - 30} more sectors
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
            <div className="text-[14px] font-bold">Confirm 시 수행되는 작업</div>
            <div className="mt-2 text-[13px] leading-6 text-[var(--text-2)]">
              Master backup → official reconciliation → audit 기록 →
              원본 PDF 보관 → rolling coverage 검증 → redundant PDF만
              Archive_Redundant 이동. 원본은 삭제하지 않습니다.
            </div>

            {!analysis.confirmEnabled ? (
              <div className="mt-4 rounded-2xl bg-[var(--amber-soft)] p-4 text-[12px] font-semibold text-[var(--amber)]">
                Confirm은 서버에서 잠겨 있습니다. Analyze는 read-only로 사용할 수 있습니다.
              </div>
            ) : null}

            <button
              type="button"
              disabled={confirmBlocked}
              onClick={() => void confirmImport()}
              className="mt-5 h-12 w-full rounded-2xl bg-[var(--blue)] px-5 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {busy === "confirm" ? "Importing…" : "Confirm Import"}
            </button>
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          <div className="text-[13px] font-semibold text-[var(--green)]">
            IMPORT COMPLETE
          </div>
          <div className="mt-2 text-[22px] font-bold">
            {result.result.status === "ALREADY_IMPORTED"
              ? "Already imported"
              : "Official log updated"}
          </div>
          <div className="mt-2 text-[13px] leading-6 text-[var(--text-2)]">
            {result.result.sourceId}
            {result.result.storage?.coverageFrom ? (
              <>
                <br />
                Active evidence coverage {result.result.storage.coverageFrom} →{" "}
                {result.result.storage.coverageTo}
              </>
            ) : null}
          </div>

          {result.result.storage?.movedToArchive?.length ? (
            <div className="mt-4 rounded-2xl bg-[var(--soft)] p-4 text-[12px] leading-5">
              Archive_Redundant 이동:{" "}
              {result.result.storage.movedToArchive.join(", ")}
            </div>
          ) : null}

          {result.result.storage?.warning ? (
            <div className="mt-4 rounded-2xl bg-[var(--amber-soft)] p-4 text-[12px] text-[var(--amber)]">
              {result.result.storage.warning}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
