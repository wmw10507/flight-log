import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { parseKoreanAirFlightLogText } from "@/lib/official-flight-log";

export const runtime = "nodejs";

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const API_KEY = process.env.FLIGHT_LOG_API_KEY;
const CONFIRM_ENABLED = process.env.OFFICIAL_IMPORT_CONFIRM_ENABLED === "true";

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 30;
const MAX_RECORDS = 1000;
const EXTRACTION_TIMEOUT_MS = 15_000;

type Mode = "analyze" | "confirm";

async function callAppsScript(action: string, payload: unknown) {
  if (!APPS_SCRIPT_URL) {
    throw new Error("APPS_SCRIPT_URL is not configured.");
  }
  if (!API_KEY) {
    throw new Error("FLIGHT_LOG_API_KEY is not configured.");
  }

  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload, apiKey: API_KEY }),
    redirect: "follow",
    cache: "no-store",
  });

  const raw = await response.text();
  let envelope: { ok?: boolean; data?: unknown; error?: string };
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new Error("Apps Script returned a non-JSON response.");
  }

  if (!response.ok || !envelope.ok) {
    throw new Error(envelope.error || "Apps Script request failed.");
  }

  return envelope.data;
}

async function extractPdf(file: File) {
  if (file.type && file.type !== "application/pdf") {
    throw new Error("Only PDF files are supported.");
  }
  if (file.size <= 0) {
    throw new Error("The selected PDF is empty.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("PDF is too large. Maximum size is 5 MB.");
  }
  if ((file.name || "").length > 180) {
    throw new Error("PDF filename is too long.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") {
    throw new Error("The selected file does not contain a valid PDF signature.");
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // PDF.js can transfer/detach its input buffer. Keep the original for storage.
  const pdf = await getDocumentProxy(bytes.slice(), {
    maxImageSize: 16_777_216,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });

  try {
    if (pdf.numPages > MAX_PAGES) {
      throw new Error(`PDF has too many pages (${pdf.numPages}).`);
    }

    const extraction = await Promise.race([
      extractText(pdf, { mergePages: true }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("PDF text extraction timed out.")),
          EXTRACTION_TIMEOUT_MS
        )
      ),
    ]);

    const text = extraction.text;

    if (!/Flight\s+Log\s+Report/i.test(text)) {
      throw new Error(
        "This does not look like a Korean Air Flight Log Report."
      );
    }

    const parsed = parseKoreanAirFlightLogText(text);
    const metadata = await pdf.getMetadata();
    const creation = String((metadata.info as Record<string, unknown>).CreationDate || "").match(
      /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/
    );
    const reportCreatedAt = creation
      ? `${creation[1]}-${creation[2]}-${creation[3]}T${creation[4]}:${creation[5]}:${creation[6]}Z`
      : "";
    if (parsed.records.length > MAX_RECORDS) {
      throw new Error("Too many flight records were detected.");
    }

    return {
      bytes,
      sha256,
      totalPages: extraction.totalPages,
      reportCreatedAt,
      ...parsed,
    };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const mode = String(form.get("mode") || "analyze") as Mode;
    const file = form.get("file");

    if (mode !== "analyze" && mode !== "confirm") {
      throw new Error("Invalid import mode.");
    }
    if (mode === "confirm" && !CONFIRM_ENABLED) {
      return NextResponse.json(
        { error: "Official Import Confirm is disabled on this deployment. Analyze remains read-only." },
        { status: 403 }
      );
    }
    if (!(file instanceof File)) {
      throw new Error("PDF file is required.");
    }

    const parsed = await extractPdf(file);

    const source = {
      fileName: file.name || "Flight Log Report.pdf",
      mimeType: "application/pdf",
      fileSize: file.size,
      sha256: parsed.sha256,
      totalPages: parsed.totalPages,
      coverageFrom: parsed.coverageFrom,
      coverageTo: parsed.coverageTo,
      sectorCount: parsed.records.length,
      reportCreatedAt: parsed.reportCreatedAt,
    };

    if (mode === "analyze") {
      const preview = await callAppsScript("previewOfficialImport", {
        source,
        records: parsed.records,
      });

      return NextResponse.json({
        source,
        parserWarnings: parsed.warnings,
        preview,
        confirmEnabled: CONFIRM_ENABLED,
      });
    }

    if (parsed.warnings.length) {
      throw new Error(
        "Some source rows could not be parsed. Import is blocked until parsing is complete."
      );
    }

    const expectedSha = String(form.get("expectedSha256") || "").trim();
    if (expectedSha && expectedSha !== parsed.sha256) {
      throw new Error(
        "The PDF changed after analysis. Analyze the file again before importing."
      );
    }

    const result = await callAppsScript("confirmOfficialImport", {
      source,
      records: parsed.records,
      pdfBase64: Buffer.from(parsed.bytes).toString("base64"),
    });

    return NextResponse.json({ source, result });
  } catch (error) {
    console.error("Official PDF import error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown import error",
      },
      { status: 400 }
    );
  }
}
