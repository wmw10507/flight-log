export type OfficialFlightRecord = {
  date: string;
  registration: string;
  aircraftType: string;
  flight: string;
  dep: string;
  arr: string;
  dutyCode: string;
  outGmt: string;
  inGmt: string;
  block: string;
  companyTime: string;
  molitTime: string;
  night: string;
  inst: string;
  takeoff: "Y" | "N";
  landing: "Y" | "N";
  autoland: "Y" | "N" | "";
};

export type OfficialFlightLogParseResult = {
  records: OfficialFlightRecord[];
  coverageFrom: string;
  coverageTo: string;
  warnings: string[];
};

const DATE_RE = /20\d{2}-\d{2}-\d{2}/g;
const TIME = "(\\d{2}:\\d{2})";
const PREFIX =
  "^(20\\d{2}-\\d{2}-\\d{2})\\s+" +
  "(HL[A-Z0-9]{4})\\s+" +
  "([A-Z0-9]{3,4})\\s+" +
  "(KE\\d+)\\s+" +
  "([A-Z0-9]{3,4})\\s+" +
  "([A-Z0-9]{3,4})\\s+";

const EARLY_DUTY_RE = new RegExp(
  PREFIX +
    "([A-Z]{1,3})\\s+" +
    [TIME, TIME, TIME, TIME, TIME, TIME, TIME].join("\\s+") +
    "\\s+([YN])\\s+([YN])(?:\\s+([YN]))?"
);

const LATE_DUTY_RE = new RegExp(
  PREFIX +
    [TIME, TIME, TIME, TIME, TIME, TIME].join("\\s+") +
    "\\s+([YN])\\s+([YN])(?:\\s+([YN]))?\\s*" +
    TIME +
    "\\s*([A-Z]{1,3})"
);

function cleanText(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ");
}

function toRecordFromEarly(match: RegExpMatchArray): OfficialFlightRecord {
  return {
    date: match[1],
    registration: match[2],
    aircraftType: match[3],
    flight: match[4],
    dep: match[5],
    arr: match[6],
    dutyCode: match[7],
    outGmt: match[8],
    inGmt: match[9],
    block: match[10],
    companyTime: match[11],
    molitTime: match[12],
    night: match[13],
    inst: match[14],
    takeoff: match[15] as "Y" | "N",
    landing: match[16] as "Y" | "N",
    autoland: (match[17] || "") as "Y" | "N" | "",
  };
}

function toRecordFromLate(match: RegExpMatchArray): OfficialFlightRecord {
  return {
    date: match[1],
    registration: match[2],
    aircraftType: match[3],
    flight: match[4],
    dep: match[5],
    arr: match[6],
    dutyCode: match[17],
    outGmt: match[7],
    inGmt: match[8],
    block: match[9],
    companyTime: match[10],
    molitTime: match[11],
    night: match[12],
    inst: match[16],
    takeoff: match[13] as "Y" | "N",
    landing: match[14] as "Y" | "N",
    autoland: (match[15] || "") as "Y" | "N" | "",
  };
}

export function parseKoreanAirFlightLogText(
  input: string
): OfficialFlightLogParseResult {
  const text = cleanText(input || "");

  // JasperReports extraction can concatenate rows. Force a boundary before every
  // source date and then parse only chunks that begin with a flight date.
  const withBoundaries = text.replace(DATE_RE, (date) => `\n${date}`);
  const chunks = withBoundaries
    .split("\n")
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) =>
      /^20\d{2}-\d{2}-\d{2}\s+HL[A-Z0-9]{4}\b/.test(value)
    );

  const records: OfficialFlightRecord[] = [];
  const warnings: string[] = [];

  for (const chunk of chunks) {
    const early = chunk.match(EARLY_DUTY_RE);
    if (early) {
      records.push(toRecordFromEarly(early));
      continue;
    }

    const late = chunk.match(LATE_DUTY_RE);
    if (late) {
      records.push(toRecordFromLate(late));
      continue;
    }

    warnings.push(`Unparsed source row: ${chunk.slice(0, 180)}`);
  }

  if (!records.length) {
    throw new Error(
      "No Korean Air Flight Log rows were detected. Check that this is the original Flight Log Report PDF."
    );
  }

  records.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate) return byDate;
    const byOut = a.outGmt.localeCompare(b.outGmt);
    if (byOut) return byOut;
    return a.flight.localeCompare(b.flight);
  });

  const unique = new Map<string, OfficialFlightRecord>();
  for (const record of records) {
    const key = [
      record.date,
      record.flight,
      record.dep,
      record.arr,
      record.outGmt,
      record.inGmt,
    ].join("|");

    const previous = unique.get(key);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(record)) {
        throw new Error(`Conflicting duplicate source row: ${key}`);
      }
      continue;
    }
    unique.set(key, record);
  }

  const deduped = Array.from(unique.values());

  return {
    records: deduped,
    coverageFrom: deduped[0].date,
    coverageTo: deduped[deduped.length - 1].date,
    warnings,
  };
}
