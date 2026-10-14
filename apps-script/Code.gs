// Flight LOG v0.2.7 selective reads — full replacement
// Flight LOG Code.gs — v0.2.4 Data Priority Guard
// Data priority: Official Flight Log > Post-flight actual > FLT SCH actual > FLT SCH scheduled
// 2026-10-06
//
// Changes:
// 1) Queue LATEST OUT/IN is protected once a row becomes FLOWN/PROVISIONAL,
//    MASTER/OFFICIAL, DEADHEAD/TRAVEL, or CANCELLED.
// 2) Master actual/official OUT_GMT / IN_GMT remain protected.
// 3) Provisional creation stores calendar-derived times only in CAL_OUT_KST / CAL_IN_KST.
// 4) Duplicate jsonResponse_ definition removed.
//
// NOTE: Taxi eligibility is not in this file. It belongs to the separate FLT OPS sync script.

const CONFIG = {
  SPREADSHEET_ID: '1tD003yx6BtwFIquQygztZvd4vppcBrT6RSPkMLOYkhs',

  MASTER_SHEET: 'FLIGHT_LOG_MASTER',
  QUEUE_SHEET: 'SCHEDULE_QUEUE',

  FLT_SCH_CALENDAR_ID:
    '1637e934f5b745efb643b55970f2ef6d34dfe9fffb30013364aeaacf0fc5e297@group.calendar.google.com',

  TIMEZONE: 'Asia/Seoul',

  APP_PAST_DAYS: 7,
  APP_FUTURE_DAYS: 45,

  SYNC_PAST_DAYS: 7,
  SYNC_FUTURE_DAYS: 45,

  ROTATION_MAX_GAP_HOURS: 36,
  ROTATION_MAX_LEGS: 4,

  RECENCY_DAYS: 90,
  RECENCY_REQUIRED: 3,

  STANDARD_TYPE_32S: 'A321-272NX',

  DOCUMENT_REGISTER_SHEET: 'DOCUMENT_REGISTER',
  OFFICIAL_IMPORT_SHEET: 'OFFICIAL_IMPORT',
  OFFICIAL_ACTIVE_FOLDER_ID: '1OQugjwi7EzDBSW7buKq5nTeCqaDc-NRV',
  OFFICIAL_ARCHIVE_FOLDER_ID: '1xF1T42rnNwNzlxIm_gizTauj_42YHaua',
  OFFICIAL_STAGING_FOLDER_NAME: 'Import_Staging'
};


/* =========================================================
   COLUMN MAP
========================================================= */

const MASTER_COL = {
  LOG_ID: 1,
  DATE: 2,
  APP_TYPE: 3,
  APP_NO: 4,
  FLIGHT: 5,
  DEP: 6,
  ARR: 7,
  ROUTE: 8,
  PFPM_OVERRIDE: 9,
  COMMENT: 10,

  REG: 11,
  DUTY: 12,
  POSITION: 13,
  PIC: 14,

  OUT_GMT: 15,
  IN_GMT: 16,
  BLOCK: 17,

  COMPANY: 18,
  MOLIT: 19,

  DAY: 20,
  NIGHT: 21,
  INST: 22,
  IFR: 23,
  FAA_ACTUAL: 24,
  SIM_INST: 25,

  TAKEOFF: 26,
  LANDING: 27,
  AUTOLAND: 28,
  PFPM: 29,

  PIC_TIME: 30,
  SIC: 31,
  PICUS: 32,

  SAFETY: 33,
  SAFETY_CREDIT: 34,

  TRAINING: 35,
  DOM_INTL: 36,

  CUM_BLOCK: 37,
  CUM_CREDIT: 38,

  VERIFICATION: 39,
  SOURCE_ID: 40,
  REMARKS: 41,
  OP_TYPE: 42,
  CREW: 43,
  CREDIT_BASIS: 44,

  PFPM_MIRROR: 45,

  PIC_STATUS: 53,
  CREW_SOURCE: 54,
  COMMENT_MIRROR: 55,
  APP_TYPE_MIRROR: 56,
  APP_NO_MIRROR: 57,

  MONTH: 59,
  OPERATOR: 60,
  TYPE_RAW: 61,
  STANDARD_TYPE: 62,
  BT_SOURCE: 63,
  RECORD_STATUS: 64,
  INBOX_NOTE: 65,
  POSTFLIGHT_STATUS: 66,

  CAL_OUT_KST: 67,
  CAL_IN_KST: 68,
  EVENT_ID: 69,
  SYNC_NOTE: 70
};


const QUEUE_COL = {
  EVENT_ID: 1,
  DATE: 2,
  FLIGHT: 3,
  DEP: 4,
  ARR: 5,
  ROUTE: 6,

  ORIGINAL_OUT: 7,
  ORIGINAL_IN: 8,

  LATEST_OUT: 9,
  LATEST_IN: 10,

  STATUS: 11,
  MEMO: 12,
  MASTER_LOG_ID: 13,
  SOURCE: 14
};


/* =========================================================
   WEB APP
========================================================= */

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Flight LOG')
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );
}


/* =========================================================
   APP DATA
========================================================= */

function getAppData() {

  const flights = getQueueFlights({ readOnly: true });

  const now = new Date();

  const pastLimit =
    new Date(
      now.getTime() -
      CONFIG.APP_PAST_DAYS *
      24 *
      60 *
      60 *
      1000
    );


  const pastFlights =
    flights
      .filter(
        f =>
          f.completed &&
          f.inDate &&
          f.inDate >= pastLimit
      )
      .sort(
        (a, b) => {

          const aPending =
            a.postFlightStatus !==
            'COMPLETE';

          const bPending =
            b.postFlightStatus !==
            'COMPLETE';

          if (
            aPending !== bPending
          ) {
            return aPending
              ? -1
              : 1;
          }

          return (
            b.inDate.getTime() -
            a.inDate.getTime()
          );
        }
      );


  const futureFlights =
    flights
      .filter(
        f =>
          f.outDate &&
          f.outDate > now &&
          !f.completed
      )
      .sort(
        (a, b) =>
          a.outDate.getTime() -
          b.outDate.getTime()
      );


  const upcomingRotation =
    buildNextRotation(
      futureFlights
    );


  let selectedEventId = '';

  const pending =
    pastFlights.find(
      f =>
        f.postFlightStatus !==
        'COMPLETE'
    );

  if (pending) {

    selectedEventId =
      pending.eventId;

  } else if (
    pastFlights.length
  ) {

    selectedEventId =
      pastFlights[0].eventId;

  } else if (
    upcomingRotation.length
  ) {

    selectedEventId =
      upcomingRotation[0].eventId;
  }


  return {
    pastFlights:
      pastFlights.map(cleanFlightForClient),

    upcomingRotation:
      upcomingRotation.map(cleanFlightForClient),

    selectedEventId:
      selectedEventId
  };
}


/* =========================================================
   QUEUE → APP
========================================================= */

function getQueueFlights(readOptions) {

  const ss =
    openFlightSpreadsheet_(
      CONFIG.SPREADSHEET_ID
    );

  const sheet =
    ss.getSheetByName(
      CONFIG.QUEUE_SHEET
    );

  const lastRow =
    sheet.getLastRow();

  if (
    lastRow < 2
  ) {
    return [];
  }


  const rows =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        14
      )
      .getDisplayValues();


  const masterIndex = readOptions && readOptions.readOnly
    ? buildMasterIndexUncached_({ queueRows: rows })
    : buildMasterIndex();


  const now =
    new Date();


  const flights = [];


  rows.forEach(
    (row, idx) => {

      const status =
        String(
          row[
            QUEUE_COL.STATUS - 1
          ] || ''
        ).toUpperCase();


      if (
        status.includes('CANCELLED') ||
        status.includes('DEADHEAD') ||
        status.includes('TRAVEL')
      ) {
        return;
      }


      const date =
        normalizeDateString(
          row[
            QUEUE_COL.DATE - 1
          ]
        );


      const flight =
        normalizeFlightNo(
          row[
            QUEUE_COL.FLIGHT - 1
          ]
        );


      const dep =
        String(
          row[
            QUEUE_COL.DEP - 1
          ] || ''
        ).trim().toUpperCase();


      const arr =
        String(
          row[
            QUEUE_COL.ARR - 1
          ] || ''
        ).trim().toUpperCase();


      if (
        !date ||
        !flight ||
        !dep ||
        !arr
      ) {
        return;
      }


      const outStr =
        row[
          QUEUE_COL.LATEST_OUT - 1
        ]
        ||
        row[
          QUEUE_COL.ORIGINAL_OUT - 1
        ];


      const inStr =
        row[
          QUEUE_COL.LATEST_IN - 1
        ]
        ||
        row[
          QUEUE_COL.ORIGINAL_IN - 1
        ];


      const outDate =
        parseKstDateTime(
          outStr
        );


      const inDate =
        parseKstDateTime(
          inStr
        );


      const key =
        makeFlightKey(
          date,
          flight,
          dep,
          arr
        );


      const master =
        findMasterForQueue_(
          masterIndex,
          {
            masterLogId: row[QUEUE_COL.MASTER_LOG_ID - 1],
            date: date,
            flight: flight,
            dep: dep,
            arr: arr,
            eventId:
              row[
                QUEUE_COL.EVENT_ID - 1
              ],
            out: outStr
          }
        ) ||
        null;


      const effectiveOutStr =
        master && master.calOutKst
          ? master.calOutKst
          : outStr;


      const effectiveInStr =
        master && master.calInKst
          ? master.calInKst
          : inStr;


      const effectiveOutDate =
        parseKstDateTime(
          effectiveOutStr
        );


      const effectiveInDate =
        parseKstDateTime(
          effectiveInStr
        );


      const memo =
        row[
          QUEUE_COL.MEMO - 1
        ] || '';


      const crew =
        parseCrewMemo(
          memo
        );


      const recordStatus =
        master
          ? master.recordStatus
          : '';


      const postFlightStatus =
        master
          ? (
              master.postFlightStatus ||
              'PENDING USER INPUT'
            )
          : 'PENDING USER INPUT';


      flights.push({

        queueRow:
          idx + 2,

        eventId:
          row[
            QUEUE_COL.EVENT_ID - 1
          ],

        date:
          date,

        officialDate: master ? master.date : '',
        outGmt: master ? master.outGmt : '',
        inGmt: master ? master.inGmt : '',
        company: master ? master.company : '',
        molit: master ? master.molit : '',

        flight:
          flight,

        dep:
          dep,

        arr:
          arr,

        route:
          dep + '-' + arr,

        out:
          effectiveOutStr,

        in:
          effectiveInStr,

        outDate:
          effectiveOutDate,

        inDate:
          effectiveInDate,

        outDisplay:
          (master && masterTimeToKst_(master.outGmt)) || timeFromDateTimeString(
            effectiveOutStr
          ),

        inDisplay:
          (master && masterTimeToKst_(master.inGmt)) || timeFromDateTimeString(
            effectiveInStr
          ),

        block:
          (master && master.block) || calcBlockTime(
            effectiveOutDate,
            effectiveInDate
          ),

        completed:
          !!(
            effectiveInDate &&
            effectiveInDate <= now
          ),

        status:
          status,

        source:
          row[
            QUEUE_COL.SOURCE - 1
          ] || '',

        masterLogId:
          master
            ? master.logId
            : (
                row[
                  QUEUE_COL.MASTER_LOG_ID - 1
                ] || ''
              ),

        recordStatus:
          recordStatus,

        official:
          String(
            recordStatus
          )
            .toUpperCase()
            .includes(
              'OFFICIAL'
            ),

        postFlightStatus:
          postFlightStatus,

        pfpmOverride:
          master
            ? master.pfpmOverride
            : '',

        approachType:
          master
            ? master.approachType
            : '',

        approachNo:
          master
            ? master.approachNo
            : '',

        comment:
          master
            ? master.comment
            : '',

        takeoff:
          master
            ? master.takeoff
            : '',

        landing:
          master
            ? master.landing
            : '',

        pic:
          master && master.pic
            ? master.pic
            : crew.pic,

        role:
          master && master.position
            ? master.position
            : crew.role,

        safetyPilot:
          master
            ? master.safetyPilot
            : crew.safetyPilot,

        fdt:
          crew.fdt,

        crewType:
          master && master.crew
            ? master.crew
            : crew.crewType
      });
    }
  );


  return flights;
}


/* =========================================================
   MASTER INDEX
========================================================= */

function buildMasterIndexUncached_(selection) {

  const ss =
    openFlightSpreadsheet_(
      CONFIG.SPREADSHEET_ID
    );

  const sheet =
    ss.getSheetByName(
      CONFIG.MASTER_SHEET
    );

  const lastRow =
    sheet.getLastRow();

  if (
    lastRow < 2
  ) {
    return {};
  }


  const rows =
    readMasterRows_(sheet, lastRow, 70, selection);


  const index = {};
  // Keep every physical row by Log ID, even when legacy tuple keys collide.
  // Non-enumerable so existing reconciliation code still sees only tuple entries.
  Object.defineProperty(index, 'byLogId', { value: Object.create(null) });


  rows.forEach(
    (row, i) => {

      const date =
        normalizeDateString(
          row[
            MASTER_COL.DATE - 1
          ]
        );


      const flight =
        normalizeFlightNo(
          row[
            MASTER_COL.FLIGHT - 1
          ]
        );


      const dep =
        String(
          row[
            MASTER_COL.DEP - 1
          ] || ''
        ).trim().toUpperCase();


      const arr =
        String(
          row[
            MASTER_COL.ARR - 1
          ] || ''
        ).trim().toUpperCase();


      if (
        !date ||
        !flight ||
        !dep ||
        !arr
      ) {
        return;
      }


      const key =
        makeFlightKey(
          date,
          flight,
          dep,
          arr
        );


      const record = {

        sheetRow:
          i + 2,

        date:
          date,

        flight:
          flight,

        dep:
          dep,

        arr:
          arr,

        logId:
          row[
            MASTER_COL.LOG_ID - 1
          ],

        approachType:
          row[
            MASTER_COL.APP_TYPE - 1
          ],

        approachNo:
          row[
            MASTER_COL.APP_NO - 1
          ],

        pfpmOverride:
          row[
            MASTER_COL.PFPM_OVERRIDE - 1
          ],

        comment:
          row[
            MASTER_COL.COMMENT - 1
          ],

        position:
          row[
            MASTER_COL.POSITION - 1
          ],

        pic:
          row[
            MASTER_COL.PIC - 1
          ],

        takeoff:
          normalizeYesNoBlank(
            row[
              MASTER_COL.TAKEOFF - 1
            ]
          ),

        landing:
          normalizeYesNoBlank(
            row[
              MASTER_COL.LANDING - 1
            ]
          ),

        safetyPilot:
          normalizeYesNoBlank(
            row[
              MASTER_COL.SAFETY - 1
            ]
          ) === 'Y',

        crew:
          row[
            MASTER_COL.CREW - 1
          ],

        recordStatus:
          row[
            MASTER_COL.RECORD_STATUS - 1
          ],

        postFlightStatus:
          row[
            MASTER_COL.POSTFLIGHT_STATUS - 1
          ],

        eventId:
          row[
            MASTER_COL.EVENT_ID - 1
          ],

        calOutKst:
          row[
            MASTER_COL.CAL_OUT_KST - 1
          ],

        calInKst:
          row[
            MASTER_COL.CAL_IN_KST - 1
          ],
        outGmt: row[MASTER_COL.OUT_GMT - 1],
        inGmt: row[MASTER_COL.IN_GMT - 1],
        block: row[MASTER_COL.BLOCK - 1],
        company: row[MASTER_COL.COMPANY - 1],
        molit: row[MASTER_COL.MOLIT - 1]
      };
      index[key] = record;
      const logId = String(record.logId || '').trim();
      if (logId) {
        if (!index.byLogId[logId]) index.byLogId[logId] = [];
        index.byLogId[logId].push(record);
      }
    }
  );


  return index;
}



/* =========================================================
   MASTER IDENTITY / EFFECTIVE MATCHING
========================================================= */

// Shared by Today hydration and SAVE & DONE. Queue ID is authoritative.
// A missing/duplicate referenced ID must never redirect to a different record.
function findMasterForQueue_(masterIndex, flight) {
  const logId = String(flight.masterLogId || '').trim();
  if (logId) {
    const matches = masterIndex.byLogId && masterIndex.byLogId[logId];
    return matches && matches.length === 1 ? matches[0] : null;
  }
  const key = makeFlightKey(flight.date, flight.flight, flight.dep, flight.arr);
  return key && masterIndex[key] || null;
}

// Today clocks remain KST; official date is kept separately, never inferred
// from a clock-only GMT value or written back to either date column.
function masterTimeToKst_(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return '';
  return String((Number(match[1]) + 9) % 24).padStart(2, '0') + ':' + match[2];
}

function findExistingMasterByIdentity(
  masterIndex,
  flight
) {

  if (
    !masterIndex ||
    !flight
  ) {
    return null;
  }


  const eventId =
    String(
      flight.eventId || ''
    ).trim();


  if (
    eventId
  ) {

    const byEventId =
      Object.keys(
        masterIndex
      )
        .map(
          key =>
            masterIndex[
              key
            ]
        )
        .find(
          row =>
            String(
              row.eventId || ''
            ).trim() ===
              eventId
        );


    if (
      byEventId
    ) {
      return byEventId;
    }
  }


  const date =
    normalizeDateString(
      flight.date
    );


  const flightNo =
    normalizeFlightNo(
      flight.flight ||
      flight.flightNo
    );


  const dep =
    String(
      flight.dep || ''
    )
      .trim()
      .toUpperCase();


  const arr =
    String(
      flight.arr || ''
    )
      .trim()
      .toUpperCase();


  const exactKey =
    makeFlightKey(
      date,
      flightNo,
      dep,
      arr
    );


  if (
    exactKey &&
    masterIndex[
      exactKey
    ]
  ) {
    return masterIndex[
      exactKey
    ];
  }


  const candidates =
    Object.keys(
      masterIndex
    )
      .map(
        key =>
          masterIndex[
            key
          ]
      )
      .filter(
        row =>
          normalizeFlightNo(
            row.flight
          ) ===
            flightNo
          &&
          String(
            row.dep || ''
          ).toUpperCase() ===
            dep
          &&
          String(
            row.arr || ''
          ).toUpperCase() ===
            arr
          &&
          adjacentCalendarDate(
            row.date,
            date
          )
      );


  /*
   * Auto-merge only if unambiguous.
   */
  if (
    candidates.length === 1
  ) {
    return candidates[0];
  }


  return null;
}


function adjacentCalendarDate(
  a,
  b
) {

  a =
    normalizeDateString(
      a
    );


  b =
    normalizeDateString(
      b
    );


  if (
    !a ||
    !b
  ) {
    return false;
  }


  const da =
    new Date(
      a +
      'T00:00:00Z'
    );


  const db =
    new Date(
      b +
      'T00:00:00Z'
    );


  const diffDays =
    Math.abs(
      da.getTime() -
      db.getTime()
    )
    /
    (
      24 *
      60 *
      60 *
      1000
    );


  return (
    diffDays === 1
  );
}


/* =========================================================
   NEXT ROTATION
========================================================= */

function buildNextRotation(
  futureFlights
) {

  if (
    !futureFlights ||
    futureFlights.length === 0
  ) {
    return [];
  }


  const rotation = [
    futureFlights[0]
  ];


  const originalOrigin =
    futureFlights[0].dep;


  for (
    let i = 1;
    i < futureFlights.length;
    i++
  ) {

    if (
      rotation.length >=
      CONFIG.ROTATION_MAX_LEGS
    ) {
      break;
    }


    const previous =
      rotation[
        rotation.length - 1
      ];


    const candidate =
      futureFlights[i];


    if (
      candidate.dep !==
      previous.arr
    ) {
      continue;
    }


    const gapHours =
      (
        candidate.outDate.getTime() -
        previous.inDate.getTime()
      )
      /
      (
        60 *
        60 *
        1000
      );


    if (
      gapHours < 0 ||
      gapHours >
      CONFIG.ROTATION_MAX_GAP_HOURS
    ) {
      continue;
    }


    rotation.push(
      candidate
    );


    if (
      candidate.arr ===
      originalOrigin
    ) {
      break;
    }
  }


  return rotation;
}


/* =========================================================
   SAVE POST-FLIGHT
========================================================= */

function savePostFlightUncached_(
  payload
) {

  const lock =
    LockService.getScriptLock();

  lock.waitLock(
    30000
  );


  try {

    if (
      !payload ||
      !payload.eventId
    ) {
      throw new Error(
        'Flight selection is missing.'
      );
    }


    const flights =
      getQueueFlights();


    const flight =
      flights.find(
        f =>
          String(f.eventId) ===
          String(payload.eventId)
      );


    if (
      !flight
    ) {
      throw new Error(
        'Flight not found in SCHEDULE_QUEUE.'
      );
    }


    if (
      !flight.completed
    ) {
      throw new Error(
        'Future flights cannot be saved as completed.'
      );
    }


    const ss =
      openFlightSpreadsheet_(
        CONFIG.SPREADSHEET_ID
      );


    const masterSheet =
      ss.getSheetByName(
        CONFIG.MASTER_SHEET
      );


    const masterIndex =
      buildMasterIndex();


    const key =
      makeFlightKey(
        flight.date,
        flight.flight,
        flight.dep,
        flight.arr
      );


    // Re-read Queue on the server; the client cannot choose the Master row.
    if (payload.masterLogId && String(payload.masterLogId).trim() !== String(flight.masterLogId || '').trim()) {
      throw new Error('Flight link changed. Refresh Today before saving.');
    }
    const existing = findMasterForQueue_(masterIndex, flight);
    if (String(flight.masterLogId || '').trim() && !existing) {
      throw new Error('Master Log ID is missing or duplicated in FLIGHT_LOG_MASTER. Save cancelled.');
    }


    let result;


    if (
      existing
    ) {

      result =
        updateExistingMasterRow(
          masterSheet,
          existing,
          flight,
          payload
        );

    } else {

      result =
        createProvisionalRow(
          masterSheet,
          flight,
          payload
        );
    }


    updateQueueAfterSave(
      flight.queueRow,
      result.logId,
      result.official
    );


    return result;

  } finally {

    lock.releaseLock();
  }
}


/* =========================================================
   UPDATE EXISTING MASTER ROW
========================================================= */

function updateExistingMasterRow(
  sheet,
  existing,
  flight,
  payload
) {

  const row =
    existing.sheetRow;


  const official =
    String(
      existing.recordStatus || ''
    )
      .toUpperCase()
      .includes(
        'OFFICIAL'
      );


  /*
   * User-owned fields
   */

  sheet
    .getRange(
      row,
      MASTER_COL.APP_TYPE
    )
    .setValue(
      cleanText(
        payload.approachType
      )
    );


  sheet
    .getRange(
      row,
      MASTER_COL.APP_NO
    )
    .setValue(
      cleanText(
        payload.approachNo
      )
    );


  sheet
    .getRange(
      row,
      MASTER_COL.PFPM_OVERRIDE
    )
    .setValue(
      cleanText(
        payload.pfpmOverride
      )
    );


  sheet
    .getRange(
      row,
      MASTER_COL.COMMENT
    )
    .setValue(
      cleanText(
        payload.comment
      )
    );


  /*
   * Mirrors
   */

  sheet
    .getRange(
      row,
      MASTER_COL.PFPM_MIRROR
    )
    .setValue(
      cleanText(
        payload.pfpmOverride
      )
    );


  sheet
    .getRange(
      row,
      MASTER_COL.COMMENT_MIRROR
    )
    .setValue(
      cleanText(
        payload.comment
      )
    );


  sheet
    .getRange(
      row,
      MASTER_COL.APP_TYPE_MIRROR
    )
    .setValue(
      cleanText(
        payload.approachType
      )
    );


  sheet
    .getRange(
      row,
      MASTER_COL.APP_NO_MIRROR
    )
    .setValue(
      cleanText(
        payload.approachNo
      )
    );


  /*
   * T/O / L/D
   *
   * IMPORTANT:
   * Official row = official values protected.
   * Provisional row = only update when user explicitly selects Y/N.
   * Blank = preserve existing value.
   */

  if (
    !official
  ) {

    const takeoff =
      normalizeYesNoBlank(
        payload.takeoff
      );


    const landing =
      normalizeYesNoBlank(
        payload.landing
      );


    if (
      takeoff !== ''
    ) {

      sheet
        .getRange(
          row,
          MASTER_COL.TAKEOFF
        )
        .setValue(
          takeoff
        );
    }


    if (
      landing !== ''
    ) {

      sheet
        .getRange(
          row,
          MASTER_COL.LANDING
        )
        .setValue(
          landing
        );
    }
  }


  /*
   * Post-flight complete
   */

  sheet
    .getRange(
      row,
      MASTER_COL.POSTFLIGHT_STATUS
    )
    .setValue(
      'COMPLETE'
    );


  /*
   * Never overwrite:
   * - official times
   * - source IDs
   * - event ID
   * - calendar provenance
   * - official status
   */


  return {
    action:
      'UPDATED',

    logId:
      existing.logId,

    official:
      official
  };
}


/* =========================================================
   CREATE PROVISIONAL MASTER ROW
========================================================= */

function createProvisionalRow(
  sheet,
  flight,
  payload
) {

  const row =
    new Array(70)
      .fill('');


  const logId =
    makeLogId(
      flight.date,
      flight.flight,
      flight.dep,
      flight.arr
    );


  setArrayCol(
    row,
    MASTER_COL.LOG_ID,
    logId
  );


  setArrayCol(
    row,
    MASTER_COL.DATE,
    flight.date
  );


  setArrayCol(
    row,
    MASTER_COL.APP_TYPE,
    cleanText(
      payload.approachType
    )
  );


  setArrayCol(
    row,
    MASTER_COL.APP_NO,
    cleanText(
      payload.approachNo
    )
  );


  setArrayCol(
    row,
    MASTER_COL.FLIGHT,
    flight.flight
  );


  setArrayCol(
    row,
    MASTER_COL.DEP,
    flight.dep
  );


  setArrayCol(
    row,
    MASTER_COL.ARR,
    flight.arr
  );


  setArrayCol(
    row,
    MASTER_COL.ROUTE,
    flight.route
  );


  setArrayCol(
    row,
    MASTER_COL.PFPM_OVERRIDE,
    cleanText(
      payload.pfpmOverride
    )
  );


  setArrayCol(
    row,
    MASTER_COL.COMMENT,
    cleanText(
      payload.comment
    )
  );


  setArrayCol(
    row,
    MASTER_COL.POSITION,
    flight.role || 'FO'
  );


  setArrayCol(
    row,
    MASTER_COL.PIC,
    flight.pic || ''
  );


  setArrayCol(
    row,
    MASTER_COL.BLOCK,
    flight.block || ''
  );


  setArrayCol(
    row,
    MASTER_COL.TAKEOFF,
    normalizeYesNoBlank(
      payload.takeoff
    )
  );


  setArrayCol(
    row,
    MASTER_COL.LANDING,
    normalizeYesNoBlank(
      payload.landing
    )
  );


  setArrayCol(
    row,
    MASTER_COL.SAFETY,
    flight.safetyPilot
      ? 'Y'
      : 'N'
  );


  setArrayCol(
    row,
    MASTER_COL.SAFETY_CREDIT,
    '0:00'
  );


  setArrayCol(
    row,
    MASTER_COL.DOM_INTL,
    determineDomesticIntl(
      flight.dep,
      flight.arr
    )
  );


  setArrayCol(
    row,
    MASTER_COL.VERIFICATION,
    'PENDING OFFICIAL'
  );


  setArrayCol(
    row,
    MASTER_COL.SOURCE_ID,
    'SRC-FLT-SCH-APP'
  );


  setArrayCol(
    row,
    MASTER_COL.REMARKS,
    'Post-flight user confirmed from Flight LOG App; official credit fields pending.'
  );


  setArrayCol(
    row,
    MASTER_COL.OP_TYPE,
    flight.safetyPilot
      ? 'SAFETY PILOT'
      : 'LINE'
  );


  setArrayCol(
    row,
    MASTER_COL.CREW,
    flight.crewType || ''
  );


  setArrayCol(
    row,
    MASTER_COL.CREDIT_BASIS,
    'No credited time until official Flight Log Report'
  );


  setArrayCol(
    row,
    MASTER_COL.PFPM_MIRROR,
    cleanText(
      payload.pfpmOverride
    )
  );


  setArrayCol(
    row,
    MASTER_COL.PIC_STATUS,
    flight.pic
      ? 'ROSTER CONFIRMED'
      : ''
  );


  setArrayCol(
    row,
    MASTER_COL.CREW_SOURCE,
    flight.source || ''
  );


  setArrayCol(
    row,
    MASTER_COL.COMMENT_MIRROR,
    cleanText(
      payload.comment
    )
  );


  setArrayCol(
    row,
    MASTER_COL.APP_TYPE_MIRROR,
    cleanText(
      payload.approachType
    )
  );


  setArrayCol(
    row,
    MASTER_COL.APP_NO_MIRROR,
    cleanText(
      payload.approachNo
    )
  );


  setArrayCol(
    row,
    MASTER_COL.MONTH,
    flight.date.slice(
      0,
      7
    )
  );


  setArrayCol(
    row,
    MASTER_COL.OPERATOR,
    'Korean Air'
  );


  setArrayCol(
    row,
    MASTER_COL.TYPE_RAW,
    '3QP'
  );


  setArrayCol(
    row,
    MASTER_COL.STANDARD_TYPE,
    CONFIG.STANDARD_TYPE_32S
  );


  setArrayCol(
    row,
    MASTER_COL.BT_SOURCE,
    'FLT SCH Calendar'
  );


  setArrayCol(
    row,
    MASTER_COL.RECORD_STATUS,
    'FLOWN / PROVISIONAL'
  );


  setArrayCol(
    row,
    MASTER_COL.INBOX_NOTE,
    'Post-flight SAVE & DONE; official reconciliation pending'
  );


  setArrayCol(
    row,
    MASTER_COL.POSTFLIGHT_STATUS,
    'COMPLETE'
  );


  /*
   * DATA PRIORITY:
   * Calendar-derived values are provenance/reference only.
   * Do NOT populate OUT_GMT / IN_GMT here.
   * Actual/official times belong there only after post-flight/official reconciliation.
   */

  setArrayCol(
    row,
    MASTER_COL.CAL_OUT_KST,
    flight.out || ''
  );


  setArrayCol(
    row,
    MASTER_COL.CAL_IN_KST,
    flight.in || ''
  );


  setArrayCol(
    row,
    MASTER_COL.EVENT_ID,
    flight.eventId || ''
  );


  setArrayCol(
    row,
    MASTER_COL.SYNC_NOTE,
    'Created by Flight LOG App from SCHEDULE_QUEUE; official reconciliation pending.'
  );


  sheet.appendRow(
    row
  );


  return {
    action:
      'CREATED',

    logId:
      logId,

    official:
      false
  };
}


/* =========================================================
   UPDATE QUEUE AFTER SAVE
========================================================= */

function updateQueueAfterSave(
  queueRow,
  logId,
  official
) {

  const ss =
    openFlightSpreadsheet_(
      CONFIG.SPREADSHEET_ID
    );

  const sheet =
    ss.getSheetByName(
      CONFIG.QUEUE_SHEET
    );


  sheet
    .getRange(
      queueRow,
      QUEUE_COL.STATUS
    )
    .setValue(
      official
        ? 'MASTER / OFFICIAL'
        : 'FLOWN / PROVISIONAL'
    );


  sheet
    .getRange(
      queueRow,
      QUEUE_COL.MASTER_LOG_ID
    )
    .setValue(
      logId
    );
}


/* =========================================================
   HISTORY
========================================================= */

function getHistoryMonth(
  year,
  month
) {

  year =
    Number(year);

  month =
    Number(month);


  const ss =
    openFlightSpreadsheet_(
      CONFIG.SPREADSHEET_ID
    );


  const sheet =
    ss.getSheetByName(
      CONFIG.MASTER_SHEET
    );


  const lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return {
      flights: []
    };
  }


  /*
   * Display values are used intentionally.
   * This avoids Google Sheets duration cells
   * being returned as Date objects.
   */

  const rows =
    readMasterRows_(sheet, lastRow, 70, { month: `${year}-${String(month).padStart(2, '0')}` });


  const targetMonth =
    `${year}-${String(month).padStart(2, '0')}`;


  const flights = [];


  rows.forEach(
    row => {

      const date =
        normalizeDateString(
          row[
            MASTER_COL.DATE - 1
          ]
        );


      if (
        !date ||
        !date.startsWith(
          targetMonth + '-'
        )
      ) {
        return;
      }


      const recordStatus =
        row[
          MASTER_COL.RECORD_STATUS - 1
        ] || '';


      flights.push({

        date:
          date,

        day:
          Number(
            date.slice(
              8,
              10
            )
          ),

        flight:
          row[
            MASTER_COL.FLIGHT - 1
          ],

        dep:
          row[
            MASTER_COL.DEP - 1
          ],

        arr:
          row[
            MASTER_COL.ARR - 1
          ],

        block:
          row[
            MASTER_COL.BLOCK - 1
          ],

        pic:
          row[
            MASTER_COL.PIC - 1
          ],

        position:
          row[
            MASTER_COL.POSITION - 1
          ],

        safetyPilot:
          normalizeYesNoBlank(
            row[
              MASTER_COL.SAFETY - 1
            ]
          ) === 'Y',

        pfpm:
          row[
            MASTER_COL.PFPM - 1
          ]
          ||
          row[
            MASTER_COL.PFPM_OVERRIDE - 1
          ],

        approachType:
          row[
            MASTER_COL.APP_TYPE - 1
          ],

        approachNo:
          row[
            MASTER_COL.APP_NO - 1
          ],

        comment:
          row[
            MASTER_COL.COMMENT - 1
          ],

        takeoff:
          normalizeYesNoBlank(
            row[
              MASTER_COL.TAKEOFF - 1
            ]
          ),

        landing:
          normalizeYesNoBlank(
            row[
              MASTER_COL.LANDING - 1
            ]
          ),

        recordStatus:
          recordStatus,

        postFlightStatus:
          row[
            MASTER_COL.POSTFLIGHT_STATUS - 1
          ],

        official:
          String(
            recordStatus
          )
            .toUpperCase()
            .includes(
              'OFFICIAL'
            ),

        timeSort:
          row[
            MASTER_COL.CAL_OUT_KST - 1
          ]
          ||
          row[
            MASTER_COL.OUT_GMT - 1
          ]
          ||
          ''
      });

    }
  );


  flights.sort(
    (a, b) => {

      if (
        a.date !==
        b.date
      ) {
        return a.date.localeCompare(
          b.date
        );
      }

      return String(
        a.timeSort
      )
        .localeCompare(
          String(
            b.timeSort
          )
        );
    }
  );


  return {
    flights:
      flights
  };
}


/* =========================================================
   RECENCY
========================================================= */

function getRecencyData() {

  const ss =
    openFlightSpreadsheet_(
      CONFIG.SPREADSHEET_ID
    );


  const sheet =
    ss.getSheetByName(
      CONFIG.MASTER_SHEET
    );


  const lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return {
      takeoff:
        emptyRecencyResult(),

      landing:
        emptyRecencyResult()
    };
  }


  const rows =
    readMasterRows_(sheet, lastRow, 70, { recency: true });


  const todayStr =
    Utilities.formatDate(
      new Date(),
      CONFIG.TIMEZONE,
      'yyyy-MM-dd'
    );


  const today =
    dateStringToUtc(
      todayStr
    );


  const windowStart =
    addUtcDays(
      today,
      -(CONFIG.RECENCY_DAYS - 1)
    );


  const takeoffEvents = [];
  const landingEvents = [];


  rows.forEach(
    row => {

      const date =
        normalizeDateString(
          row[
            MASTER_COL.DATE - 1
          ]
        );


      if (
        !date
      ) {
        return;
      }


      const eventDate =
        dateStringToUtc(
          date
        );


      if (
        !eventDate ||
        eventDate > today
      ) {
        return;
      }


      /*
       * 32S only.
       */

      const standardType =
        String(
          row[
            MASTER_COL.STANDARD_TYPE - 1
          ] || ''
        ).trim();


      if (
        standardType !==
        CONFIG.STANDARD_TYPE_32S
      ) {
        return;
      }


      const flight =
        normalizeFlightNo(
          row[
            MASTER_COL.FLIGHT - 1
          ]
        );


      const dep =
        String(
          row[
            MASTER_COL.DEP - 1
          ] || ''
        ).trim();


      const arr =
        String(
          row[
            MASTER_COL.ARR - 1
          ] || ''
        ).trim();


      const recordStatus =
        row[
          MASTER_COL.RECORD_STATUS - 1
        ] || '';


      const official =
        String(
          recordStatus
        )
          .toUpperCase()
          .includes(
            'OFFICIAL'
          );


      const base = {

        date:
          date,

        flight:
          flight,

        route:
          dep + '→' + arr,

        official:
          official,

        recordStatus:
          recordStatus,

        eventDate:
          eventDate
      };


      if (
        normalizeYesNoBlank(
          row[
            MASTER_COL.TAKEOFF - 1
          ]
        ) === 'Y'
      ) {

        takeoffEvents.push(
          Object.assign(
            {},
            base
          )
        );
      }


      if (
        normalizeYesNoBlank(
          row[
            MASTER_COL.LANDING - 1
          ]
        ) === 'Y'
      ) {

        landingEvents.push(
          Object.assign(
            {},
            base
          )
        );
      }

    }
  );


  return {

    asOf:
      todayStr,

    aircraft:
      '32S',

    rule:
      '3 in 90',

    takeoff:
      calculateRecency(
        takeoffEvents,
        today,
        windowStart
      ),

    landing:
      calculateRecency(
        landingEvents,
        today,
        windowStart
      )
  };
}


function calculateRecency(
  events,
  today,
  windowStart
) {

  events.sort(
    (a, b) =>
      b.eventDate.getTime() -
      a.eventDate.getTime()
  );


  const currentEvents =
    events.filter(
      e =>
        e.eventDate >= windowStart &&
        e.eventDate <= today
    );


  const current =
    currentEvents.length >=
    CONFIG.RECENCY_REQUIRED;


  let expiry = '';


  if (
    current
  ) {

    /*
     * Inclusive 90-day logic:
     *
     * qualifying event date = Day 1
     * expiry = event date + 89 days
     *
     * Example:
     * 23 Sep + 89 days = 21 Dec
     */

    const controllingEvent =
      currentEvents[
        CONFIG.RECENCY_REQUIRED - 1
      ];


    expiry =
      utcDateToString(
        addUtcDays(
          controllingEvent.eventDate,
          CONFIG.RECENCY_DAYS - 1
        )
      );
  }


  const recentThree =
    currentEvents
      .slice(
        0,
        CONFIG.RECENCY_REQUIRED
      )
      .map(
        e => ({
          date:
            e.date,

          flight:
            e.flight,

          route:
            e.route,

          official:
            e.official,

          source:
            e.official
              ? 'OFFICIAL'
              : 'USER / PROVISIONAL'
        })
      );


  const source =
    recentThree.length ===
    CONFIG.RECENCY_REQUIRED
    &&
    recentThree.every(
      e => e.official
    )
      ? 'Official log'
      : 'Master + User input';


  return {

    count:
      currentEvents.length,

    required:
      CONFIG.RECENCY_REQUIRED,

    days:
      CONFIG.RECENCY_DAYS,

    status:
      current
        ? 'CURRENT'
        : 'NOT CURRENT',

    expiry:
      expiry,

    source:
      source,

    recentThree:
      recentThree
  };
}


function emptyRecencyResult() {

  return {
    count: 0,
    required: 3,
    days: 90,
    status: 'NOT CURRENT',
    expiry: '',
    source: 'Master',
    recentThree: []
  };
}


/* =========================================================
   FLT SCH → SCHEDULE_QUEUE SYNC
========================================================= */

function syncScheduleQueueFromFltSchUncached_() {

  const lock =
    LockService.getScriptLock();


  if (
    !lock.tryLock(
      30000
    )
  ) {
    return;
  }


  try {

    const ss =
      openFlightSpreadsheet_(
        CONFIG.SPREADSHEET_ID
      );


    const sheet =
      ss.getSheetByName(
        CONFIG.QUEUE_SHEET
      );


    const calendar =
      CalendarApp.getCalendarById(
        CONFIG.FLT_SCH_CALENDAR_ID
      );


    if (
      !calendar
    ) {
      throw new Error(
        'FLT SCH calendar not found.'
      );
    }


    const now =
      new Date();


    const start =
      new Date(
        now.getTime() -
        CONFIG.SYNC_PAST_DAYS *
        24 *
        60 *
        60 *
        1000
      );


    const end =
      new Date(
        now.getTime() +
        CONFIG.SYNC_FUTURE_DAYS *
        24 *
        60 *
        60 *
        1000
      );


    const events =
      calendar.getEvents(
        start,
        end
      );


    const lastRow =
      sheet.getLastRow();


    const existingRows =
      lastRow >= 2

        ? sheet
            .getRange(
              2,
              1,
              lastRow - 1,
              14
            )
            .getDisplayValues()

        : [];


    const queueIndex = {};


    existingRows.forEach(
      (row, i) => {

        const key =
          makeFlightKey(
            normalizeDateString(
              row[
                QUEUE_COL.DATE - 1
              ]
            ),

            normalizeFlightNo(
              row[
                QUEUE_COL.FLIGHT - 1
              ]
            ),

            row[
              QUEUE_COL.DEP - 1
            ],

            row[
              QUEUE_COL.ARR - 1
            ]
          );


        if (
          key
        ) {

          queueIndex[key] = {
            sheetRow:
              i + 2,

            row:
              row
          };
        }
      }
    );


    const masterIndex =
      buildMasterIndex();


    let checked = 0;
    let created = 0;
    let updated = 0;
    let unchanged = 0;


    events.forEach(
      event => {

        const parsed =
          parseFlightCalendarTitle(
            event.getTitle()
          );


        if (
          !parsed
        ) {
          return;
        }


        checked++;


        const date =
          Utilities.formatDate(
            event.getStartTime(),
            CONFIG.TIMEZONE,
            'yyyy-MM-dd'
          );


        const latestOut =
          Utilities.formatDate(
            event.getStartTime(),
            CONFIG.TIMEZONE,
            'yyyy-MM-dd HH:mm'
          );


        const latestIn =
          Utilities.formatDate(
            event.getEndTime(),
            CONFIG.TIMEZONE,
            'yyyy-MM-dd HH:mm'
          );


        const key =
          makeFlightKey(
            date,
            parsed.flight,
            parsed.dep,
            parsed.arr
          );


        const existing =
          queueIndex[key];


        const master =
          masterIndex[key];


        if (
          existing
        ) {

          const sheetRow =
            existing.sheetRow;


          const current =
            existing.row;


          let changed =
            false;


          const existingQueueStatus =
            String(
              current[
                QUEUE_COL.STATUS - 1
              ] || ''
            )
              .trim()
              .toUpperCase();


          const protectQueueTimes =
            isQueueTimeProtectedStatus_(
              existingQueueStatus
            );


          /*
           * NEVER overwrite Queue Event ID
           * for an existing row.
           *
           * DATA PRIORITY GUARD:
           * After a flight becomes operationally closed/post-flight,
           * FLT SCH schedule refresh must not replace actual/official
           * Queue LATEST OUT/IN with a lower-priority schedule value.
           */

          if (
            !protectQueueTimes &&
            current[
              QUEUE_COL.LATEST_OUT - 1
            ] !== latestOut
          ) {

            sheet
              .getRange(
                sheetRow,
                QUEUE_COL.LATEST_OUT
              )
              .setValue(
                latestOut
              );

            changed =
              true;
          }


          if (
            !protectQueueTimes &&
            current[
              QUEUE_COL.LATEST_IN - 1
            ] !== latestIn
          ) {

            sheet
              .getRange(
                sheetRow,
                QUEUE_COL.LATEST_IN
              )
              .setValue(
                latestIn
              );

            changed =
              true;
          }

          /*
           * Fill Queue → Master link when possible.
           */

          if (
            master &&
            !current[
              QUEUE_COL.MASTER_LOG_ID - 1
            ]
          ) {

            sheet
              .getRange(
                sheetRow,
                QUEUE_COL.MASTER_LOG_ID
              )
              .setValue(
                master.logId
              );

            changed =
              true;
          }


          /*
           * If Master is officially confirmed,
           * Queue may safely reflect that status.
           */

          if (
            master &&
            String(
              master.recordStatus
            )
              .toUpperCase()
              .includes(
                'OFFICIAL'
              )
          ) {

            const queueStatus =
              String(
                current[
                  QUEUE_COL.STATUS - 1
                ] || ''
              ).toUpperCase();


            if (
              !queueStatus.includes(
                'CANCELLED'
              )
              &&
              !queueStatus.includes(
                'DEADHEAD'
              )
              &&
              !queueStatus.includes(
                'TRAVEL'
              )
              &&
              queueStatus !==
              'MASTER / OFFICIAL'
            ) {

              sheet
                .getRange(
                  sheetRow,
                  QUEUE_COL.STATUS
                )
                .setValue(
                  'MASTER / OFFICIAL'
                );

              changed =
                true;
            }
          }


          if (
            !current[
              QUEUE_COL.MEMO - 1
            ]
          ) {

            sheet
              .getRange(
                sheetRow,
                QUEUE_COL.MEMO
              )
              .setValue(
                'FLT SCH sync'
              );

            changed =
              true;
          }


          if (
            !current[
              QUEUE_COL.SOURCE - 1
            ]
          ) {

            sheet
              .getRange(
                sheetRow,
                QUEUE_COL.SOURCE
              )
              .setValue(
                'FLT SCH'
              );

            changed =
              true;
          }


          if (
            changed
          ) {
            updated++;
          } else {
            unchanged++;
          }


        } else {

          const newRow =
            new Array(14)
              .fill('');


          setArrayCol(
            newRow,
            QUEUE_COL.EVENT_ID,
            event.getId()
          );


          setArrayCol(
            newRow,
            QUEUE_COL.DATE,
            date
          );


          setArrayCol(
            newRow,
            QUEUE_COL.FLIGHT,
            parsed.flight
          );


          setArrayCol(
            newRow,
            QUEUE_COL.DEP,
            parsed.dep
          );


          setArrayCol(
            newRow,
            QUEUE_COL.ARR,
            parsed.arr
          );


          setArrayCol(
            newRow,
            QUEUE_COL.ROUTE,
            parsed.dep +
            '-' +
            parsed.arr
          );


          setArrayCol(
            newRow,
            QUEUE_COL.ORIGINAL_OUT,
            latestOut
          );


          setArrayCol(
            newRow,
            QUEUE_COL.ORIGINAL_IN,
            latestIn
          );


          setArrayCol(
            newRow,
            QUEUE_COL.LATEST_OUT,
            latestOut
          );


          setArrayCol(
            newRow,
            QUEUE_COL.LATEST_IN,
            latestIn
          );


          setArrayCol(
            newRow,
            QUEUE_COL.STATUS,
            'SCHEDULED'
          );


          setArrayCol(
            newRow,
            QUEUE_COL.MEMO,
            'FLT SCH sync'
          );


          if (
            master
          ) {

            setArrayCol(
              newRow,
              QUEUE_COL.MASTER_LOG_ID,
              master.logId
            );


            if (
              String(
                master.recordStatus
              )
                .toUpperCase()
                .includes(
                  'OFFICIAL'
                )
            ) {

              setArrayCol(
                newRow,
                QUEUE_COL.STATUS,
                'MASTER / OFFICIAL'
              );
            }
          }


          setArrayCol(
            newRow,
            QUEUE_COL.SOURCE,
            'FLT SCH'
          );


          sheet.appendRow(
            newRow
          );


          created++;
        }
      }
    );


    return {
      checked:
        checked,

      created:
        created,

      updated:
        updated,

      unchanged:
        unchanged
    };


  } finally {

    lock.releaseLock();
  }
}


/* =========================================================
   TRIGGER
========================================================= */

function installFltSchSyncTrigger() {

  const functionName =
    'syncScheduleQueueFromFltSch';


  ScriptApp
    .getProjectTriggers()
    .forEach(
      trigger => {

        if (
          trigger.getHandlerFunction() ===
          functionName
        ) {

          ScriptApp.deleteTrigger(
            trigger
          );
        }
      }
    );


  ScriptApp
    .newTrigger(
      functionName
    )
    .timeBased()
    .everyMinutes(
      5
    )
    .create();


  Logger.log(
    'FLT SCH → SCHEDULE_QUEUE automatic sync installed: every 5 minutes.'
  );
}


/* =========================================================
   CREW PARSER
========================================================= */

function parseCrewMemo(
  memo
) {

  memo =
    String(
      memo || ''
    );


  const picMatch =
    memo.match(
      /PIC\s+([^;]+)/i
    );


  const fdtMatch =
    memo.match(
      /FDT\s+([^;]+)/i
    );


  const pic =
    picMatch
      ? picMatch[1].trim()
      : '';


  const fdt =
    fdtMatch
      ? fdtMatch[1].trim()
      : '';


  const safetyPilot =
    /Safety\s*Pilot\s*Y/i
      .test(
        memo
      )
    ||
    (
      !!fdt &&
      /USER\s*=\s*FO/i
        .test(
          memo
        )
    );


  const fourCrew =
    /4[\s-]*crew/i
      .test(
        memo
      );


  let crewType =
    'CAP + FO (USER)';


  if (
    fourCrew
  ) {

    crewType =
      '4-CREW (USER FO)';

  } else if (
    fdt &&
    safetyPilot
  ) {

    crewType =
      'CAP + FO + FDT (USER / SAFETY)';
  }


  return {
    pic:
      pic,

    fdt:
      fdt,

    role:
      'FO',

    safetyPilot:
      safetyPilot,

    crewType:
      crewType
  };
}


/* =========================================================
   HELPERS
========================================================= */

function cleanFlightForClient(
  flight
) {

  const copy =
    Object.assign(
      {},
      flight
    );


  delete copy.outDate;
  delete copy.inDate;
  delete copy.queueRow;


  return copy;
}


function makeFlightKey(
  date,
  flight,
  dep,
  arr
) {

  date =
    normalizeDateString(
      date
    );


  flight =
    normalizeFlightNo(
      flight
    );


  dep =
    String(
      dep || ''
    ).trim().toUpperCase();


  arr =
    String(
      arr || ''
    ).trim().toUpperCase();


  if (
    !date ||
    !flight ||
    !dep ||
    !arr
  ) {
    return '';
  }


  return [
    date,
    flight,
    dep,
    arr
  ].join('|');
}


function makeLogId(
  date,
  flight,
  dep,
  arr
) {

  return [
    'KAL',
    date.replace(
      /-/g,
      ''
    ),
    normalizeFlightNo(
      flight
    ),
    String(
      dep
    ).toUpperCase(),
    String(
      arr
    ).toUpperCase()
  ].join('-');
}


function normalizeFlightNo(
  value
) {

  const text =
    String(
      value || ''
    )
      .trim()
      .toUpperCase()
      .replace(
        /\s+/g,
        ''
      );


  const match =
    text.match(
      /^KE0*(\d+)$/
    );


  if (
    match
  ) {

    return (
      'KE' +
      String(
        Number(
          match[1]
        )
      )
    );
  }


  return text;
}


function normalizeDateString(
  value
) {

  const text =
    String(
      value || ''
    ).trim();


  const match =
    text.match(
      /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/
    );


  if (
    !match
  ) {
    return '';
  }


  return (
    match[1] +
    '-' +
    String(
      match[2]
    ).padStart(
      2,
      '0'
    )
    +
    '-' +
    String(
      match[3]
    ).padStart(
      2,
      '0'
    )
  );
}


function normalizeYesNoBlank(
  value
) {

  const text =
    String(
      value == null
        ? ''
        : value
    )
      .trim()
      .toUpperCase();


  if (
    text === 'Y' ||
    text === 'YES'
  ) {
    return 'Y';
  }


  if (
    text === 'N' ||
    text === 'NO'
  ) {
    return 'N';
  }


  return '';
}


/* =========================================================
   DATA PRIORITY / QUEUE PROTECTION
========================================================= */

/**
 * Lower-priority FLT SCH schedule data may update Queue times only while
 * the row is still schedule-controlled.
 *
 * Protected statuses:
 * - FLOWN / PROVISIONAL
 * - MASTER / OFFICIAL
 * - DEADHEAD / TRAVEL
 * - CANCELLED
 */
function isQueueTimeProtectedStatus_(
  status
) {

  const text =
    String(
      status || ''
    )
      .trim()
      .toUpperCase();


  return (
    text.includes(
      'FLOWN'
    )
    ||
    text.includes(
      'PROVISIONAL'
    )
    ||
    text.includes(
      'MASTER / OFFICIAL'
    )
    ||
    text.includes(
      'OFFICIAL'
    )
    ||
    text.includes(
      'DEADHEAD'
    )
    ||
    text.includes(
      'TRAVEL'
    )
    ||
    text.includes(
      'CANCELLED'
    )
  );
}


function parseKstDateTime(
  value
) {

  const text =
    String(
      value || ''
    ).trim();


  const match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/
    );


  if (
    !match
  ) {
    return null;
  }


  return new Date(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+09:00`
  );
}


function timeFromDateTimeString(
  value
) {

  const text =
    String(
      value || ''
    );


  const match =
    text.match(
      /(\d{2}):(\d{2})/
    );


  return match
    ? (
        match[1] +
        ':' +
        match[2]
      )
    : '';
}


function calcBlockTime(
  outDate,
  inDate
) {

  if (
    !outDate ||
    !inDate
  ) {
    return '';
  }


  const minutes =
    Math.round(
      (
        inDate.getTime() -
        outDate.getTime()
      )
      /
      60000
    );


  if (
    minutes < 0
  ) {
    return '';
  }


  const hours =
    Math.floor(
      minutes / 60
    );


  const mins =
    minutes % 60;


  return (
    hours +
    ':' +
    String(
      mins
    ).padStart(
      2,
      '0'
    )
  );
}


function parseFlightCalendarTitle(
  title
) {

  const text =
    String(
      title || ''
    );


  const match =
    text.match(
      /Flight\s*:\s*KE\s*0*(\d+)\s+([A-Z]{3})\s*-\s*([A-Z]{3})/i
    );


  if (
    !match
  ) {
    return null;
  }


  return {
    flight:
      'KE' +
      String(
        Number(
          match[1]
        )
      ),

    dep:
      match[2]
        .toUpperCase(),

    arr:
      match[3]
        .toUpperCase()
  };
}


function determineDomesticIntl(
  dep,
  arr
) {

  const koreanAirports = [
    'ICN',
    'GMP',
    'PUS',
    'CJU',
    'TAE',
    'KWJ',
    'RSU',
    'USN',
    'KPO',
    'CJJ',
    'KUV',
    'YNY',
    'WJU'
  ];


  return (
    koreanAirports.includes(
      String(dep).toUpperCase()
    )
    &&
    koreanAirports.includes(
      String(arr).toUpperCase()
    )
  )
    ? 'DOMESTIC'
    : 'INTERNATIONAL';
}


function setArrayCol(
  row,
  col,
  value
) {

  row[
    col - 1
  ] = value;
}


function cleanText(
  value
) {

  return String(
    value == null
      ? ''
      : value
  ).trim();
}


/* =========================================================
   UTC DATE HELPERS FOR RECENCY
========================================================= */

function dateStringToUtc(
  value
) {

  const date =
    normalizeDateString(
      value
    );


  if (
    !date
  ) {
    return null;
  }


  const parts =
    date
      .split('-')
      .map(Number);


  return new Date(
    Date.UTC(
      parts[0],
      parts[1] - 1,
      parts[2]
    )
  );
}


function addUtcDays(
  date,
  days
) {

  return new Date(
    date.getTime() +
    days *
    24 *
    60 *
    60 *
    1000
  );
}


function utcDateToString(
  date
) {

  return (
    date.getUTCFullYear()
    +
    '-'
    +
    String(
      date.getUTCMonth() + 1
    ).padStart(
      2,
      '0'
    )
    +
    '-'
    +
    String(
      date.getUTCDate()
    ).padStart(
      2,
      '0'
    )
  );
}

/* =========================================================
   OFFICIAL RECONCILIATION
========================================================= */

/**
 * Official Flight Log 데이터가 들어왔을 때
 * 기존 provisional / user input과 대조하여 Master를 확정한다.
 *
 * official = {
 *   date: '2026-10-02',
 *   flight: 'KE1406',
 *   dep: 'PUS',
 *   arr: 'ICN',
 *
 *   registration: 'HLxxxx',
 *   dutyCode: 'F',
 *   position: 'FO',
 *   pic: 'NAME',
 *
 *   outGmt: '23:41',
 *   inGmt: '00:39',
 *   block: '0:58',
 *
 *   companyTime: '0:58',
 *   molitTime: '0:58',
 *   day: '0:58',
 *   night: '0:00',
 *   inst: '0:40',
 *   ifr: '0:40',
 *
 *   takeoff: 'Y',
 *   landing: 'Y',
 *   autoland: 'N',
 *
 *   sic: '0:58',
 *   safetyCredit: '0:00',
 *
 *   sourceId: 'SRC-KAL-FLIGHTLOG-YYYYMMDD'
 * }
 */
function reconcileOfficialFlightRecordUncached_(official) {

  if (!official) {
    throw new Error(
      'Official record is missing.'
    );
  }


  const date =
    normalizeDateString(
      official.date
    );

  const flight =
    normalizeFlightNo(
      official.flight
    );

  const dep =
    String(
      official.dep || ''
    )
      .trim()
      .toUpperCase();

  const arr =
    String(
      official.arr || ''
    )
      .trim()
      .toUpperCase();


  if (
    !date ||
    !flight ||
    !dep ||
    !arr
  ) {

    throw new Error(
      'Official record key is incomplete.'
    );
  }


  const lock =
    LockService.getScriptLock();


  lock.waitLock(
    30000
  );


  try {

    const ss =
      openFlightSpreadsheet_(
        CONFIG.SPREADSHEET_ID
      );


    const sheet =
      ss.getSheetByName(
        CONFIG.MASTER_SHEET
      );


    const masterIndex =
      buildMasterIndex();


    const key =
      makeFlightKey(
        date,
        flight,
        dep,
        arr
      );


    const existing =
      findExistingMasterByIdentity(
        masterIndex,
        {
          date: date,
          flight: flight,
          dep: dep,
          arr: arr,
          eventId:
            official.eventId || ''
        }
      ) ||
      masterIndex[key];


    if (!existing) {

      throw new Error(
        'Matching Master row not found: ' +
        key
      );
    }


    const row =
      existing.sheetRow;


    /*
     * Read current row BEFORE overwrite.
     * Used for discrepancy audit.
     */

    const current =
      sheet
        .getRange(
          row,
          1,
          1,
          70
        )
        .getDisplayValues()[0];


    const userTakeoff =
      normalizeYesNoBlank(
        current[
          MASTER_COL.TAKEOFF - 1
        ]
      );


    const userLanding =
      normalizeYesNoBlank(
        current[
          MASTER_COL.LANDING - 1
        ]
      );


    const officialTakeoff =
      normalizeYesNoBlank(
        official.takeoff
      );


    const officialLanding =
      normalizeYesNoBlank(
        official.landing
      );


    const discrepancies = [];


    /*
     * T/O comparison
     */

    if (
      userTakeoff &&
      officialTakeoff &&
      userTakeoff !== officialTakeoff
    ) {

      discrepancies.push(
        `T/O USER ${userTakeoff} → OFFICIAL ${officialTakeoff}`
      );
    }


    /*
     * L/D comparison
     */

    if (
      userLanding &&
      officialLanding &&
      userLanding !== officialLanding
    ) {

      discrepancies.push(
        `L/D USER ${userLanding} → OFFICIAL ${officialLanding}`
      );
    }


    /*
     * Official source wins.
     */

    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.REG,
      official.registration
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.DUTY,
      official.dutyCode
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.POSITION,
      official.position
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.PIC,
      official.pic
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.OUT_GMT,
      official.outGmt
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.IN_GMT,
      official.inGmt
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.BLOCK,
      official.block
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.COMPANY,
      official.companyTime
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.MOLIT,
      official.molitTime
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.DAY,
      official.day
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.NIGHT,
      official.night
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.INST,
      official.inst
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.IFR,
      official.ifr
    );


    /*
     * T/O / L/D
     * Official always wins.
     */

    if (
      officialTakeoff !== ''
    ) {

      sheet
        .getRange(
          row,
          MASTER_COL.TAKEOFF
        )
        .setValue(
          officialTakeoff
        );
    }


    if (
      officialLanding !== ''
    ) {

      sheet
        .getRange(
          row,
          MASTER_COL.LANDING
        )
        .setValue(
          officialLanding
        );
    }


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.AUTOLAND,
      normalizeYesNoBlank(
        official.autoland
      )
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.SIC,
      official.sic
    );


    setCellIfProvided(
      sheet,
      row,
      MASTER_COL.SAFETY_CREDIT,
      official.safetyCredit
    );


    /*
     * Verification / provenance
     */

    sheet
      .getRange(
        row,
        MASTER_COL.VERIFICATION
      )
      .setValue(
        'SOURCE IMPORTED'
      );


    if (
      official.sourceId
    ) {

      sheet
        .getRange(
          row,
          MASTER_COL.SOURCE_ID
        )
        .setValue(
          official.sourceId
        );
    }


    sheet
      .getRange(
        row,
        MASTER_COL.BT_SOURCE
      )
      .setValue(
        'Flight Log Report'
      );


    sheet
      .getRange(
        row,
        MASTER_COL.RECORD_STATUS
      )
      .setValue(
        'OFFICIAL CONFIRMED'
      );


    /*
     * Preserve user-entered:
     * - Approach
     * - PF/PM Override
     * - Comment
     *
     * Post-flight COMPLETE also preserved.
     */


    const oldRemarks =
      String(
        current[
          MASTER_COL.REMARKS - 1
        ] || ''
      ).trim();


    let reconciliationNote =
      'Official Flight Log reconciled; user-entered post-flight fields preserved.';


    if (
      discrepancies.length
    ) {

      reconciliationNote +=
        ' DISCREPANCY: ' +
        discrepancies.join('; ');
    }


    const newRemarks =
      oldRemarks

        ? oldRemarks +
          ' | ' +
          reconciliationNote

        : reconciliationNote;


    sheet
      .getRange(
        row,
        MASTER_COL.REMARKS
      )
      .setValue(
        newRemarks
      );


    const oldSyncNote =
      String(
        current[
          MASTER_COL.SYNC_NOTE - 1
        ] || ''
      ).trim();


    const syncNote =
      discrepancies.length

        ? (
            'OFFICIAL reconciliation completed. ' +
            discrepancies.join('; ')
          )

        : 'OFFICIAL reconciliation completed; provisional T/O/L/D matched or no prior user value.';


    sheet
      .getRange(
        row,
        MASTER_COL.SYNC_NOTE
      )
      .setValue(
        oldSyncNote

          ? oldSyncNote +
            ' | ' +
            syncNote

          : syncNote
      );


    /*
     * Queue state update
     */

    markQueueOfficial(
      date,
      flight,
      dep,
      arr,
      existing.logId
    );


    return {

      logId:
        existing.logId,

      status:
        'OFFICIAL CONFIRMED',

      discrepancies:
        discrepancies,

      takeoff:
        officialTakeoff,

      landing:
        officialLanding
    };


  } finally {

    lock.releaseLock();
  }
}


/* =========================================================
   OFFICIAL RECONCILIATION HELPERS
========================================================= */

function setCellIfProvided(
  sheet,
  row,
  col,
  value
) {

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return;
  }


  sheet
    .getRange(
      row,
      col
    )
    .setValue(
      value
    );
}


function markQueueOfficial(
  date,
  flight,
  dep,
  arr,
  logId
) {

  const ss =
    openFlightSpreadsheet_(
      CONFIG.SPREADSHEET_ID
    );


  const sheet =
    ss.getSheetByName(
      CONFIG.QUEUE_SHEET
    );


  const lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {
    return;
  }


  const rows =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        14
      )
      .getDisplayValues();


  const targetKey =
    makeFlightKey(
      date,
      flight,
      dep,
      arr
    );


  for (
    let i = 0;
    i < rows.length;
    i++
  ) {

    const row =
      rows[i];


    const key =
      makeFlightKey(
        row[
          QUEUE_COL.DATE - 1
        ],

        row[
          QUEUE_COL.FLIGHT - 1
        ],

        row[
          QUEUE_COL.DEP - 1
        ],

        row[
          QUEUE_COL.ARR - 1
        ]
      );


    if (
      key !== targetKey
    ) {
      continue;
    }


    const sheetRow =
      i + 2;


    sheet
      .getRange(
        sheetRow,
        QUEUE_COL.STATUS
      )
      .setValue(
        'MASTER / OFFICIAL'
      );


    sheet
      .getRange(
        sheetRow,
        QUEUE_COL.MASTER_LOG_ID
      )
      .setValue(
        logId
      );


    return;
  }
}


/* =========================================================
   DRY RUN — OFFICIAL COMPARISON ONLY
========================================================= */

function previewOfficialReconciliation(
  official
) {

  const masterIndex =
    buildMasterIndex();


  const key =
    makeFlightKey(
      official.date,
      official.flight,
      official.dep,
      official.arr
    );


  const existing =
    masterIndex[key];


  if (
    !existing
  ) {

    return {
      found: false,
      key: key
    };
  }


  const ss =
    openFlightSpreadsheet_(
      CONFIG.SPREADSHEET_ID
    );


  const sheet =
    ss.getSheetByName(
      CONFIG.MASTER_SHEET
    );


  const row =
    sheet
      .getRange(
        existing.sheetRow,
        1,
        1,
        70
      )
      .getDisplayValues()[0];


  const currentTakeoff =
    normalizeYesNoBlank(
      row[
        MASTER_COL.TAKEOFF - 1
      ]
    );


  const currentLanding =
    normalizeYesNoBlank(
      row[
        MASTER_COL.LANDING - 1
      ]
    );


  const officialTakeoff =
    normalizeYesNoBlank(
      official.takeoff
    );


  const officialLanding =
    normalizeYesNoBlank(
      official.landing
    );


  return {

    found: true,

    logId:
      existing.logId,

    current: {
      takeoff:
        currentTakeoff,

      landing:
        currentLanding
    },

    official: {
      takeoff:
        officialTakeoff,

      landing:
        officialLanding
    },

    discrepancy: {
      takeoff:
        !!(
          currentTakeoff &&
          officialTakeoff &&
          currentTakeoff !==
          officialTakeoff
        ),

      landing:
        !!(
          currentLanding &&
          officialLanding &&
          currentLanding !==
          officialLanding
        )
    }
  };
}

function doPost(e) {
  try {
    const body = JSON.parse(
      e.postData.contents || '{}'
    );

    const apiKey = body.apiKey || '';

    const expectedKey =
      PropertiesService
        .getScriptProperties()
        .getProperty('FLIGHT_LOG_API_KEY');

    if (!expectedKey || apiKey !== expectedKey) {
      return jsonResponse_({
        ok: false,
        error: 'Unauthorized'
      });
    }

    const action = body.action;
    const payload = body.payload || {};


    // =====================================================
    // TODAY
    // =====================================================

    if (action === 'getAppData') {
      return jsonResponse_({
        ok: true,
        data: cachedFlightRead_('getAppData', payload, getAppData)
      });
    }


    if (action === 'savePostFlight') {
      return jsonResponse_({
        ok: true,
        data: savePostFlight(payload)
      });
    }


    // =====================================================
    // HISTORY
    // =====================================================

    if (action === 'getHistoryMonth') {
      const year = Number(payload.year);
      const month = Number(payload.month);

      if (
        !year ||
        !month ||
        month < 1 ||
        month > 12
      ) {
        throw new Error(
          'Invalid history year/month.'
        );
      }

      return jsonResponse_({
        ok: true,
        data: cachedFlightRead_('getHistoryMonth', payload, function() { return getHistoryMonth(year, month); })
      });
    }


    // =====================================================
    // RECENCY
    // =====================================================

    if (action === 'getRecencyData') {
      return jsonResponse_({
        ok: true,
        data: cachedFlightRead_('getRecencyData', payload, getRecencyData)
      });
    }

    if (action === 'getCaptainCard') {
      return jsonResponse_({ ok: true, data: cachedFlightRead_('getCaptainCard', payload, function() { return getCaptainCard(payload); }) });
    }

    if (action === 'getCaptains') {
      return jsonResponse_({ ok: true, data: cachedFlightRead_('getCaptains', payload, getCaptains) });
    }

   if (action === 'getCaptainProfile') {
      return jsonResponse_({
        ok: true,
        data: cachedFlightRead_('getCaptainProfile', payload, function() { return getCaptainProfile(payload); })
      });
    }

  if (action === 'saveCaptainProfile') {
    return jsonResponse_({
      ok: true,
      data: saveCaptainProfile(payload)
      });
    }

    if (action === 'previewOfficialImport') {
      return jsonResponse_({
        ok: true,
        data: previewOfficialImport(payload)
      });
    }

    if (action === 'confirmOfficialImport') {
      return jsonResponse_({
        ok: true,
        data: confirmOfficialImport(payload)
      });
    }


    throw new Error(
      'Unknown action: ' + action
    );

  } catch (err) {

    return jsonResponse_({
      ok: false,

      error:
        err && err.message
          ? err.message
          : String(err)
    });
  }
}


function jsonResponse_(obj) {
  obj.backendVersion = BACKEND_VERSION;
  if (obj.ok && obj.data && typeof obj.data === 'object') obj.data.backendVersion = BACKEND_VERSION;
  return ContentService
    .createTextOutput(
      JSON.stringify(obj)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}

const FLIGHT_LOG_SS_ID =
  '1tD003yx6BtwFIquQygztZvd4vppcBrT6RSPkMLOYkhs';


/* =========================================================
   CAPTAIN PROFILE
========================================================= */

function getCaptainProfile(payload) {

  const captain =
    String(
      payload &&
      payload.captain
        ? payload.captain
        : ''
    ).trim();


  if (!captain) {
    throw new Error(
      'Captain name is required.'
    );
  }


  const ss =
    openFlightSpreadsheet_(
      FLIGHT_LOG_SS_ID
    );


  const captainSheet =
    ss.getSheetByName(
      'CAPTAIN_NOTES'
    );


  const masterSheet =
    ss.getSheetByName(
      'FLIGHT_LOG_MASTER'
    );


  if (
    !captainSheet ||
    !masterSheet
  ) {
    throw new Error(
      'Required sheet not found.'
    );
  }


  /* =====================================================
     CAPTAIN MASTER NOTE
     Header row = 3
     A Captain
     B Last flown
     C LEG
     D Last flight
     E Last route
     F Captain Comment
     G Tags
  ===================================================== */

  const captainLastRow =
    captainSheet.getLastRow();


  const captainValues =
    captainLastRow >= 4
      ? captainSheet
          .getRange(
            4,
            1,
            captainLastRow - 3,
            7
          )
          .getDisplayValues()
      : [];


  let captainRow = null;
  let captainRowNumber = null;


  for (
    let i = 0;
    i < captainValues.length;
    i++
  ) {

    const row =
      captainValues[i];


    if (
      normalizeCaptainName_(
        row[0]
      ) ===
      normalizeCaptainName_(
        captain
      )
    ) {

      captainRow = row;
      captainRowNumber =
        i + 4;

      break;
    }
  }


  /* =====================================================
     FLIGHT HISTORY
     FLIGHT_LOG_MASTER
     
     A Log ID
     B Date
     E Flight
     F DEP
     G ARR
     H Route
     J Flight Comment
     N PIC
     AM Verification
     BL Record Status
  ===================================================== */

  const masterLastRow =
    masterSheet.getLastRow();


  const flights = [];


  if (
    masterLastRow >= 2
  ) {

    const values =
      readMasterRows_(masterSheet, masterLastRow, 64, { captain: captain });


    for (
      let i = 0;
      i < values.length;
      i++
    ) {

      const row =
        values[i];


      const pic =
        row[13]; // N


      if (
        normalizeCaptainName_(
          pic
        ) !==
        normalizeCaptainName_(
          captain
        )
      ) {
        continue;
      }


      flights.push({
        logId:
          row[0] || '',

        date:
          row[1] || '',

        flight:
          row[4] || '',

        dep:
          row[5] || '',

        arr:
          row[6] || '',

        route:
          row[7] ||
          (
            row[5] &&
            row[6]
              ? row[5] +
                '-' +
                row[6]
              : ''
          ),

        flightComment:
          row[9] || '',

        verification:
          row[38] || '',

        recordStatus:
          row[63] || '',
      });
    }
  }


  flights.sort(
    function(a, b) {

      return String(
        b.date
      ).localeCompare(
        String(
          a.date
        )
      );
    }
  );


  /* =====================================================
     COMPUTED CURRENT STATS
  ===================================================== */

  const lastFlight =
    flights.length
      ? flights[0]
      : null;


  const computed = {

    sectors:
      flights.length,

    lastFlown:
      lastFlight
        ? lastFlight.date
        : '',

    lastFlight:
      lastFlight
        ? lastFlight.flight
        : '',

    lastRoute:
      lastFlight
        ? lastFlight.route
        : '',
  };


  /* =====================================================
     EXISTING MASTER NOTE
  ===================================================== */

  const profile = {

    captain:
      captain,

    note:
      captainRow
        ? captainRow[5] || ''
        : '',

    tags:
      captainRow
        ? parseCaptainTags_(
            captainRow[6]
          )
        : [],

    captainRowNumber:
      captainRowNumber,

    computed:
      computed,

    stored: {

      lastFlown:
        captainRow
          ? captainRow[1] || ''
          : '',

      sectors:
        captainRow
          ? captainRow[2] || ''
          : '',

      lastFlight:
        captainRow
          ? captainRow[3] || ''
          : '',

      lastRoute:
        captainRow
          ? captainRow[4] || ''
          : '',
    },

    flights:
      flights.slice(
        0,
        20
      ),
  };


  return profile;
}


/* =========================================================
   SAVE CAPTAIN PROFILE

   Only user-owned fields:
   F Captain Comment
   G Tags

   A-E are preserved / refreshed separately.
========================================================= */

function saveCaptainProfileUncached_(payload) {

  const captain =
    String(
      payload &&
      payload.captain
        ? payload.captain
        : ''
    ).trim();


  if (!captain) {
    throw new Error(
      'Captain name is required.'
    );
  }


  const note =
    String(
      payload.note || ''
    ).trim();


  const tags =
    Array.isArray(
      payload.tags
    )
      ? payload.tags
          .map(function(tag) {
            return String(
              tag
            ).trim();
          })
          .filter(Boolean)
      : [];


  const ss =
    openFlightSpreadsheet_(
      FLIGHT_LOG_SS_ID
    );


  const sheet =
    ss.getSheetByName(
      'CAPTAIN_NOTES'
    );


  if (!sheet) {
    throw new Error(
      'CAPTAIN_NOTES not found.'
    );
  }


  const lastRow =
    sheet.getLastRow();


  const values =
    lastRow >= 4
      ? sheet
          .getRange(
            4,
            1,
            lastRow - 3,
            7
          )
          .getDisplayValues()
      : [];


  let targetRow = null;


  for (
    let i = 0;
    i < values.length;
    i++
  ) {

    if (
      normalizeCaptainName_(
        values[i][0]
      ) ===
      normalizeCaptainName_(
        captain
      )
    ) {

      targetRow =
        i + 4;

      break;
    }
  }


  /* -----------------------------------------------------
     New captain
  ----------------------------------------------------- */

  if (!targetRow) {

    const profile =
      getCaptainProfile({
        captain:
          captain
      });


    targetRow =
      Math.max(
        sheet.getLastRow() + 1,
        4
      );


    sheet
      .getRange(
        targetRow,
        1,
        1,
        7
      )
      .setValues([
        [
          captain,

          profile.computed
            .lastFlown ||
          '',

          profile.computed
            .sectors ||
          '',

          profile.computed
            .lastFlight ||
          '',

          profile.computed
            .lastRoute ||
          '',

          note,

          tags.join(', '),
        ]
      ]);

  } else {

    /*
     * Existing captain:
     * update ONLY user-owned note/tags.
     * A-E stay untouched here.
     */

    sheet
      .getRange(
        targetRow,
        6
      )
      .setValue(
        note
      );


    sheet
      .getRange(
        targetRow,
        7
      )
      .setValue(
        tags.join(', ')
      );
  }


  return {
    success: true,
    captain:
      captain,
    row:
      targetRow,
    note:
      note,
    tags:
      tags,
  };
}


/* =========================================================
   HELPERS
========================================================= */

function normalizeCaptainName_(
  value
) {

  return String(
    value || ''
  )
    .trim()
    .replace(
      /\s+/g,
      ' '
    )
    .toUpperCase();
}


function parseCaptainTags_(
  value
) {

  if (!value) {
    return [];
  }


  return String(
    value
  )
    .split(',')
    .map(function(tag) {
      return tag.trim();
    })
    .filter(Boolean);
}

/* =========================================================
   v0.2.5 DATA PRIORITY / IDENTITY SELF TEST — NO WRITE
========================================================= */

function testMasterIdentityV025() {

  const mock = {
    '2026-10-06|KE164|DYG|ICN': {
      sheetRow: 100,
      date: '2026-10-06',
      flight: 'KE164',
      dep: 'DYG',
      arr: 'ICN',
      eventId: 'evt-ke164',
      recordStatus:
        'OFFICIAL CONFIRMED'
    }
  };


  const byId =
    findExistingMasterByIdentity(
      mock,
      {
        date: '2026-10-07',
        flight: 'KE164',
        dep: 'DYG',
        arr: 'ICN',
        eventId: 'evt-ke164'
      }
    );


  if (
    !byId ||
    byId.sheetRow !== 100
  ) {
    throw new Error(
      'MASTER IDENTITY TEST FAIL — Event ID'
    );
  }


  const byAdjacentDate =
    findExistingMasterByIdentity(
      mock,
      {
        date: '2026-10-07',
        flight: 'KE164',
        dep: 'DYG',
        arr: 'ICN'
      }
    );


  if (
    !byAdjacentDate ||
    byAdjacentDate.sheetRow !== 100
  ) {
    throw new Error(
      'MASTER IDENTITY TEST FAIL — adjacent date'
    );
  }


  Logger.log(
    'MASTER IDENTITY TEST PASS'
  );
}
function getCaptains() {
  const ss = openFlightSpreadsheet_(FLIGHT_LOG_SS_ID);
  const captainSheet = ss.getSheetByName('CAPTAIN_NOTES');
  const masterSheet = ss.getSheetByName('FLIGHT_LOG_MASTER');
  if (!captainSheet || !masterSheet) throw new Error('Required sheet not found.');

  const notesLastRow = captainSheet.getLastRow();
  const notes = notesLastRow >= 4
    ? captainSheet.getRange(4, 1, notesLastRow - 3, 7).getDisplayValues()
    : [];
  const byName = new Map();
  notes.forEach(function(row) {
    const captain = String(row[0] || '').trim();
    const key = normalizeCaptainName_(captain);
    // Match getCaptainProfile: the first normalized name owns note/tags.
    if (!key || byName.has(key)) return;
    byName.set(key, {
      captain: captain,
      note: row[5] || '',
      tags: parseCaptainTags_(row[6]),
      computed: { sectors: 0, lastFlown: '', lastFlight: '', lastRoute: '' }
    });
  });

  const masterLastRow = masterSheet.getLastRow();
  const flights = masterLastRow >= 2
    ? masterSheet.getRange(2, 1, masterLastRow - 1, 14).getDisplayValues()
    : [];
  flights.forEach(function(row) {
    const captain = byName.get(normalizeCaptainName_(row[13]));
    if (!captain) return;
    const stats = captain.computed;
    const date = row[1] || '';
    // Same flight inclusion and date ordering as getCaptainProfile.
    if (stats.sectors === 0 || String(date).localeCompare(String(stats.lastFlown)) > 0) {
      stats.lastFlown = date;
      stats.lastFlight = row[4] || '';
      stats.lastRoute = row[7] || (row[5] && row[6] ? row[5] + '-' + row[6] : '');
    }
    stats.sectors++;
  });

  return {
    captains: Array.from(byName.values()).sort(function(a, b) {
      return String(b.computed.lastFlown).localeCompare(String(a.computed.lastFlown)) ||
        a.captain.localeCompare(b.captain);
    })
  };
}


/* v0.2.6: caches never supply write/identity decisions. */
const BACKEND_VERSION = '0.3.1-import-v1';
const flightExecution_ = { spreadsheets: {}, masterIndex: null };

function openFlightSpreadsheet_(id) {
  if (!flightExecution_.spreadsheets[id]) {
    flightExecution_.spreadsheets[id] = SpreadsheetApp.openById(id);
  }
  return flightExecution_.spreadsheets[id];
}

function buildMasterIndex() {
  if (!flightExecution_.masterIndex) flightExecution_.masterIndex = buildMasterIndexUncached_();
  return flightExecution_.masterIndex;
}

function flightCacheGeneration_() {
  return PropertiesService.getScriptProperties().getProperty('FLT_CACHE_GENERATION') || 'initial';
}

function cachedFlightRead_(action, payload, read) {
  // Authentication is already checked in doPost before entering here.
  // Manual/external sheet edits become visible within this short TTL.
  const ttl = action === 'getCaptains' ? 120 : 30;
  let cache, generation, key;
  try {
    cache = CacheService.getScriptCache();
    generation = flightCacheGeneration_();
    const identity = action === 'getHistoryMonth' ? [Number(payload.year), Number(payload.month)]
      : (action === 'getCaptainProfile' || action === 'getCaptainCard') ? [normalizeCaptainName_(payload.captain)] : [];
    const digest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, JSON.stringify(identity), Utilities.Charset.UTF_8));
    key = 'flt:' + BACKEND_VERSION + ':' + generation + ':' + action + ':' + digest;
    if (!payload.__fresh) {
      const hit = cache.get(key);
      if (hit) return JSON.parse(hit);
    }
  } catch (ignored) { cache = null; }
  const result = read();
  try {
    const serialized = JSON.stringify(result);
    // Conservative UTF-8 size bound below CacheService's per-entry limit.
    // A concurrent write changes generation; old reads cannot seed the new cache.
    if (cache && serialized.length * 3 < 90000 && generation === flightCacheGeneration_()) {
      cache.put(key, serialized, ttl);
    }
  } catch (ignored) { /* Cache failure must not fail a sheet read. */ }
  return result;
}

function invalidateFlightCache_() {
  flightExecution_.masterIndex = null;
  PropertiesService.getScriptProperties().setProperty('FLT_CACHE_GENERATION', Utilities.getUuid());
}

function withFlightMutation_(write) {
  // Invalidate on entry AND exit, including partially failed writes.
  invalidateFlightCache_();
  try { return write(); }
  finally {
    try { SpreadsheetApp.flush(); }
    finally { invalidateFlightCache_(); }
  }
}

function savePostFlight(payload) {
  return withFlightMutation_(function() { return savePostFlightUncached_(payload); });
}

function syncScheduleQueueFromFltSch() {
  return withFlightMutation_(function() { return syncScheduleQueueFromFltSchUncached_(); });
}

function reconcileOfficialFlightRecord(official) {
  return withFlightMutation_(function() { return reconcileOfficialFlightRecordUncached_(official); });
}

function saveCaptainProfile(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const result = withFlightMutation_(function() { return saveCaptainProfileUncached_(payload); });
    // Return the current profile in the save response: no second HTTP round trip.
    result.profile = getCaptainProfile(payload);
    return result;
  } finally { lock.releaseLock(); }
}


/* v0.2.7: narrow selectors, then bounded contiguous reads.
 * No persistent row-number cache: external inserts/reordering cannot leave a stale index.
 * Unselected positions remain empty arrays so original physical row numbers are preserved.
 * Write paths pass no selector and continue to read the complete, current Master.
 */
function getCaptainCard(payload) {
  const captain = String(payload.captain || '').trim();
  if (!captain) throw new Error('Captain name is required.');
  const sheet = openFlightSpreadsheet_(FLIGHT_LOG_SS_ID).getSheetByName('CAPTAIN_NOTES');
  if (!sheet) throw new Error('CAPTAIN_NOTES not found.');
  const last = sheet.getLastRow();
  const values = last >= 4 ? sheet.getRange(4, 1, last - 3, 7).getDisplayValues() : [];
  const key = normalizeCaptainName_(captain);
  const row = values.find(function(item) { return normalizeCaptainName_(item[0]) === key; });
  return { captain: captain, note: row ? row[5] || '' : '', tags: row ? parseCaptainTags_(row[6]) : [] };
}

function readMasterRows_(sheet, lastRow, width, selection) {
  const count = lastRow - 1;
  if (count <= 0) return [];
  const fullRead = function() {
    // Widely scattered captain histories should not trigger many tiny reads.
    // Profile uses only A:N, AM and BL: retain column positions, read 16 instead of 64.
    if (selection && selection.captain && count > 128) {
      const base = sheet.getRange(2, 1, count, 14).getDisplayValues();
      const verification = sheet.getRange(2, MASTER_COL.VERIFICATION, count, 1).getDisplayValues();
      const status = sheet.getRange(2, MASTER_COL.RECORD_STATUS, count, 1).getDisplayValues();
      return base.map(function(row, i) {
        const projected = Array(width).fill('');
        row.forEach(function(value, col) { projected[col] = value; });
        projected[MASTER_COL.VERIFICATION - 1] = verification[i][0];
        projected[MASTER_COL.RECORD_STATUS - 1] = status[i][0];
        return projected;
      });
    }
    return sheet.getRange(2, 1, count, width).getDisplayValues();
  };
  // For small sheets an extra selector round trip would cost more than it saves.
  if (!selection || count <= 128) return fullRead();

  let selected;
  if (selection.captain) {
    const key = normalizeCaptainName_(selection.captain);
    selected = sheet.getRange(2, MASTER_COL.PIC, count, 1).getDisplayValues()
      .map(function(row) { return normalizeCaptainName_(row[0]) === key; });
  } else {
    const dates = sheet.getRange(2, MASTER_COL.DATE, count, 1).getDisplayValues()
      .map(function(row) { return normalizeDateString(row[0]); });
    if (selection.month) {
      selected = dates.map(function(date) { return date.startsWith(selection.month + '-'); });
    } else if (selection.recency) {
      const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
      const start = utcDateToString(addUtcDays(dateStringToUtc(today), -(CONFIG.RECENCY_DAYS - 1)));
      selected = dates.map(function(date) { return date >= start && date <= today; });
    } else if (selection.queueRows) {
      const wantedDates = new Set();
      const wantedEvents = new Set();
      const wantedLogIds = new Set();
      selection.queueRows.forEach(function(row) {
        const date = normalizeDateString(row[QUEUE_COL.DATE - 1]);
        if (date) {
          const utc = dateStringToUtc(date);
          [-1, 0, 1].forEach(function(offset) { wantedDates.add(utcDateToString(addUtcDays(utc, offset))); });
        }
        const logId = String(row[QUEUE_COL.MASTER_LOG_ID - 1] || '').trim();
        if (logId) wantedLogIds.add(logId);
        const event = String(row[QUEUE_COL.EVENT_ID - 1] || '').trim();
        if (event) wantedEvents.add(event);
      });
      if (wantedEvents.size) {
        const events = sheet.getRange(2, MASTER_COL.EVENT_ID, count, 1).getDisplayValues();
        events.forEach(function(row, i) {
          // Include ALL rows on an Event-ID match's date, preserving duplicate-key
          // overwrite order and ambiguous adjacent-day matching exactly as before.
          if (wantedEvents.has(String(row[0] || '').trim()) && dates[i]) wantedDates.add(dates[i]);
        });
      }
      // Select referenced IDs regardless of the Calendar/Official date gap.
      const logIds = wantedLogIds.size
        ? sheet.getRange(2, MASTER_COL.LOG_ID, count, 1).getDisplayValues()
        : [];
      selected = dates.map(function(date, i) {
        return wantedDates.has(date) || (logIds[i] && wantedLogIds.has(String(logIds[i][0] || '').trim()));
      });
    } else { return fullRead(); }
  }

  const spans = [];
  let matches = 0;
  selected.forEach(function(yes, i) {
    if (!yes) return;
    matches++;
    const previous = spans[spans.length - 1];
    // Read a few intervening rows rather than issuing many tiny Sheets calls.
    if (previous && i - previous.end <= 9) previous.end = i;
    else spans.push({ start: i, end: i });
  });
  const rows = Array.from({ length: count }, function() { return []; });
  if (!matches) {
    const latest = sheet.getLastRow();
    return latest !== lastRow
      ? (latest >= 2 ? sheet.getRange(2, 1, latest - 1, width).getDisplayValues() : [])
      : rows;
  }
  if (spans.length > 8) {
    const bound = { start: spans[0].start, end: spans[spans.length - 1].end };
    spans.splice(0, spans.length, bound);
  }
  const hydrated = spans.reduce(function(total, span) { return total + span.end - span.start + 1; }, 0);
  if (hydrated >= count * 0.6) return fullRead();
  spans.forEach(function(span) {
    const values = sheet.getRange(span.start + 2, 1, span.end - span.start + 1, width).getDisplayValues();
    values.forEach(function(row, i) { rows[span.start + i] = row; });
  });
  // Row-count changes during selection require a new snapshot. Never use this data for writes.
  const currentLastRow = sheet.getLastRow();
  if (currentLastRow !== lastRow) {
    return currentLastRow >= 2 ? sheet.getRange(2, 1, currentLastRow - 1, width).getDisplayValues() : [];
  }
  return rows;
}


/* =========================================================
   OFFICIAL PDF IMPORT v1
   ---------------------------------------------------------
   Safety model:
   - Preview is read-only.
   - Confirm re-runs preview under ScriptLock.
   - Existing OFFICIAL rows with changed official-source values
     are MISMATCH and are NOT auto-overwritten.
   - User-owned post-flight fields are never touched here.
   - Source PDF is staged first, then retained in Drive.
   - No source PDF is deleted; redundant reports move to archive.
========================================================= */

function previewOfficialImport(payload) {
  return buildOfficialImportPreview_(payload);
}


function requireOfficialImportConfirmEnabled_() {
  if (PropertiesService.getScriptProperties().getProperty('OFFICIAL_IMPORT_CONFIRM_ENABLED') !== 'true') {
    throw new Error('Official Import Confirm is disabled in Apps Script. Analyze remains read-only.');
  }
}

function confirmOfficialImport(payload) {
  // Check before lock acquisition, cache invalidation, or any Drive/Sheet write.
  requireOfficialImportConfirmEnabled_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    return withFlightMutation_(function() {
      return confirmOfficialImportUncached_(payload);
    });
  } finally {
    lock.releaseLock();
  }
}


function validateOfficialImportPayload_(payload, requirePdf) {
  if (!payload || !payload.source || !Array.isArray(payload.records)) {
    throw new Error('Official import payload is incomplete.');
  }

  const source = payload.source;
  const sha256 = String(source.sha256 || '').trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('Official PDF SHA-256 is missing or invalid.');
  }

  if (!payload.records.length || payload.records.length > 1000) {
    throw new Error('Official import record count is invalid.');
  }

  const coverageFrom = normalizeDateString(source.coverageFrom);
  const coverageTo = normalizeDateString(source.coverageTo);

  if (!coverageFrom || !coverageTo || coverageFrom > coverageTo) {
    throw new Error('Official PDF coverage is invalid.');
  }

  if (requirePdf) {
    const pdfBase64 = String(payload.pdfBase64 || '');
    if (!pdfBase64) throw new Error('Original PDF bytes are missing.');
    if (pdfBase64.length > 8 * 1024 * 1024) {
      throw new Error('Original PDF payload is too large.');
    }
  }

  const sourceKeys = {};
  const sourceDates = [];

  payload.records.forEach(function(record, index) {
    const date = normalizeDateString(record && record.date);
    const flight = normalizeFlightNo(record && record.flight);
    const dep = String(record && record.dep || '').trim().toUpperCase();
    const arr = String(record && record.arr || '').trim().toUpperCase();
    const outGmt = normalizeClock_(record && record.outGmt);
    const inGmt = normalizeClock_(record && record.inGmt);

    if (!date || !flight || !dep || !arr) {
      throw new Error('Official record key is incomplete at index ' + index + '.');
    }

    const sourceKey = [date, flight, dep, arr, outGmt, inGmt].join('|');
    if (sourceKeys[sourceKey]) {
      throw new Error('Duplicate official source row: ' + sourceKey);
    }
    sourceKeys[sourceKey] = true;
    sourceDates.push(date);
  });

  sourceDates.sort();

  if (
    sourceDates[0] !== coverageFrom ||
    sourceDates[sourceDates.length - 1] !== coverageTo
  ) {
    throw new Error('Official PDF coverage does not match parsed source rows.');
  }

  if (
    Number(source.sectorCount || payload.records.length) !==
    payload.records.length
  ) {
    throw new Error('Official PDF sector count does not match parsed source rows.');
  }

  const fileName = String(source.fileName || 'Flight Log Report.pdf').trim();
  if (!/\.pdf$/i.test(fileName)) {
    throw new Error('Official source must retain its PDF filename.');
  }

  return {
    fileName: fileName,
    mimeType: 'application/pdf',
    fileSize: Number(source.fileSize || 0),
    sha256: sha256,
    totalPages: Number(source.totalPages || 0),
    coverageFrom: coverageFrom,
    coverageTo: coverageTo,
    sectorCount: Number(source.sectorCount || payload.records.length)
  };
}


function officialImportSourceId_(source) {
  return 'SRC-KAL-FLIGHTLOG-' +
    String(source.coverageTo || '').replace(/-/g, '') +
    '-' +
    String(source.sha256 || '').slice(0, 8).toUpperCase();
}


function normalizeClock_(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return String(value || '').trim();
  return String(Number(match[1])).padStart(2, '0') + ':' + match[2];
}


function normalizeDuration_(value) {
  const match = String(value || '').trim().match(/^(\d+):(\d{2})$/);
  if (!match) return String(value || '').trim();
  return String(Number(match[1])) + ':' + match[2];
}


function durationMinutes_(value) {
  const match = String(value || '').trim().match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}


function durationFraction_(value) {
  const minutes = durationMinutes_(value);
  return minutes === null ? '' : minutes / (24 * 60);
}


function officialFieldSummary_(record) {
  return [
    record.registration || '',
    record.dutyCode || '',
    normalizeClock_(record.outGmt),
    normalizeClock_(record.inGmt),
    'BT ' + normalizeDuration_(record.block),
    'Company ' + normalizeDuration_(record.companyTime),
    'MOLIT ' + normalizeDuration_(record.molitTime),
    'Night ' + normalizeDuration_(record.night),
    'INST ' + normalizeDuration_(record.inst),
    'T/O ' + normalizeYesNoBlank(record.takeoff),
    'L/D ' + normalizeYesNoBlank(record.landing),
    record.autoland ? 'A/L ' + normalizeYesNoBlank(record.autoland) : ''
  ].filter(Boolean).join(' | ');
}


function compareOfficialMasterRow_(masterRow, official) {
  const checks = [
    ['Registration', masterRow[MASTER_COL.REG - 1], official.registration, function(v) { return String(v || '').trim().toUpperCase(); }],
    ['Duty', masterRow[MASTER_COL.DUTY - 1], official.dutyCode, function(v) { return String(v || '').trim().toUpperCase(); }],
    ['OUT', masterRow[MASTER_COL.OUT_GMT - 1], official.outGmt, normalizeClock_],
    ['IN', masterRow[MASTER_COL.IN_GMT - 1], official.inGmt, normalizeClock_],
    ['Block', masterRow[MASTER_COL.BLOCK - 1], official.block, normalizeDuration_],
    ['Company', masterRow[MASTER_COL.COMPANY - 1], official.companyTime, normalizeDuration_],
    ['MOLIT', masterRow[MASTER_COL.MOLIT - 1], official.molitTime, normalizeDuration_],
    ['Night', masterRow[MASTER_COL.NIGHT - 1], official.night, normalizeDuration_],
    ['INST', masterRow[MASTER_COL.INST - 1], official.inst, normalizeDuration_],
    ['T/O', masterRow[MASTER_COL.TAKEOFF - 1], official.takeoff, normalizeYesNoBlank],
    ['L/D', masterRow[MASTER_COL.LANDING - 1], official.landing, normalizeYesNoBlank]
  ];

  checks.push([
    'A/L',
    masterRow[MASTER_COL.AUTOLAND - 1],
    official.autoland,
    normalizeYesNoBlank
  ]);

  const changes = [];

  checks.forEach(function(check) {
    const name = check[0];
    const normalizer = check[3];
    const before = normalizer(check[1]);
    const after = normalizer(check[2]);

    if ((name === 'A/L' || after !== '') && before !== after) {
      changes.push({
        field: name,
        before: before,
        after: after
      });
    }
  });

  return changes;
}


function officialQueueCandidates_(queueRows, official) {
  const flight = normalizeFlightNo(official.flight);
  const dep = String(official.dep || '').trim().toUpperCase();
  const arr = String(official.arr || '').trim().toUpperCase();
  const date = normalizeDateString(official.date);

  return queueRows.map(function(row, index) {
    return { row: row, sheetRow: index + 2 };
  }).filter(function(item) {
    const row = item.row;
    const queueDate = normalizeDateString(row[QUEUE_COL.DATE - 1]);

    return normalizeFlightNo(row[QUEUE_COL.FLIGHT - 1]) === flight &&
      String(row[QUEUE_COL.DEP - 1] || '').trim().toUpperCase() === dep &&
      String(row[QUEUE_COL.ARR - 1] || '').trim().toUpperCase() === arr &&
      (queueDate === date || adjacentCalendarDate(queueDate, date));
  });
}


function dateTimeClockMinutes_(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}


function officialKstClockMinutes_(gmt) {
  const match = String(gmt || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return (Number(match[1]) * 60 + Number(match[2]) + 9 * 60) % (24 * 60);
}


function circularMinuteDistance_(a, b) {
  if (a === null || b === null) return 99999;
  const raw = Math.abs(a - b);
  return Math.min(raw, 1440 - raw);
}


function findQueueForOfficial_(queueRows, official) {
  const candidates = officialQueueCandidates_(queueRows, official);

  if (!candidates.length) {
    return { match: null, ambiguous: false };
  }

  const exact = candidates.filter(function(item) {
    return normalizeDateString(item.row[QUEUE_COL.DATE - 1]) === normalizeDateString(official.date);
  });

  if (exact.length === 1) return { match: exact[0], ambiguous: false };
  if (candidates.length === 1) return { match: candidates[0], ambiguous: false };

  const officialClock = officialKstClockMinutes_(official.outGmt);

  const ranked = candidates.map(function(item) {
    const row = item.row;
    const queueClock = dateTimeClockMinutes_(
      row[QUEUE_COL.LATEST_OUT - 1] || row[QUEUE_COL.ORIGINAL_OUT - 1]
    );

    return {
      item: item,
      distance: circularMinuteDistance_(officialClock, queueClock)
    };
  }).sort(function(a, b) {
    return a.distance - b.distance;
  });

  if (
    ranked.length &&
    ranked[0].distance <= 180 &&
    (ranked.length === 1 || ranked[1].distance - ranked[0].distance >= 30)
  ) {
    return { match: ranked[0].item, ambiguous: false };
  }

  return {
    match: null,
    ambiguous: true,
    reason: 'Multiple Queue rows match this official sector.'
  };
}


function findMasterForOfficial_(masterRows, official, queueMatch) {
  const rowsWithLocation = masterRows.map(function(row, index) {
    return { row: row, sheetRow: index + 2 };
  });

  const candidatesByLogId = function(logId) {
    if (!logId) return [];
    return rowsWithLocation.filter(function(item) {
      return String(item.row[MASTER_COL.LOG_ID - 1] || '').trim() ===
        String(logId).trim();
    });
  };

  // Queue → Master Log ID is the only direct identity link. If it exists,
  // it must resolve uniquely; never fall back from a broken explicit link.
  if (queueMatch && queueMatch.row) {
    const linkedId = String(
      queueMatch.row[QUEUE_COL.MASTER_LOG_ID - 1] || ''
    ).trim();

    if (linkedId) {
      const linked = candidatesByLogId(linkedId);

      if (linked.length === 1) {
        return { match: linked[0], ambiguous: false };
      }

      return {
        match: null,
        ambiguous: true,
        reason: linked.length
          ? 'Queue Master Log ID is duplicated.'
          : 'Queue Master Log ID does not exist in Master.'
      };
    }
  }

  const date = normalizeDateString(official.date);
  const flight = normalizeFlightNo(official.flight);
  const dep = String(official.dep || '').trim().toUpperCase();
  const arr = String(official.arr || '').trim().toUpperCase();

  // Without an explicit Master Log ID, identity is constrained by the
  // actual flight tuple first. A stale/reused Calendar Event ID must never
  // redirect an official import to a different flight or route.
  const tupleCandidates = rowsWithLocation.filter(function(item) {
    const row = item.row;

    return normalizeFlightNo(row[MASTER_COL.FLIGHT - 1]) === flight &&
      String(row[MASTER_COL.DEP - 1] || '').trim().toUpperCase() === dep &&
      String(row[MASTER_COL.ARR - 1] || '').trim().toUpperCase() === arr;
  });

  const exact = tupleCandidates.filter(function(item) {
    return normalizeDateString(item.row[MASTER_COL.DATE - 1]) === date;
  });

  if (exact.length === 1) {
    return { match: exact[0], ambiguous: false };
  }

  const adjacent = tupleCandidates.filter(function(item) {
    return adjacentCalendarDate(item.row[MASTER_COL.DATE - 1], date);
  });

  const compatible = exact.length ? exact : adjacent;

  if (compatible.length === 1) {
    return { match: compatible[0], ambiguous: false };
  }

  if (compatible.length > 1 && queueMatch && queueMatch.row) {
    const eventId = String(
      queueMatch.row[QUEUE_COL.EVENT_ID - 1] || ''
    ).trim();

    if (eventId) {
      const eventMatches = compatible.filter(function(item) {
        return String(item.row[MASTER_COL.EVENT_ID - 1] || '').trim() ===
          eventId;
      });

      if (eventMatches.length === 1) {
        return { match: eventMatches[0], ambiguous: false };
      }

      if (eventMatches.length > 1) {
        return {
          match: null,
          ambiguous: true,
          reason: 'Calendar Event ID is duplicated among compatible Master rows.'
        };
      }
    }
  }

  if (exact.length > 1) {
    return {
      match: null,
      ambiguous: true,
      reason: 'Exact Master key is duplicated.'
    };
  }

  if (adjacent.length > 1) {
    return {
      match: null,
      ambiguous: true,
      reason: 'Multiple adjacent-date Master rows match.'
    };
  }

  return { match: null, ambiguous: false };
}

function sourceRegisterEntry_(row, sheetRow, exactHash) {
  const verification = String(row[6] || '').trim();
  const notes = String(row[8] || '');
  const upper = (verification + ' ' + notes).toUpperCase();
  const failed =
    upper.indexOf('IMPORT FAILED') >= 0 ||
    upper.indexOf('STORAGE=FAILED') >= 0 ||
    upper.indexOf('STORAGE=IMPORTING') >= 0 ||
    verification.toUpperCase() === 'IMPORTING';

  return {
    row: sheetRow,
    sourceId: String(row[0] || ''),
    exactHash: !!exactHash,
    verification: verification,
    notes: notes,
    driveFileId: extractDriveFileIdFromNotes_(notes),
    failed: failed
  };
}


function findOfficialRegisterSource_(documentRows, source) {
  const coverage = source.coverageFrom + ' to ' + source.coverageTo;
  const hashTag = 'SHA256=' + source.sha256.toLowerCase();

  let exactHashMatch = null;
  let filenameCoverage = null;

  for (let i = 0; i < documentRows.length; i++) {
    const row = documentRows[i];
    const notes = String(row[8] || '');

    if (notes.toLowerCase().indexOf(hashTag.toLowerCase()) >= 0) {
      exactHashMatch = sourceRegisterEntry_(row, i + 2, true);
      continue;
    }

    if (
      String(row[1] || '').trim() === 'Flight Log Report' &&
      String(row[7] || '').trim() === source.fileName &&
      String(row[4] || '').trim() === coverage
    ) {
      filenameCoverage = sourceRegisterEntry_(row, i + 2, false);
    }
  }

  return exactHashMatch || filenameCoverage;
}


function buildOfficialImportPreview_(payload) {
  const source = validateOfficialImportPayload_(payload, false);
  const ss = openFlightSpreadsheet_(CONFIG.SPREADSHEET_ID);
  const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
  const queueSheet = ss.getSheetByName(CONFIG.QUEUE_SHEET);
  const documentSheet = ss.getSheetByName(CONFIG.DOCUMENT_REGISTER_SHEET);

  if (!masterSheet || !queueSheet || !documentSheet) {
    throw new Error('Required Flight LOG sheets are missing.');
  }

  const masterRows = masterSheet.getLastRow() >= 2
    ? masterSheet.getRange(2, 1, masterSheet.getLastRow() - 1, 70).getDisplayValues()
    : [];

  const queueRows = queueSheet.getLastRow() >= 2
    ? queueSheet.getRange(2, 1, queueSheet.getLastRow() - 1, 14).getDisplayValues()
    : [];

  const documentRows = documentSheet.getLastRow() >= 2
    ? documentSheet.getRange(2, 1, documentSheet.getLastRow() - 1, 9).getDisplayValues()
    : [];

  const items = [];
  const counts = {
    ALREADY_OFFICIAL: 0,
    MATCHED_PROVISIONAL: 0,
    NEW: 0,
    MISMATCH: 0,
    EXCLUDED: 0
  };

  payload.records.forEach(function(record, index) {
    const official = {
      date: normalizeDateString(record.date),
      registration: String(record.registration || '').trim().toUpperCase(),
      aircraftType: String(record.aircraftType || '').trim().toUpperCase(),
      flight: normalizeFlightNo(record.flight),
      dep: String(record.dep || '').trim().toUpperCase(),
      arr: String(record.arr || '').trim().toUpperCase(),
      dutyCode: String(record.dutyCode || '').trim().toUpperCase(),
      outGmt: normalizeClock_(record.outGmt),
      inGmt: normalizeClock_(record.inGmt),
      block: normalizeDuration_(record.block),
      companyTime: normalizeDuration_(record.companyTime),
      molitTime: normalizeDuration_(record.molitTime),
      night: normalizeDuration_(record.night),
      inst: normalizeDuration_(record.inst),
      takeoff: normalizeYesNoBlank(record.takeoff),
      landing: normalizeYesNoBlank(record.landing),
      autoland: normalizeYesNoBlank(record.autoland)
    };

    const queueResult = findQueueForOfficial_(queueRows, official);
    const queueMatch = queueResult.match;
    const masterResult = findMasterForOfficial_(masterRows, official, queueMatch);
    const masterMatch = masterResult.match;

    const queueStatus = queueMatch
      ? String(queueMatch.row[QUEUE_COL.STATUS - 1] || '').toUpperCase()
      : '';

    const excluded =
      official.dutyCode === 'EX' ||
      queueStatus.indexOf('DEADHEAD') >= 0 ||
      queueStatus.indexOf('TRAVEL') >= 0;

    let status;
    let reason = '';
    let changes = [];

    if (queueResult.ambiguous || masterResult.ambiguous) {
      status = 'MISMATCH';
      reason = queueResult.reason || masterResult.reason || 'Ambiguous identity.';
    } else if (excluded && masterMatch) {
      status = 'MISMATCH';
      reason = 'Deadhead/travel evidence unexpectedly has an operating Master row.';
    } else if (excluded) {
      status = 'EXCLUDED';
      reason = 'Deadhead/travel evidence is not credited as an operating Master sector.';
    } else if (!masterMatch) {
      status = 'NEW';
      reason = queueMatch
        ? 'Official sector has Queue evidence but no Master row.'
        : 'Official sector is not present in Master.';
    } else {
      const masterRow = masterMatch.row;
      const recordStatus = String(masterRow[MASTER_COL.RECORD_STATUS - 1] || '').toUpperCase();
      changes = compareOfficialMasterRow_(masterRow, official);

      if (recordStatus.indexOf('OFFICIAL') >= 0) {
        if (changes.length) {
          status = 'MISMATCH';
          reason = 'Existing OFFICIAL values differ from this PDF. Manual review required.';
        } else {
          status = 'ALREADY_OFFICIAL';
          reason = 'Existing official Master values match.';
        }
      } else {
        status = 'MATCHED_PROVISIONAL';
        reason = 'Existing provisional Master row can be officialized.';
      }
    }

    counts[status]++;

    const queueCrew = queueMatch ? parseCrewMemo(queueMatch.row[QUEUE_COL.MEMO - 1] || '') : null;
    const safetyPilot = masterMatch
      ? normalizeYesNoBlank(masterMatch.row[MASTER_COL.SAFETY - 1]) === 'Y'
      : !!(queueCrew && queueCrew.safetyPilot);

    items.push({
      index: index,
      status: status,
      reason: reason,
      record: official,
      changes: changes,
      queueRow: queueMatch ? queueMatch.sheetRow : null,
      queueDate: queueMatch ? normalizeDateString(queueMatch.row[QUEUE_COL.DATE - 1]) : '',
      queueEventId: queueMatch ? String(queueMatch.row[QUEUE_COL.EVENT_ID - 1] || '') : '',
      queueMasterLogId: queueMatch ? String(queueMatch.row[QUEUE_COL.MASTER_LOG_ID - 1] || '') : '',
      masterRow: masterMatch ? masterMatch.sheetRow : null,
      masterLogId: masterMatch ? String(masterMatch.row[MASTER_COL.LOG_ID - 1] || '') : '',
      masterDate: masterMatch ? normalizeDateString(masterMatch.row[MASTER_COL.DATE - 1]) : '',
      safetyPilot: safetyPilot
    });
  });

  const existingSource = findOfficialRegisterSource_(documentRows, source);
  const actionable = counts.MATCHED_PROVISIONAL + counts.NEW;
  const alreadyImported =
    !!existingSource &&
    !existingSource.failed &&
    actionable === 0 &&
    counts.MISMATCH === 0;

  return {
    source: source,
    sourceId: officialImportSourceId_(source),
    sourcePreviouslyRegistered: !!existingSource,
    registeredSourceId: existingSource ? existingSource.sourceId : '',
    retryRegistrationRow: existingSource && existingSource.failed ? existingSource.row : null,
    retryDriveFileId: existingSource && existingSource.failed ? existingSource.driveFileId : '',
    alreadyImported: alreadyImported,
    counts: counts,
    hasMismatches: counts.MISMATCH > 0,
    canConfirm: counts.MISMATCH === 0,
    items: items
  };
}


function createOfficialImportBackup_() {
  const sourceFile = DriveApp.getFileById(CONFIG.SPREADSHEET_ID);
  const parents = sourceFile.getParents();
  const destination = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd_HHmmss');
  const copy = sourceFile.makeCopy(
    'Myungwoo Flight LOG — MASTER_backup_before_official_import_' + stamp,
    destination
  );

  return {
    id: copy.getId(),
    url: copy.getUrl(),
    name: copy.getName()
  };
}


function getOrCreateChildFolder_(parent, name) {
  const matches = parent.getFoldersByName(name);
  return matches.hasNext() ? matches.next() : parent.createFolder(name);
}


function getOfficialStorageFolders_(year) {
  // Bootstrap from the verified 2026 Flight Log Report folder, then walk up to
  // Korean Air so future years use the same hierarchy without hard-coded IDs.
  const bootstrapActive = DriveApp.getFolderById(CONFIG.OFFICIAL_ACTIVE_FOLDER_ID);
  const yearParents = bootstrapActive.getParents();

  if (!yearParents.hasNext()) {
    throw new Error('Official storage year folder is missing.');
  }

  const bootstrapYear = yearParents.next();
  const airlineParents = bootstrapYear.getParents();

  if (!airlineParents.hasNext()) {
    throw new Error('Korean Air official storage folder is missing.');
  }

  const airlineFolder = airlineParents.next();
  const targetYear = getOrCreateChildFolder_(airlineFolder, String(year));
  const active = getOrCreateChildFolder_(targetYear, 'Flight Log Report');
  const archive = getOrCreateChildFolder_(active, 'Archive_Redundant');
  const staging = getOrCreateChildFolder_(active, CONFIG.OFFICIAL_STAGING_FOLDER_NAME);

  return {
    airline: airlineFolder,
    year: targetYear,
    active: active,
    archive: archive,
    staging: staging
  };
}


function sha256HexBytes_(bytes) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    bytes
  );

  return digest.map(function(value) {
    const unsigned = value < 0 ? value + 256 : value;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}


function createStagedOfficialPdf_(source, base64) {
  const bytes = Utilities.base64Decode(String(base64 || ''));
  const actualHash = sha256HexBytes_(bytes);

  if (actualHash !== String(source.sha256 || '').toLowerCase()) {
    throw new Error('Original PDF checksum does not match analyzed source.');
  }

  const year = String(source.coverageTo || '').slice(0, 4);
  const storage = getOfficialStorageFolders_(year);
  const blob = Utilities.newBlob(bytes, 'application/pdf', source.fileName);
  const file = storage.staging.createFile(blob);

  return {
    id: file.getId(),
    url: file.getUrl(),
    file: file,
    storage: storage
  };
}


function reuseRegisteredOfficialPdf_(source, fileId) {
  if (!fileId) return null;

  try {
    const file = DriveApp.getFileById(fileId);
    const bytes = file.getBlob().getBytes();
    const actualHash = sha256HexBytes_(bytes);

    if (actualHash !== String(source.sha256 || '').toLowerCase()) {
      return null;
    }

    const storage = getOfficialStorageFolders_(
      String(source.coverageTo || '').slice(0, 4)
    );

    return {
      id: file.getId(),
      url: file.getUrl(),
      file: file,
      storage: storage
    };
  } catch (error) {
    return null;
  }
}


function officialImportNotes_(source, fileInfo, storage, extra) {
  return [
    source.sectorCount + ' source records.',
    'SHA256=' + source.sha256,
    'DriveFileId=' + (fileInfo && fileInfo.id ? fileInfo.id : ''),
    'URL=' + (fileInfo && fileInfo.url ? fileInfo.url : ''),
    'Storage=' + storage,
    extra || ''
  ].filter(Boolean).join(' ');
}


function appendDocumentRegister_(sheet, sourceId, source, fileInfo, status, notesExtra) {
  const row = [
    sourceId,
    'Flight Log Report',
    'Korean Air (source report)',
    source.coverageTo,
    source.coverageFrom + ' to ' + source.coverageTo,
    'Detailed airline sector record',
    status,
    source.fileName,
    officialImportNotes_(source, fileInfo, status, notesExtra)
  ];

  sheet.appendRow(row);
  return sheet.getLastRow();
}


function updateDocumentRegisterStorage_(sheet, rowNumber, source, fileInfo, storage, extra) {
  const note = officialImportNotes_(source, fileInfo, storage, extra);
  const verification =
    storage === 'FAILED'
      ? 'IMPORT FAILED'
      : storage === 'IMPORTING'
      ? 'IMPORTING'
      : 'SOURCE PROVIDED';

  sheet.getRange(rowNumber, 7).setValue(verification);
  sheet.getRange(rowNumber, 9).setValue(note);
}


function setDurationCell_(sheet, row, col, value) {
  const fraction = durationFraction_(value);
  if (fraction === '') return;
  sheet.getRange(row, col).setValue(fraction);
}


function appendRemark_(sheet, row, note) {
  const cell = sheet.getRange(row, MASTER_COL.REMARKS);
  const oldValue = String(cell.getDisplayValue() || '').trim();
  cell.setValue(oldValue ? oldValue + ' | ' + note : note);
}


function applyOfficialToExistingRow_(sheet, item, sourceId) {
  const row = item.masterRow;
  const official = item.record;

  sheet.getRange(row, MASTER_COL.REG).setValue(official.registration);
  sheet.getRange(row, MASTER_COL.DUTY).setValue(official.dutyCode);
  sheet.getRange(row, MASTER_COL.OUT_GMT).setValue(official.outGmt);
  sheet.getRange(row, MASTER_COL.IN_GMT).setValue(official.inGmt);

  setDurationCell_(sheet, row, MASTER_COL.BLOCK, official.block);
  setDurationCell_(sheet, row, MASTER_COL.COMPANY, official.companyTime);
  setDurationCell_(sheet, row, MASTER_COL.MOLIT, official.molitTime);
  setDurationCell_(sheet, row, MASTER_COL.NIGHT, official.night);
  setDurationCell_(sheet, row, MASTER_COL.INST, official.inst);

  sheet.getRange(row, MASTER_COL.TAKEOFF).setValue(official.takeoff);
  sheet.getRange(row, MASTER_COL.LANDING).setValue(official.landing);

  // Blank is a real source value here (e.g. KE164). Do not infer N.
  sheet.getRange(row, MASTER_COL.AUTOLAND).setValue(official.autoland);

  // Derived company log columns. User-owned overrides live elsewhere.
  sheet.getRange(row, MASTER_COL.DAY).setFormula('=MAX(0,Q' + row + '-U' + row + ')');
  sheet.getRange(row, MASTER_COL.IFR).setFormula('=V' + row);
  sheet.getRange(row, MASTER_COL.PFPM).setFormula(
    '=IF(AS' + row + '<>"",AS' + row + ',IF(AND(Z' + row + '="Y",AA' + row + '="Y"),"PF","PM"))'
  );
  sheet.getRange(row, MASTER_COL.SIC).setFormula('=S' + row);

  if (item.safetyPilot) {
    sheet.getRange(row, MASTER_COL.SAFETY_CREDIT).setFormula('=S' + row);
  } else {
    sheet.getRange(row, MASTER_COL.SAFETY_CREDIT).setValue(0);
  }

  sheet.getRange(row, MASTER_COL.VERIFICATION).setValue('SOURCE IMPORTED');
  sheet.getRange(row, MASTER_COL.SOURCE_ID).setValue(sourceId);
  sheet.getRange(row, MASTER_COL.BT_SOURCE).setValue('Flight Log Report');
  sheet.getRange(row, MASTER_COL.RECORD_STATUS).setValue('OFFICIAL CONFIRMED');
  sheet.getRange(row, MASTER_COL.CREDIT_BASIS).setValue(
    durationMinutes_(official.molitTime) !== durationMinutes_(official.block)
      ? 'MOLIT / Authority Credited Time (partial crew credit)'
      : 'MOLIT / Authority Credited Time'
  );

  appendRemark_(
    sheet,
    row,
    'Official PDF import reconciled; user-entered Approach/PF-PM override/Flight Comment preserved.'
  );

  const syncCell = sheet.getRange(row, MASTER_COL.SYNC_NOTE);
  const oldSync = String(syncCell.getDisplayValue() || '').trim();
  const sync = 'Official PDF Import ' + sourceId + ' completed.';
  syncCell.setValue(oldSync ? oldSync + ' | ' + sync : sync);

  return String(sheet.getRange(row, MASTER_COL.LOG_ID).getDisplayValue() || '');
}


function buildOfficialNewMasterRow_(sheetRow, item, sourceId, queueRows) {
  const official = item.record;
  const row = new Array(70).fill('');
  const queue = item.queueRow ? queueRows[item.queueRow - 2] : null;
  const crew = queue ? parseCrewMemo(queue[QUEUE_COL.MEMO - 1] || '') : null;
  const safety = !!(crew && crew.safetyPilot);
  const logId = makeLogId(official.date, official.flight, official.dep, official.arr);

  setArrayCol(row, MASTER_COL.LOG_ID, logId);
  setArrayCol(row, MASTER_COL.DATE, official.date);
  setArrayCol(row, MASTER_COL.FLIGHT, official.flight);
  setArrayCol(row, MASTER_COL.DEP, official.dep);
  setArrayCol(row, MASTER_COL.ARR, official.arr);
  setArrayCol(row, MASTER_COL.ROUTE, official.dep + '-' + official.arr);

  setArrayCol(row, MASTER_COL.REG, official.registration);
  setArrayCol(row, MASTER_COL.DUTY, official.dutyCode);
  setArrayCol(row, MASTER_COL.POSITION, crew && crew.role ? crew.role : 'FO');
  setArrayCol(row, MASTER_COL.PIC, crew && crew.pic ? crew.pic : '');

  setArrayCol(row, MASTER_COL.OUT_GMT, official.outGmt);
  setArrayCol(row, MASTER_COL.IN_GMT, official.inGmt);
  setArrayCol(row, MASTER_COL.BLOCK, durationFraction_(official.block));
  setArrayCol(row, MASTER_COL.COMPANY, durationFraction_(official.companyTime));
  setArrayCol(row, MASTER_COL.MOLIT, durationFraction_(official.molitTime));
  setArrayCol(row, MASTER_COL.DAY, '=MAX(0,Q' + sheetRow + '-U' + sheetRow + ')');
  setArrayCol(row, MASTER_COL.NIGHT, durationFraction_(official.night));
  setArrayCol(row, MASTER_COL.INST, durationFraction_(official.inst));
  setArrayCol(row, MASTER_COL.IFR, '=V' + sheetRow);

  setArrayCol(row, MASTER_COL.TAKEOFF, official.takeoff);
  setArrayCol(row, MASTER_COL.LANDING, official.landing);
  setArrayCol(row, MASTER_COL.AUTOLAND, official.autoland);
  setArrayCol(
    row,
    MASTER_COL.PFPM,
    '=IF(AS' + sheetRow + '<>"",AS' + sheetRow + ',IF(AND(Z' + sheetRow + '="Y",AA' + sheetRow + '="Y"),"PF","PM"))'
  );

  setArrayCol(row, MASTER_COL.SIC, '=S' + sheetRow);
  setArrayCol(row, MASTER_COL.SAFETY, safety ? 'Y' : 'N');
  setArrayCol(row, MASTER_COL.SAFETY_CREDIT, safety ? '=S' + sheetRow : 0);
  setArrayCol(row, MASTER_COL.DOM_INTL, determineDomesticIntl(official.dep, official.arr));
  setArrayCol(row, MASTER_COL.CUM_BLOCK, '=SUM($Q$2:Q' + sheetRow + ')');
  setArrayCol(row, MASTER_COL.CUM_CREDIT, '=SUM($S$2:S' + sheetRow + ')');

  setArrayCol(row, MASTER_COL.VERIFICATION, 'SOURCE IMPORTED');
  setArrayCol(row, MASTER_COL.SOURCE_ID, sourceId);
  setArrayCol(row, MASTER_COL.REMARKS, 'Added from Official PDF Import; user post-flight inputs pending.');
  setArrayCol(row, MASTER_COL.OP_TYPE, safety ? 'SAFETY PILOT' : 'LINE');
  setArrayCol(row, MASTER_COL.CREW, crew && crew.crewType ? crew.crewType : '');
  setArrayCol(
    row,
    MASTER_COL.CREDIT_BASIS,
    durationMinutes_(official.molitTime) !== durationMinutes_(official.block)
      ? 'MOLIT / Authority Credited Time (partial crew credit)'
      : 'MOLIT / Authority Credited Time'
  );

  setArrayCol(row, MASTER_COL.PIC_STATUS, crew && crew.pic ? 'ROSTER CONFIRMED' : '');
  setArrayCol(
    row,
    MASTER_COL.CREW_SOURCE,
    queue
      ? String(queue[QUEUE_COL.SOURCE - 1] || '') + ' + Flight Log Report'
      : 'Flight Log Report'
  );

  setArrayCol(row, MASTER_COL.APP_TYPE_MIRROR, '=IF(C' + sheetRow + '="","",C' + sheetRow + ')');
  setArrayCol(row, MASTER_COL.APP_NO_MIRROR, '=IF(D' + sheetRow + '="","",D' + sheetRow + ')');

  setArrayCol(row, MASTER_COL.MONTH, official.date.slice(0, 7));
  setArrayCol(row, MASTER_COL.OPERATOR, 'Korean Air');
  setArrayCol(row, MASTER_COL.TYPE_RAW, official.aircraftType);
  setArrayCol(
    row,
    MASTER_COL.STANDARD_TYPE,
    official.aircraftType === '3QP' ? CONFIG.STANDARD_TYPE_32S : official.aircraftType
  );
  setArrayCol(row, MASTER_COL.BT_SOURCE, 'Flight Log Report');
  setArrayCol(row, MASTER_COL.RECORD_STATUS, 'OFFICIAL CONFIRMED');
  setArrayCol(row, MASTER_COL.INBOX_NOTE, 'Official source imported; user post-flight inputs pending');
  setArrayCol(row, MASTER_COL.POSTFLIGHT_STATUS, 'PENDING USER INPUT');

  if (queue) {
    setArrayCol(
      row,
      MASTER_COL.CAL_OUT_KST,
      queue[QUEUE_COL.LATEST_OUT - 1] || queue[QUEUE_COL.ORIGINAL_OUT - 1] || ''
    );
    setArrayCol(
      row,
      MASTER_COL.CAL_IN_KST,
      queue[QUEUE_COL.LATEST_IN - 1] || queue[QUEUE_COL.ORIGINAL_IN - 1] || ''
    );
    setArrayCol(row, MASTER_COL.EVENT_ID, queue[QUEUE_COL.EVENT_ID - 1] || '');
  }

  setArrayCol(
    row,
    MASTER_COL.SYNC_NOTE,
    item.queueDate && item.queueDate !== official.date
      ? 'Official PDF Import linked across Calendar/Official date boundary: Queue ' +
        item.queueDate + ' ↔ Official ' + official.date + '.'
      : 'Created by Official PDF Import.'
  );

  return { row: row, logId: logId };
}


function appendOfficialMasterRow_(sheet, item, sourceId, queueRows) {
  const sheetRow = sheet.getLastRow() + 1;
  const built = buildOfficialNewMasterRow_(sheetRow, item, sourceId, queueRows);

  if (sheetRow > 2) {
    sheet.getRange(sheetRow - 1, 1, 1, 70).copyTo(
      sheet.getRange(sheetRow, 1, 1, 70),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false
    );
  }

  sheet.getRange(sheetRow, 1, 1, 70).setValues([built.row]);
  return built.logId;
}


function markQueueOfficialByRow_(queueSheet, queueRow, logId) {
  if (!queueRow) return;
  queueSheet.getRange(queueRow, QUEUE_COL.STATUS).setValue('MASTER / OFFICIAL');
  queueSheet.getRange(queueRow, QUEUE_COL.MASTER_LOG_ID).setValue(logId);
}


function appendOfficialImportAudit_(sheet, preview, sourceId, sourceUrl, applied, backupUrl) {
  const now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm') + ' KST';
  const prefix =
    'KALLOG-' +
    preview.source.coverageTo.replace(/-/g, '') +
    '-' +
    preview.source.sha256.slice(0, 8).toUpperCase();

  const existingIds = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
      .getDisplayValues()
      .forEach(function(row) {
        const id = String(row[0] || '').trim();
        if (id) existingIds[id] = true;
      });
  }

  function appendOnce(row) {
    const id = String(row[0] || '').trim();
    if (!id || existingIds[id]) return;
    sheet.appendRow(row);
    existingIds[id] = true;
  }

  const matchCount = preview.counts.ALREADY_OFFICIAL;

  if (matchCount) {
    appendOnce([
      prefix + '-VERIFY',
      sourceUrl || sourceId,
      now,
      matchCount + ' prior sectors',
      'Prior official sectors',
      'MATCH current official values',
      'Existing OFFICIAL CONFIRMED Master',
      '0 changed sectors',
      'MATCH',
      now,
      'Idempotent overlap verification. Backup: ' + (backupUrl || ''),
      'PDF parser'
    ]);
  }

  preview.items.forEach(function(item) {
    if (item.status === 'ALREADY_OFFICIAL') return;

    const logId = applied[item.index] || item.masterLogId || (
      item.status === 'EXCLUDED'
        ? item.record.flight + ' ' + item.record.dep + '-' + item.record.arr
        : ''
    );

    const status =
      item.status === 'MATCHED_PROVISIONAL'
        ? 'OFFICIALIZED'
        : item.status === 'NEW'
        ? 'ADDED'
        : item.status === 'EXCLUDED'
        ? 'CONFIRMED / EXCLUDED'
        : item.status;

    const previous =
      item.masterLogId
        ? 'Existing Master ' + item.masterLogId
        : item.queueRow
        ? 'SCHEDULE_QUEUE only'
        : 'No prior Master/Queue match';

    const difference = item.changes && item.changes.length
      ? item.changes.map(function(change) {
          return change.field + ' ' + (change.before || 'blank') + ' → ' + (change.after || 'blank');
        }).join('; ')
      : item.reason;

    appendOnce([
      prefix + '-' + item.record.flight + '-' + String(item.index + 1),
      sourceUrl || sourceId,
      now,
      logId,
      item.status === 'EXCLUDED' ? 'Deadhead/travel evidence' : 'Official sector reconciliation',
      officialFieldSummary_(item.record),
      previous,
      difference,
      status,
      now,
      item.reason + ' User-owned post-flight fields preserved. Backup: ' + (backupUrl || ''),
      'PDF parser'
    ]);
  });
}


function parseCoverage_(value) {
  const match = String(value || '').match(/(20\d{2}-\d{2}-\d{2})\s+to\s+(20\d{2}-\d{2}-\d{2})/);
  if (!match) return null;
  return { from: match[1], to: match[2] };
}


function addOneDayString_(dateString) {
  const date = new Date(dateString + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}


function extractDriveFileIdFromNotes_(notes) {
  const match = String(notes || '').match(/DriveFileId=([A-Za-z0-9_-]+)/);
  return match ? match[1] : '';
}


function physicalFileInfo_(file, yearStorage) {
  const parents = file.getParents();
  let parentId = '';
  let parentName = '';

  if (parents.hasNext()) {
    const parent = parents.next();
    parentId = parent.getId();
    parentName = parent.getName();
  }

  let storage = 'OTHER';
  if (parentId === yearStorage.active.getId()) storage = 'ACTIVE';
  if (parentId === yearStorage.archive.getId()) storage = 'ARCHIVED_REDUNDANT';
  if (parentId === yearStorage.staging.getId()) storage = 'STAGING';

  return {
    file: file,
    id: file.getId(),
    name: file.getName(),
    url: file.getUrl(),
    parentId: parentId,
    parentName: parentName,
    storage: storage
  };
}


function findLegacyPhysicalFile_(fileName, yearStorage) {
  const candidates = [];

  [yearStorage.active, yearStorage.archive].forEach(function(folder) {
    const matches = folder.getFilesByName(fileName);
    while (matches.hasNext()) candidates.push(matches.next());
  });

  return candidates.length === 1 ? candidates[0] : null;
}


function selectMinimalCoverageIntervals_(intervals) {
  if (!intervals.length) return { selected: {}, gap: false };

  const earliest = intervals.reduce(function(min, item) {
    return !min || item.from < min ? item.from : min;
  }, '');

  const latest = intervals.reduce(function(max, item) {
    return !max || item.to > max ? item.to : max;
  }, '');

  const selected = {};
  let cursor = earliest;

  while (cursor <= latest) {
    const candidates = intervals.filter(function(item) {
      return item.from <= cursor && item.to >= cursor;
    }).sort(function(a, b) {
      return b.to.localeCompare(a.to);
    });

    if (!candidates.length) {
      return {
        selected: selected,
        gap: true,
        gapAt: cursor,
        earliest: earliest,
        latest: latest
      };
    }

    const best = candidates[0];
    selected[best.fileInfo.id] = true;

    if (best.to >= latest) break;
    cursor = addOneDayString_(best.to);
  }

  return {
    selected: selected,
    gap: false,
    earliest: earliest,
    latest: latest
  };
}


function optimizeOfficialPdfCoverage_(documentSheet) {
  const rows = documentSheet.getLastRow() >= 2
    ? documentSheet.getRange(2, 1, documentSheet.getLastRow() - 1, 9).getDisplayValues()
    : [];

  const intervals = [];
  const warnings = [];
  const storageCache = {};

  function storageForYear(year) {
    if (!storageCache[year]) {
      storageCache[year] = getOfficialStorageFolders_(year);
    }
    return storageCache[year];
  }

  rows.forEach(function(row, index) {
    if (String(row[1] || '').trim() !== 'Flight Log Report') return;

    const coverage = parseCoverage_(row[4]);
    if (!coverage) return;

    const issueYear =
      String(normalizeDateString(row[3]) || coverage.to).slice(0, 4);
    const yearStorage = storageForYear(issueYear);
    const fileId = extractDriveFileIdFromNotes_(row[8]);
    let file = null;

    if (fileId) {
      try {
        file = DriveApp.getFileById(fileId);
      } catch (error) {
        warnings.push('Registered PDF is not accessible: ' + fileId);
      }
    } else {
      file = findLegacyPhysicalFile_(String(row[7] || '').trim(), yearStorage);
    }

    if (!file) return;

    const fileInfo = physicalFileInfo_(file, yearStorage);

    // Staging/other locations are never used to justify archiving evidence.
    if (
      fileInfo.storage !== 'ACTIVE' &&
      fileInfo.storage !== 'ARCHIVED_REDUNDANT'
    ) {
      warnings.push('PDF outside managed active/archive folders: ' + fileInfo.name);
      return;
    }

    intervals.push({
      from: coverage.from,
      to: coverage.to,
      fileInfo: fileInfo,
      yearStorage: yearStorage,
      documentRow: index + 2
    });
  });

  const plan = selectMinimalCoverageIntervals_(intervals);

  if (plan.gap) {
    return {
      changed: false,
      warning: 'Coverage gap detected at ' + plan.gapAt + '; no archive moves performed.',
      warnings: warnings
    };
  }

  const movedToActive = [];
  const movedToArchive = [];

  intervals.forEach(function(interval) {
    const selected = !!plan.selected[interval.fileInfo.id];

    if (selected && interval.fileInfo.storage !== 'ACTIVE') {
      interval.fileInfo.file.moveTo(interval.yearStorage.active);
      movedToActive.push(interval.fileInfo.name);
      interval.fileInfo.storage = 'ACTIVE';
    } else if (!selected && interval.fileInfo.storage === 'ACTIVE') {
      interval.fileInfo.file.moveTo(interval.yearStorage.archive);
      movedToArchive.push(interval.fileInfo.name);
      interval.fileInfo.storage = 'ARCHIVED_REDUNDANT';
    }

    const oldNotes = String(
      documentSheet.getRange(interval.documentRow, 9).getDisplayValue() || ''
    );
    const stripped = oldNotes
      .replace(/\s*Storage=(ACTIVE|ARCHIVED_REDUNDANT|IMPORTING|FAILED)\b/g, '')
      .trim();

    documentSheet.getRange(interval.documentRow, 9).setValue(
      stripped + ' Storage=' + interval.fileInfo.storage
    );
  });

  return {
    changed: movedToActive.length > 0 || movedToArchive.length > 0,
    coverageFrom: plan.earliest,
    coverageTo: plan.latest,
    movedToActive: movedToActive,
    movedToArchive: movedToArchive,
    warnings: warnings
  };
}


function confirmOfficialImportUncached_(payload) {
  requireOfficialImportConfirmEnabled_();
  const source = validateOfficialImportPayload_(payload, true);
  const preview = buildOfficialImportPreview_(payload);

  if (preview.hasMismatches) {
    throw new Error(
      'Import blocked: ' + preview.counts.MISMATCH +
      ' official mismatch(es) require manual review.'
    );
  }

  if (preview.alreadyImported) {
    return {
      status: 'ALREADY_IMPORTED',
      sourceId: preview.registeredSourceId || preview.sourceId,
      counts: preview.counts,
      message: 'This PDF is already represented by the current official Master state.'
    };
  }

  const ss = openFlightSpreadsheet_(CONFIG.SPREADSHEET_ID);
  const masterSheet = ss.getSheetByName(CONFIG.MASTER_SHEET);
  const queueSheet = ss.getSheetByName(CONFIG.QUEUE_SHEET);
  const documentSheet = ss.getSheetByName(CONFIG.DOCUMENT_REGISTER_SHEET);
  const auditSheet = ss.getSheetByName(CONFIG.OFFICIAL_IMPORT_SHEET);

  if (!masterSheet || !queueSheet || !documentSheet || !auditSheet) {
    throw new Error('Required official-import sheets are missing.');
  }

  const sourceId = preview.registeredSourceId || preview.sourceId;
  let staged = null;
  let documentRow = preview.retryRegistrationRow || null;

  if (documentRow && preview.retryDriveFileId) {
    staged = reuseRegisteredOfficialPdf_(
      source,
      preview.retryDriveFileId
    );
  }

  if (!staged) {
    staged = createStagedOfficialPdf_(source, payload.pdfBase64);
  }

  if (documentRow) {
    updateDocumentRegisterStorage_(
      documentSheet,
      documentRow,
      source,
      staged,
      'IMPORTING',
      'Retrying prior failed official import.'
    );
  } else {
    documentRow = appendDocumentRegister_(
      documentSheet,
      sourceId,
      source,
      staged,
      'IMPORTING',
      'Awaiting Master reconciliation.'
    );
  }

  let backup = null;

  try {
    backup = createOfficialImportBackup_();

    const queueRows = queueSheet.getLastRow() >= 2
      ? queueSheet.getRange(2, 1, queueSheet.getLastRow() - 1, 14).getDisplayValues()
      : [];

    const applied = {};

    preview.items.forEach(function(item) {
      let logId = item.masterLogId || '';

      if (item.status === 'MATCHED_PROVISIONAL') {
        logId = applyOfficialToExistingRow_(masterSheet, item, sourceId);
      } else if (item.status === 'NEW') {
        logId = appendOfficialMasterRow_(masterSheet, item, sourceId, queueRows);
      } else if (item.status === 'MISMATCH') {
        throw new Error('Unexpected mismatch during confirm.');
      }

      if (
        item.status === 'MATCHED_PROVISIONAL' ||
        item.status === 'NEW' ||
        item.status === 'ALREADY_OFFICIAL'
      ) {
        if (item.queueRow && logId) {
          markQueueOfficialByRow_(queueSheet, item.queueRow, logId);
        }
      }

      if (logId) applied[item.index] = logId;
    });

    SpreadsheetApp.flush();

    // Verify Master/Queue state BEFORE moving any prior evidence files.
    const verification = buildOfficialImportPreview_({
      source: source,
      records: payload.records
    });

    if (
      verification.counts.MATCHED_PROVISIONAL !== 0 ||
      verification.counts.NEW !== 0 ||
      verification.counts.MISMATCH !== 0
    ) {
      throw new Error(
        'Post-import verification failed. Backup retained: ' +
        (backup ? backup.url : '')
      );
    }

    // Only after data verification succeeds does the exact original leave staging.
    staged.file.moveTo(staged.storage.active);

    updateDocumentRegisterStorage_(
      documentSheet,
      documentRow,
      source,
      staged,
      'ACTIVE',
      'Official PDF Import confirmed. Backup=' + (backup ? backup.url : '')
    );

    appendOfficialImportAudit_(
      auditSheet,
      preview,
      sourceId,
      staged.url,
      applied,
      backup ? backup.url : ''
    );

    // Redundant originals are archived last. They are never deleted.
    const storage = optimizeOfficialPdfCoverage_(documentSheet);

    SpreadsheetApp.flush();

    return {
      status: 'IMPORTED',
      sourceId: sourceId,
      driveFileId: staged.id,
      driveUrl: staged.url,
      counts: preview.counts,
      verificationCounts: verification.counts,
      backup: backup,
      storage: storage
    };

  } catch (error) {
    try {
      updateDocumentRegisterStorage_(
        documentSheet,
        documentRow,
        source,
        staged,
        'FAILED',
        'Import failed. Staged original retained. Backup=' +
          (backup ? backup.url : '') +
          ' Error=' +
          (error && error.message ? error.message : String(error))
      );
      SpreadsheetApp.flush();
    } catch (ignored) {}

    throw error;
  }
}
