"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/* =========================================================
   TYPES
========================================================= */

type Choice = "" | "Y" | "N";
type PfPm = "" | "PF" | "PM";
type MainTab = "today" | "history" | "recency" | "captains";
type Theme = "light" | "dark";

type Flight = {
  eventId?: string;

  date: string;
  day?: number;

  flight: string;

  dep: string;
  arr: string;
  route?: string;

  outDisplay?: string;
  inDisplay?: string;
  block?: string;

  pic?: string;
  role?: string;
  position?: string;
  crewType?: string;

  safetyPilot?: boolean;
  fdt?: string;

  official?: boolean;

  postFlightStatus?: string;
  recordStatus?: string;

  pfpmOverride?: PfPm;
  pfpm?: string;

  takeoff?: Choice;
  landing?: Choice;

  approachType?: string;
  approachNo?: string | number;

  comment?: string;
};

type AppData = {
  pastFlights?: Flight[];
  upcomingRotation?: Flight[];
  selectedEventId?: string;
};

type HistoryData = {
  flights?: Flight[];
};

type RecencyEvent = {
  date: string;
  flight: string;
  route: string;
  source?: string;
};

type RecencyItem = {
  status?: string;

  count?: number;
  required?: number;
  days?: number;

  expiry?: string;

  recentThree?: RecencyEvent[];

  source?: string;
};

type RecencyData = {
  takeoff: RecencyItem;
  landing: RecencyItem;
};

type CaptainFlight = {
  logId?: string;

  date: string;

  flight: string;

  dep: string;
  arr: string;
  route: string;

  flightComment?: string;

  verification?: string;
  recordStatus?: string;
};

type CaptainProfile = {
  captain: string;

  note: string;

  tags: string[];

  captainRowNumber?: number | null;

  computed: {
    sectors: number;

    lastFlown: string;

    lastFlight: string;

    lastRoute: string;
  };

  stored?: {
    lastFlown?: string;
    sectors?: string;
    lastFlight?: string;
    lastRoute?: string;
  };

  flights: CaptainFlight[];
};

type CaptainSummary = Pick<CaptainProfile, "captain" | "note" | "tags" | "computed">;

function captainKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/* =========================================================
   API
========================================================= */

async function apiCall(
  action: string,
  payload?: unknown
) {
  const response = await fetch(
    "/api/flight",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        action,
        payload,
      }),

      cache: "no-store",
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ||
        "Request failed."
    );
  }

  return data;
}

/* =========================================================
   THEME
========================================================= */

function getThemeVars(
  theme: Theme
): CSSProperties {

  if (theme === "dark") {
    return {
      "--bg": "#0f1115",
      "--surface": "#161a21",
      "--surface-2": "#1c212b",
      "--soft": "#202630",

      "--text": "#f2f4f7",
      "--text-2": "#d0d5dd",
      "--muted": "#98a2b3",
      "--muted-2": "#667085",

      "--line": "#2a303b",

      "--blue": "#4c8dff",
      "--blue-hover": "#3578e8",
      "--blue-soft": "#17243a",

      "--green": "#33c48d",
      "--green-soft": "#153128",

      "--amber": "#f0b84b",
      "--amber-soft": "#342916",

      "--danger": "#ff6b6b",

      "--overlay":
        "rgba(0,0,0,.62)",
    } as CSSProperties;
  }

  return {
    "--bg": "#f7f8fa",
    "--surface": "#ffffff",
    "--surface-2": "#ffffff",
    "--soft": "#f2f4f6",

    "--text": "#191f28",
    "--text-2": "#333d4b",
    "--muted": "#8b95a1",
    "--muted-2": "#b0b8c1",

    "--line": "#e5e8eb",

    "--blue": "#3182f6",
    "--blue-hover": "#1b64da",
    "--blue-soft": "#edf6ff",

    "--green": "#00a878",
    "--green-soft": "#e8f8f1",

    "--amber": "#f2a900",
    "--amber-soft": "#fff3e0",

    "--danger": "#ef4444",

    "--overlay":
      "rgba(15,23,42,.26)",
  } as CSSProperties;
}

/* =========================================================
   PAGE
========================================================= */

export default function Home() {

  const [theme, setTheme] =
    useState<Theme>("light");

  const [tab, setTab] =
    useState<MainTab>(
      "today"
    );

  /* TODAY */

  const [
    todayLoading,
    setTodayLoading,
  ] =
    useState(true);

  const [
    todayError,
    setTodayError,
  ] =
    useState("");

  const [
    pastFlights,
    setPastFlights,
  ] =
    useState<Flight[]>([]);

  const [
    upcomingRotation,
    setUpcomingRotation,
  ] =
    useState<Flight[]>([]);

  const [
    selectedEventId,
    setSelectedEventId,
  ] =
    useState("");

  const [pfpm, setPfpm] =
    useState<PfPm>("");

  const [takeoff, setTakeoff] =
    useState<Choice>("");

  const [landing, setLanding] =
    useState<Choice>("");

  const [
    approach,
    setApproach,
  ] =
    useState("");

  const [
    approachNo,
    setApproachNo,
  ] =
    useState("");

  const [comment, setComment] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [
    saveMessage,
    setSaveMessage,
  ] =
    useState("");

  /* CAPTAIN PROFILE */

  const [
    captainOpen,
    setCaptainOpen,
  ] =
    useState(false);

  const [
    captainLoading,
    setCaptainLoading,
  ] =
    useState(false);

  const [
    captainError,
    setCaptainError,
  ] =
    useState("");

  const [
    captainProfile,
    setCaptainProfile,
  ] =
    useState<CaptainProfile | null>(
      null
    );

  const [
    captainNote,
    setCaptainNote,
  ] =
    useState("");

  const [
    captainTagsText,
    setCaptainTagsText,
  ] =
    useState("");

  const [
    captainSaving,
    setCaptainSaving,
  ] =
    useState(false);

  const [
    captainSaveMessage,
    setCaptainSaveMessage,
  ] =
    useState("");

  /* CAPTAIN DIRECTORY */

  const [captains, setCaptains] = useState<CaptainSummary[]>([]);
  const [captainsLoaded, setCaptainsLoaded] = useState(false);
  const [captainsLoading, setCaptainsLoading] = useState(false);
  const [captainsError, setCaptainsError] = useState("");
  const [captainSearch, setCaptainSearch] = useState("");
  const [todayCaptainResult, setTodayCaptainResult] = useState<{
    key: string; profile: CaptainSummary | null; error: string;
  } | null>(null);
  const [todayCaptainRetry, setTodayCaptainRetry] = useState(0);
  const profileRequest = useRef(0);
  const directoryRequest = useRef(false);
  const summaryRevision = useRef(0);
  const summaryUpdates = useRef(new Map<string, { revision: number; profile: CaptainSummary }>());

  const filteredCaptains = useMemo(() => {
    const terms = captainKey(captainSearch).split(" ").filter(Boolean);
    return captains.filter(captain => {
      const searchable = captainKey([captain.captain, captain.note, ...captain.tags].join(" "));
      return terms.every(term => searchable.includes(term));
    });
  }, [captains, captainSearch]);

  /* HISTORY */

  const now =
    new Date();

  const [
    historyYear,
    setHistoryYear,
  ] =
    useState(
      now.getFullYear()
    );

  const [
    historyMonth,
    setHistoryMonth,
  ] =
    useState(
      now.getMonth() + 1
    );

  const [
    historyFlights,
    setHistoryFlights,
  ] =
    useState<Flight[]>([]);

  const [
    historyLoaded,
    setHistoryLoaded,
  ] =
    useState(false);

  const [
    historyLoading,
    setHistoryLoading,
  ] =
    useState(false);

  const [
    historyError,
    setHistoryError,
  ] =
    useState("");

  const [
    selectedHistoryDay,
    setSelectedHistoryDay,
  ] =
    useState<number | null>(
      null
    );

  /* RECENCY */

  const [
    recency,
    setRecency,
  ] =
    useState<RecencyData | null>(
      null
    );

  const [
    recencyLoading,
    setRecencyLoading,
  ] =
    useState(false);

  const [
    recencyError,
    setRecencyError,
  ] =
    useState("");

  /* DERIVED */

  const selectedFlight =
    useMemo(
      () =>
        pastFlights.find(
          f =>
            f.eventId ===
            selectedEventId
        ) || null,

      [
        pastFlights,
        selectedEventId,
      ]
    );

  const selectedHistoryFlights =
    useMemo(
      () => {

        if (
          selectedHistoryDay ===
          null
        ) {
          return [];
        }

        return historyFlights.filter(
          f =>
            Number(f.day) ===
            selectedHistoryDay
        );
      },

      [
        historyFlights,
        selectedHistoryDay,
      ]
    );

  /* =======================================================
     INIT THEME
  ======================================================= */

  useEffect(
    () => {

      const stored =
        window.localStorage.getItem(
          "flight-log-theme"
        );

      if (
        stored === "light" ||
        stored === "dark"
      ) {

        setTheme(stored);
        return;
      }

      const prefersDark =
        window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;

      setTheme(
        prefersDark
          ? "dark"
          : "light"
      );

    },
    []
  );

  function toggleTheme() {

    const next: Theme =
      theme === "dark"
        ? "light"
        : "dark";

    setTheme(next);

    window.localStorage.setItem(
      "flight-log-theme",
      next
    );
  }

  /* =======================================================
     INIT DATA
  ======================================================= */

  useEffect(
    () => {
      loadAppData();
    },
    []
  );

  useEffect(
    () => {

      if (!selectedFlight) {
        return;
      }

      setPfpm(
        selectedFlight
          .pfpmOverride ||
        ""
      );

      setTakeoff(
        selectedFlight
          .takeoff ||
        ""
      );

      setLanding(
        selectedFlight
          .landing ||
        ""
      );

      setApproach(
        selectedFlight
          .approachType ||
        ""
      );

      setApproachNo(
        selectedFlight.approachNo !==
          undefined &&
        selectedFlight.approachNo !==
          null

          ? String(
              selectedFlight
                .approachNo
            )

          : ""
      );

      setComment(
        selectedFlight
          .comment ||
        ""
      );

      setSaveMessage("");

    },
    [
      selectedFlight,
    ]
  );

  const selectedCaptain = selectedFlight?.pic?.trim() || "";
  const todayCaptainKey = selectedCaptain + ":" + todayCaptainRetry;
  const todayCaptainLoading = Boolean(selectedCaptain) && todayCaptainResult?.key !== todayCaptainKey;
  const todayCaptain = todayCaptainResult?.key === todayCaptainKey ? todayCaptainResult.profile : null;
  const todayCaptainError = todayCaptainResult?.key === todayCaptainKey ? todayCaptainResult.error : "";

  useEffect(() => {
    let cancelled = false;
    if (!selectedCaptain) return;
    const revision = summaryRevision.current;
    apiCall("getCaptainProfile", { captain: selectedCaptain })
      .then((profile: CaptainProfile) => {
        if (!cancelled) {
          const update = summaryUpdates.current.get(captainKey(selectedCaptain));
          setTodayCaptainResult({ key: todayCaptainKey, profile: update && update.revision > revision ? update.profile : profile, error: "" });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setTodayCaptainResult({ key: todayCaptainKey, profile: null, error: error instanceof Error ? error.message : String(error) });
      });
    return () => { cancelled = true; };
  }, [selectedCaptain, todayCaptainKey]);

  /* CLOSE DRAWER WITH ESC */

  useEffect(
    () => {

      function onKeyDown(
        e: KeyboardEvent
      ) {

        if (
          e.key === "Escape"
        ) {
          setCaptainOpen(false);
        }
      }

      window.addEventListener(
        "keydown",
        onKeyDown
      );

      return () =>
        window.removeEventListener(
          "keydown",
          onKeyDown
        );

    },
    []
  );

  /* =======================================================
     LOAD DATA
  ======================================================= */

  async function loadAppData() {

    try {

      setTodayLoading(true);
      setTodayError("");

      const data: AppData =
        await apiCall(
          "getAppData"
        );

      const past =
        data.pastFlights ||
        [];

      setPastFlights(past);

      setUpcomingRotation(
        data.upcomingRotation ||
        []
      );

      const preferred =
        data.selectedEventId;

      if (
        preferred &&
        past.some(
          f =>
            f.eventId ===
            preferred
        )
      ) {

        setSelectedEventId(
          preferred
        );

      } else if (
        past.length > 0
      ) {

        setSelectedEventId(
          past[0].eventId ||
          ""
        );

      } else {

        setSelectedEventId("");
      }

    } catch (err) {

      setTodayError(
        err instanceof Error
          ? err.message
          : String(err)
      );

    } finally {

      setTodayLoading(false);
    }
  }

  async function loadHistory(
    year = historyYear,
    month = historyMonth
  ) {

    try {

      setHistoryLoading(true);
      setHistoryError("");

      const data: HistoryData =
        await apiCall(
          "getHistoryMonth",
          {
            year,
            month,
          }
        );

      setHistoryFlights(
        data.flights ||
        []
      );

      setSelectedHistoryDay(
        null
      );

      setHistoryLoaded(true);

    } catch (err) {

      setHistoryError(
        err instanceof Error
          ? err.message
          : String(err)
      );

    } finally {

      setHistoryLoading(false);
    }
  }

  async function loadRecency() {

    try {

      setRecencyLoading(true);
      setRecencyError("");

      const data: RecencyData =
        await apiCall(
          "getRecencyData"
        );

      setRecency(data);

    } catch (err) {

      setRecencyError(
        err instanceof Error
          ? err.message
          : String(err)
      );

    } finally {

      setRecencyLoading(false);
    }
  }

  /* =======================================================
     CAPTAIN PROFILE
  ======================================================= */

  async function loadCaptains() {
    if (directoryRequest.current) return;
    directoryRequest.current = true;
    const revision = summaryRevision.current;
    setCaptainsLoading(true);
    setCaptainsError("");
    try {
      const data: { captains: CaptainSummary[] } = await apiCall("getCaptains");
      if (!Array.isArray(data.captains)) throw new Error("Captain 목록 응답을 확인해 주세요.");
      setCaptains(data.captains.map(item => {
        const update = summaryUpdates.current.get(captainKey(item.captain));
        return update && update.revision > revision ? update.profile : item;
      }));
      setCaptainsLoaded(true);
    } catch (error) {
      setCaptainsError(error instanceof Error ? error.message : String(error));
    } finally {
      directoryRequest.current = false;
      setCaptainsLoading(false);
    }
  }

  function syncCaptainSummary(profile: CaptainProfile) {
    summaryUpdates.current.set(captainKey(profile.captain), {
      revision: ++summaryRevision.current,
      profile,
    });
    setCaptains(current => current.map(item =>
      captainKey(item.captain) === captainKey(profile.captain) ? profile : item
    ));
    if (captainKey(profile.captain) === captainKey(selectedCaptain)) setTodayCaptainResult({ key: todayCaptainKey, profile, error: "" });
  }

  async function openCaptainProfile(name = selectedCaptain) {
    const captain = name.trim();

    if (!captain) {
      return;
    }

    const request = ++profileRequest.current;
    setCaptainProfile(null);
    setCaptainOpen(true);
    setCaptainLoading(true);
    setCaptainError("");
    setCaptainSaveMessage("");

    try {

      const data: CaptainProfile =
        await apiCall(
          "getCaptainProfile",
          {
            captain,
          }
        );

      if (request !== profileRequest.current) return;
      setCaptainProfile(data);
      syncCaptainSummary(data);

      setCaptainNote(
        data.note ||
        ""
      );

      setCaptainTagsText(
        (data.tags || [])
          .join(", ")
      );

    } catch (err) {

      if (request !== profileRequest.current) return;
      setCaptainError(
        err instanceof Error
          ? err.message
          : String(err)
      );

    } finally {

      if (request === profileRequest.current) setCaptainLoading(false);
    }
  }

  async function saveCaptainProfile() {

    if (!captainProfile) {
      return;
    }

    const request = profileRequest.current;
    try {

      setCaptainSaving(true);
      setCaptainSaveMessage("");

      const tags =
        captainTagsText
          .split(",")
          .map(
            tag =>
              tag.trim()
          )
          .filter(Boolean);

      await apiCall(
        "saveCaptainProfile",
        {
          captain:
            captainProfile
              .captain,

          note:
            captainNote.trim(),

          tags,
        }
      );

      const refreshed:
        CaptainProfile =
        await apiCall(
          "getCaptainProfile",
          {
            captain:
              captainProfile
                .captain,
          }
        );

      syncCaptainSummary(refreshed);
      if (request !== profileRequest.current) return;
      setCaptainProfile(
        refreshed
      );

      setCaptainNote(
        refreshed.note ||
        ""
      );

      setCaptainTagsText(
        (refreshed.tags || [])
          .join(", ")
      );

      setCaptainSaveMessage(
        "저장했어요"
      );

    } catch (err) {

      if (request !== profileRequest.current) return;
      setCaptainSaveMessage(
        "오류 · " +
        (
          err instanceof Error
            ? err.message
            : "Save failed."
        )
      );

    } finally {

      setCaptainSaving(false);
    }
  }

  /* =======================================================
     TAB
  ======================================================= */

  function selectTab(
    next: MainTab
  ) {

    setTab(next);

    if (next === "captains" && !captainsLoaded) {
      void loadCaptains();
    }

    if (
      next === "history" &&
      !historyLoaded
    ) {
      loadHistory();
    }

    if (
      next === "recency" &&
      !recency
    ) {
      loadRecency();
    }
  }

  /* =======================================================
     SAVE FLIGHT
  ======================================================= */

  async function saveDone() {

    if (
      !selectedFlight ||
      !selectedFlight.eventId
    ) {
      return;
    }

    try {

      setSaving(true);
      setSaveMessage("");

      const result =
        await apiCall(
          "savePostFlight",
          {
            eventId:
              selectedFlight
                .eventId,

            pfpmOverride:
              pfpm,

            takeoff,
            landing,

            approachType:
              approach.trim(),

            approachNo,

            comment:
              comment.trim(),
          }
        );

      setPastFlights(
        flights =>
          flights.map(
            f => {

              if (
                f.eventId !==
                selectedFlight.eventId
              ) {
                return f;
              }

              return {
                ...f,

                postFlightStatus:
                  "COMPLETE",

                pfpmOverride:
                  pfpm,

                takeoff:
                  f.official
                    ? f.takeoff
                    : takeoff ||
                      f.takeoff,

                landing:
                  f.official
                    ? f.landing
                    : landing ||
                      f.landing,

                approachType:
                  approach.trim(),

                approachNo,

                comment:
                  comment.trim(),

                recordStatus:
                  result?.official
                    ? f.recordStatus
                    : "FLOWN / PROVISIONAL",
              };
            }
          )
      );

      setSaveMessage(
        result?.action ===
        "CREATED"

          ? "저장했어요 · Provisional log created"

          : "저장했어요 · Flight log updated"
      );

    } catch (err) {

      setSaveMessage(
        "오류 · " +
        (
          err instanceof Error
            ? err.message
            : "Save failed."
        )
      );

    } finally {

      setSaving(false);
    }
  }

  /* =======================================================
     HISTORY NAV
  ======================================================= */

  function changeHistoryMonth(
    diff: number
  ) {

    let year =
      historyYear;

    let month =
      historyMonth + diff;

    if (month < 1) {
      month = 12;
      year -= 1;
    }

    if (month > 12) {
      month = 1;
      year += 1;
    }

    setHistoryYear(year);
    setHistoryMonth(month);

    loadHistory(
      year,
      month
    );
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (

    <main
      style={
        getThemeVars(theme)
      }
      className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-200"
    >

      <div className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">

        {/* =================================================
            HEADER
        ================================================== */}

        <header className="flex items-center justify-between">

          <div>

            <h1 className="text-[30px] font-bold tracking-[-0.04em] sm:text-[36px]">
              Flight LOG
            </h1>

            <p className="mt-1 text-[14px] font-medium text-[var(--muted)]">
              Personal Flight Record
            </p>

          </div>


          <div className="flex items-center gap-2">

            <div className="rounded-xl bg-[var(--soft)] px-3 py-2 text-[13px] font-semibold text-[var(--text-2)]">
              A321 · 32S
            </div>


            <button
              type="button"
              onClick={
                toggleTheme
              }
              aria-label="Toggle theme"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--soft)] text-[18px] transition"
            >
              {
                theme === "dark"
                  ? "☀"
                  : "☾"
              }
            </button>

          </div>

        </header>


        {/* =================================================
            NAV
        ================================================== */}

        <nav aria-label="Main navigation" className="mt-7 flex gap-5 border-b border-[var(--line)] sm:gap-7">

          <TopTab
            active={
              tab === "today"
            }
            onClick={
              () =>
                selectTab(
                  "today"
                )
            }
          >
            Today
          </TopTab>


          <TopTab
            active={
              tab === "history"
            }
            onClick={
              () =>
                selectTab(
                  "history"
                )
            }
          >
            History
          </TopTab>


          <TopTab
            active={
              tab === "recency"
            }
            onClick={
              () =>
                selectTab(
                  "recency"
                )
            }
          >
            Recency
          </TopTab>

          <TopTab active={tab === "captains"} onClick={() => selectTab("captains")}>
            Captains
          </TopTab>

        </nav>


        {/* =================================================
            TODAY
        ================================================== */}

        {
          tab === "today" && (

            <div className="pt-8">

              {
                todayLoading

                  ? (
                    <SimpleLoading
                      text="비행 기록을 불러오는 중..."
                    />
                  )

                  : todayError

                  ? (
                    <SimpleError
                      message={
                        todayError
                      }
                      onRetry={
                        loadAppData
                      }
                    />
                  )

                  : (
                    <>

                      {/* RECENT FLIGHT */}

                      <section className="mb-8">

                        <div className="mb-2 text-[13px] font-semibold text-[var(--muted)]">
                          최근 비행
                        </div>

                        <select
                          value={
                            selectedEventId
                          }
                          onChange={
                            e =>
                              setSelectedEventId(
                                e.target.value
                              )
                          }
                          className="h-14 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 text-[16px] font-semibold text-[var(--text)] outline-none transition focus:border-[var(--blue)]"
                        >

                          {
                            pastFlights.map(
                              flight => (

                                <option
                                  key={
                                    flight.eventId
                                  }
                                  value={
                                    flight.eventId
                                  }
                                >

                                  {flight.date}
                                  {" · "}
                                  {flight.flight}
                                  {" · "}
                                  {flight.dep}
                                  {" → "}
                                  {flight.arr}

                                  {
                                    flight.postFlightStatus !==
                                    "COMPLETE"

                                      ? " · PENDING"

                                      : ""
                                  }

                                </option>
                              )
                            )
                          }

                        </select>

                      </section>


                      {
                        selectedFlight

                          ? (
                            <>

                              {/* MAIN */}

                              <section className="grid gap-10 lg:grid-cols-[1.05fr_.95fr]">

                                {/* FLIGHT OVERVIEW */}

                                <div>

                                  <div className="flex items-start justify-between gap-4">

                                    <div>

                                      <div className="text-[15px] font-semibold text-[var(--muted)]">
                                        {selectedFlight.date}
                                      </div>

                                      <div className="mt-3 text-[24px] font-bold tracking-[-0.025em]">
                                        {selectedFlight.flight}
                                      </div>

                                      <div className="mt-1 flex items-center gap-3 text-[46px] font-bold leading-none tracking-[-0.06em] sm:text-[54px]">

                                        <span>
                                          {selectedFlight.dep}
                                        </span>

                                        <span className="text-[26px] font-normal text-[var(--muted-2)]">
                                          →
                                        </span>

                                        <span>
                                          {selectedFlight.arr}
                                        </span>

                                      </div>

                                    </div>


                                    <StateText
                                      good={
                                        selectedFlight
                                          .postFlightStatus ===
                                        "COMPLETE"
                                      }
                                    >
                                      {
                                        selectedFlight
                                          .postFlightStatus ===
                                        "COMPLETE"

                                          ? "기록 완료"

                                          : "입력 필요"
                                      }
                                    </StateText>

                                  </div>


                                  {/* METRICS */}

                                  <div className="mt-8 grid grid-cols-3 gap-2">

                                    <MetricBox
                                      label="OUT"
                                      value={
                                        selectedFlight
                                          .outDisplay ||
                                        "—"
                                      }
                                    />

                                    <MetricBox
                                      label="IN"
                                      value={
                                        selectedFlight
                                          .inDisplay ||
                                        "—"
                                      }
                                    />

                                    <MetricBox
                                      label="BLOCK"
                                      value={
                                        selectedFlight
                                          .block ||
                                        "—"
                                      }
                                    />

                                  </div>


                                  {/* CREW */}

                                  <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">

                                    <SoftInfo
                                      label="PIC"
                                      value={
                                        selectedFlight
                                          .pic ||
                                        "—"
                                      }
                                      wide
                                    />

                                    <SoftInfo
                                      label="ROLE"
                                      value={
                                        selectedFlight
                                          .role ||
                                        "FO"
                                      }
                                    />

                                    <SoftInfo
                                      label="CREW"
                                      value={
                                        selectedFlight
                                          .crewType ||
                                        "—"
                                      }
                                    />

                                    <SoftInfo
                                      label="SAFETY"
                                      value={
                                        selectedFlight
                                          .safetyPilot

                                          ? "YES"

                                          : "NO"
                                      }
                                    />

                                  </div>


                                  {/* STATUS */}

                                  <div className="mt-8 flex flex-wrap gap-3">

                                    <SoftStatus good>
                                      Flight complete
                                    </SoftStatus>

                                    <SoftStatus
                                      good={
                                        selectedFlight
                                          .postFlightStatus ===
                                        "COMPLETE"
                                      }
                                    >
                                      {
                                        selectedFlight
                                          .postFlightStatus ===
                                        "COMPLETE"

                                          ? "Post-flight complete"

                                          : "Post-flight pending"
                                      }
                                    </SoftStatus>

                                    <SoftStatus
                                      good={
                                        !!selectedFlight
                                          .official
                                      }
                                      pending={
                                        !selectedFlight
                                          .official
                                      }
                                    >
                                      {
                                        selectedFlight
                                          .official

                                          ? "Official"

                                          : "Official pending"
                                      }
                                    </SoftStatus>

                                  </div>

                                </div>


                                {/* QUICK LOG */}

                                <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">

                                  <div className="text-[13px] font-semibold text-[var(--muted)]">
                                    이번 비행 기록
                                  </div>

                                  <div className="mt-1 text-[24px] font-bold tracking-[-0.03em]">
                                    Quick Log
                                  </div>


                                  <div className="mt-7 space-y-6">

                                    <div>

                                      <InputLabel>
                                        PF / PM
                                      </InputLabel>

                                      <PfPmControl
                                        value={pfpm}
                                        onChange={
                                          setPfpm
                                        }
                                      />

                                      <div className="mt-2 text-[12px] text-[var(--muted)]">
                                        선택하지 않으면 AUTO
                                      </div>

                                    </div>


                                    <div className="grid grid-cols-2 gap-3">

                                      <div>

                                        <InputLabel>
                                          Takeoff
                                        </InputLabel>

                                        <YesNo
                                          value={
                                            takeoff
                                          }
                                          onChange={
                                            setTakeoff
                                          }
                                          disabled={
                                            !!selectedFlight
                                              .official
                                          }
                                        />

                                      </div>


                                      <div>

                                        <InputLabel>
                                          Landing
                                        </InputLabel>

                                        <YesNo
                                          value={
                                            landing
                                          }
                                          onChange={
                                            setLanding
                                          }
                                          disabled={
                                            !!selectedFlight
                                              .official
                                          }
                                        />

                                      </div>

                                    </div>


                                    <div>

                                      <InputLabel>
                                        Approach
                                      </InputLabel>


                                      <div className="grid grid-cols-[1fr_72px] gap-2">

                                        <input
                                          value={
                                            approach
                                          }
                                          onChange={
                                            e =>
                                              setApproach(
                                                e.target.value
                                              )
                                          }
                                          className="h-12 min-w-0 rounded-xl border border-transparent bg-[var(--soft)] px-4 text-[15px] font-medium text-[var(--text)] outline-none transition focus:border-[var(--blue)]"
                                          placeholder="ILS33R"
                                        />

                                        <input
                                          value={
                                            approachNo
                                          }
                                          onChange={
                                            e =>
                                              setApproachNo(
                                                e.target.value
                                              )
                                          }
                                          className="h-12 rounded-xl border border-transparent bg-[var(--soft)] px-2 text-center text-[15px] font-semibold text-[var(--text)] outline-none transition focus:border-[var(--blue)]"
                                          placeholder="No."
                                        />

                                      </div>

                                    </div>


                                    <div>

                                      <InputLabel>
                                        Comment
                                      </InputLabel>

                                      <input
                                        value={
                                          comment
                                        }
                                        onChange={
                                          e =>
                                            setComment(
                                              e.target.value
                                            )
                                        }
                                        className="h-12 w-full rounded-xl border border-transparent bg-[var(--soft)] px-4 text-[15px] text-[var(--text)] outline-none transition focus:border-[var(--blue)]"
                                        placeholder="Optional"
                                      />

                                    </div>


                                    <button
                                      disabled={
                                        saving
                                      }
                                      onClick={
                                        saveDone
                                      }
                                      className="h-14 w-full rounded-[16px] bg-[var(--blue)] text-[16px] font-bold text-white transition hover:bg-[var(--blue-hover)] active:scale-[.995] disabled:bg-[var(--muted-2)]"
                                    >

                                      {
                                        saving
                                          ? "저장 중..."
                                          : "SAVE & DONE"
                                      }

                                    </button>


                                    {
                                      saveMessage && (

                                        <div
                                          className={[
                                            "text-center text-[13px] font-medium",

                                            saveMessage.startsWith(
                                              "오류"
                                            )

                                              ? "text-[var(--danger)]"

                                              : "text-[var(--green)]",
                                          ].join(" ")}
                                        >
                                          {saveMessage}
                                        </div>
                                      )
                                    }

                                  </div>

                                </div>

                              </section>


                              {/* CAPTAIN */}

                              <section className="mt-12 border-t border-[var(--line)] pt-8">

                                <div className="flex items-center justify-between">

                                  <div>

                                    <div className="text-[14px] font-semibold text-[var(--muted)]">
                                      Captain
                                    </div>

                                    <div className="mt-2 text-[22px] font-bold tracking-[-0.025em]">
                                      {
                                        selectedFlight
                                          .pic ||
                                        "—"
                                      }
                                    </div>

                                  </div>


                                  <button
                                    type="button"
                                    onClick={
                                      () => void openCaptainProfile()
                                    }
                                    disabled={
                                      captainSaving || !selectedFlight
                                        .pic
                                    }
                                    className="rounded-xl bg-[var(--blue-soft)] px-4 py-3 text-[14px] font-semibold text-[var(--blue)] transition hover:opacity-80 disabled:opacity-30"
                                  >
                                    Profile →
                                  </button>

                                </div>


                                <div className="mt-3" aria-live="polite">
                                  {todayCaptainLoading ? (
                                    <p className="text-[13px] text-[var(--muted)]">Tags를 불러오는 중...</p>
                                  ) : todayCaptainError ? (
                                    <div className="text-[13px] text-[var(--danger)]">
                                      Tags를 불러오지 못했어요.
                                      <button type="button" onClick={() => setTodayCaptainRetry(value => value + 1)} className="ml-2 underline">다시 시도</button>
                                    </div>
                                  ) : todayCaptain && captainKey(todayCaptain.captain) === captainKey(selectedCaptain) ? (
                                    <CaptainTags tags={todayCaptain.tags} />
                                  ) : null}
                                </div>

                                <div className="mt-5 rounded-[18px] bg-[var(--soft)] px-4 py-4">

                                  <div className="text-[13px] font-semibold text-[var(--muted)]">
                                    Captain note
                                  </div>

                                  <div className="mt-1 text-[15px] font-medium text-[var(--text-2)]">
                                    Profile에서 기존 메모와 함께 탄 비행 기록을 확인할 수 있어요.
                                  </div>

                                </div>

                              </section>


                              {/* NEXT ROTATION */}

                              <section className="mt-12 border-t border-[var(--line)] pt-8">

                                <div className="text-[14px] font-semibold text-[var(--muted)]">
                                  다음 비행
                                </div>


                                <div className="mt-3 divide-y divide-[var(--line)]">

                                  {
                                    upcomingRotation.length

                                      ? upcomingRotation.map(
                                          flight => (

                                            <div
                                              key={
                                                flight.eventId ||
                                                `${flight.date}-${flight.flight}`
                                              }
                                              className="grid grid-cols-[1fr_auto] items-center gap-4 py-5"
                                            >

                                              <div>

                                                <div className="flex items-center gap-3">

                                                  <div className="text-[18px] font-bold">
                                                    {
                                                      flight.flight
                                                    }
                                                  </div>

                                                  <div className="text-[17px] font-semibold text-[var(--text-2)]">
                                                    {
                                                      flight.dep
                                                    }
                                                    {" → "}
                                                    {
                                                      flight.arr
                                                    }
                                                  </div>

                                                </div>


                                                <div className="mt-2 text-[13px] font-medium text-[var(--muted)]">

                                                  {
                                                    flight
                                                      .outDisplay ||
                                                    "—"
                                                  }

                                                  {" → "}

                                                  {
                                                    flight
                                                      .inDisplay ||
                                                    "—"
                                                  }

                                                  {" · Block "}

                                                  {
                                                    flight
                                                      .block ||
                                                    "—"
                                                  }

                                                </div>

                                              </div>


                                              <div className="rounded-xl bg-[var(--soft)] px-3 py-2 text-[12px] font-semibold text-[var(--text-2)]">

                                                {
                                                  formatDateShort(
                                                    flight.date
                                                  )
                                                }

                                              </div>

                                            </div>
                                          )
                                        )

                                      : (

                                        <div className="py-5 text-[15px] text-[var(--muted)]">
                                          No upcoming flight.
                                        </div>
                                      )
                                  }

                                </div>

                              </section>

                            </>
                          )

                          : (

                            <EmptyState
                              title="최근 비행이 없어요"
                              text="현재 조회 범위에 완료된 비행이 없습니다."
                            />
                          )
                      }

                    </>
                  )
              }

            </div>
          )
        }


        {/* =================================================
            HISTORY
        ================================================== */}

        {
          tab === "history" && (

            <div className="pt-8">

              <div className="grid gap-10 lg:grid-cols-[1fr_.85fr]">

                <section>

                  <div className="mb-6 flex items-center justify-between">

                    <button
                      onClick={
                        () =>
                          changeHistoryMonth(
                            -1
                          )
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-[24px] text-[var(--muted)] hover:bg-[var(--soft)]"
                    >
                      ‹
                    </button>


                    <div className="text-center">

                      <div className="text-[13px] font-semibold text-[var(--muted)]">
                        Flight History
                      </div>

                      <div className="mt-1 text-[27px] font-bold tracking-[-0.035em]">
                        {
                          monthName(
                            historyMonth
                          )
                        }
                        {" "}
                        {historyYear}
                      </div>

                    </div>


                    <button
                      onClick={
                        () =>
                          changeHistoryMonth(
                            1
                          )
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-[24px] text-[var(--muted)] hover:bg-[var(--soft)]"
                    >
                      ›
                    </button>

                  </div>


                  {
                    historyLoading

                      ? (
                        <SimpleLoading
                          text="기록을 불러오는 중..."
                        />
                      )

                      : historyError

                      ? (
                        <SimpleError
                          message={
                            historyError
                          }
                          onRetry={
                            () =>
                              loadHistory()
                          }
                        />
                      )

                      : (
                        <HistoryCalendar
                          year={
                            historyYear
                          }
                          month={
                            historyMonth
                          }
                          flights={
                            historyFlights
                          }
                          selectedDay={
                            selectedHistoryDay
                          }
                          onSelect={
                            setSelectedHistoryDay
                          }
                        />
                      )
                  }

                </section>


                <section className="lg:border-l lg:border-[var(--line)] lg:pl-8">

                  <div className="text-[13px] font-semibold text-[var(--muted)]">
                    선택한 날짜
                  </div>

                  <div className="mt-1 text-[26px] font-bold tracking-[-0.035em]">

                    {
                      selectedHistoryDay !==
                      null

                        ? `${String(
                            selectedHistoryDay
                          ).padStart(
                            2,
                            "0"
                          )} ${monthNameShort(
                            historyMonth
                          )} ${historyYear}`

                        : "날짜를 선택하세요"
                    }

                  </div>


                  {
                    selectedHistoryDay ===
                    null && (

                      <div className="mt-8 text-[15px] text-[var(--muted)]">
                        비행이 있는 날짜를 선택하면 상세 기록을 볼 수 있어요.
                      </div>
                    )
                  }


                  {
                    selectedHistoryDay !==
                      null &&
                    selectedHistoryFlights
                      .length === 0 && (

                      <div className="mt-8 text-[15px] text-[var(--muted)]">
                        이 날짜에는 비행이 없어요.
                      </div>
                    )
                  }


                  <div className="mt-7 space-y-8">

                    {
                      selectedHistoryFlights.map(
                        (
                          flight,
                          index
                        ) => (

                          <HistoryFlight
                            key={
                              flight.eventId ||
                              `${flight.flight}-${index}`
                            }
                            flight={
                              flight
                            }
                          />
                        )
                      )
                    }

                  </div>

                </section>

              </div>

            </div>
          )
        }


        {/* =================================================
            RECENCY
        ================================================== */}

        {
          tab === "recency" && (

            <div className="pt-8">

              <div className="mb-10">

                <div className="text-[14px] font-semibold text-[var(--muted)]">
                  A321 · 32S
                </div>

                <div className="mt-1 text-[30px] font-bold tracking-[-0.045em]">
                  Recency
                </div>

              </div>


              {
                recencyLoading

                  ? (
                    <SimpleLoading
                      text="Recency 계산 중..."
                    />
                  )

                  : recencyError

                  ? (
                    <SimpleError
                      message={
                        recencyError
                      }
                      onRetry={
                        loadRecency
                      }
                    />
                  )

                  : recency

                  ? (

                    <div className="grid gap-12 md:grid-cols-2 md:gap-0">

                      <RecencyPanel
                        title="Takeoff"
                        data={
                          recency.takeoff
                        }
                      />

                      <RecencyPanel
                        title="Landing"
                        data={
                          recency.landing
                        }
                        right
                      />

                    </div>
                  )

                  : null
              }


              <div className="mt-12 border-t border-[var(--line)] pt-4 text-[12px] leading-relaxed text-[var(--muted)]">
                Expiry is calculated from FLIGHT_LOG_MASTER using an inclusive 90-day window.
                Provisional user-entered T/O and L/D values remain active until official reconciliation.
              </div>

            </div>
          )
        }

        {tab === "captains" && (
          <section className="pt-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-[30px] font-bold tracking-[-0.045em]">Captains</h2>
                <p className="mt-1 text-[14px] text-[var(--muted)]">함께 비행한 Captain의 메모와 태그</p>
              </div>
              <button type="button" disabled={captainsLoading || captainSaving} onClick={() => void loadCaptains()} className="rounded-xl bg-[var(--soft)] px-4 py-3 text-[13px] font-semibold disabled:opacity-30">새로고침</button>
            </div>
            <label htmlFor="captain-search" className="mt-7 block text-[13px] font-semibold text-[var(--muted)]">Captain Search</label>
            <input id="captain-search" type="search" value={captainSearch} onChange={event => setCaptainSearch(event.target.value)} placeholder="이름, Tags, Captain Comment 검색" className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-[var(--soft)] px-4 py-4 text-[15px] outline-none focus:border-[var(--blue)]" />
            {captainsLoading ? <SimpleLoading text="Captain 목록을 불러오는 중..." /> : captainsError ? (
              <SimpleError message={captainsError} onRetry={loadCaptains} />
            ) : captainsLoaded ? (
              <>
                <p aria-live="polite" className="mt-5 text-[13px] text-[var(--muted)]">{filteredCaptains.length} / {captains.length} captains</p>
                {filteredCaptains.length ? (
                  <div className="mt-2 divide-y divide-[var(--line)]">
                    {filteredCaptains.map(captain => (
                      <button type="button" key={captainKey(captain.captain)} disabled={captainSaving} onClick={() => void openCaptainProfile(captain.captain)} aria-label={captain.captain + " Profile 열기"} className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-5 text-left transition hover:bg-[var(--soft)] focus-visible:outline-2 focus-visible:outline-[var(--blue)] disabled:opacity-30">
                        <div className="min-w-0">
                          <div className="break-words text-[19px] font-bold tracking-[-0.025em]">{captain.captain}</div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--muted)]">
                            <span>{captain.computed.sectors} sectors together</span>
                            <span>Last flown · {captain.computed.lastFlown ? formatDateLong(captain.computed.lastFlown) : "—"}</span>
                          </div>
                          <div className="mt-3"><CaptainTags tags={captain.tags} /></div>
                        </div>
                        <span className="shrink-0 rounded-xl bg-[var(--blue-soft)] px-3 py-2 text-[13px] font-semibold text-[var(--blue)]">Profile →</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="py-12 text-center text-[14px] text-[var(--muted)]">{captains.length ? "검색 결과가 없어요. 다른 이름이나 태그로 검색해 주세요." : "등록된 Captain이 없어요."}</p>
                )}
              </>
            ) : null}
          </section>
        )}
      </div>


      {/* ===================================================
          CAPTAIN PROFILE DRAWER
      ==================================================== */}

      {
        captainOpen && (

          <CaptainDrawer
            loading={
              captainLoading
            }
            error={
              captainError
            }
            profile={
              captainProfile
            }
            note={
              captainNote
            }
            tagsText={
              captainTagsText
            }
            saving={
              captainSaving
            }
            saveMessage={
              captainSaveMessage
            }
            onNoteChange={
              setCaptainNote
            }
            onTagsChange={
              setCaptainTagsText
            }
            onSave={
              saveCaptainProfile
            }
            onClose={
              () =>
                setCaptainOpen(false)
            }
          />
        )
      }

    </main>
  );
}

/* =========================================================
   CAPTAIN DRAWER
========================================================= */

function CaptainTags({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-[12px] text-[var(--muted)]">등록된 태그 없음</span>;
  return (
    <span className="flex flex-wrap gap-2">
      {Array.from(new Set(tags)).map(tag => (
        <span key={tag} className="max-w-full break-words rounded-lg bg-[var(--blue-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--blue)]">{tag}</span>
      ))}
    </span>
  );
}

function CaptainDrawer({
  loading,
  error,
  profile,
  note,
  tagsText,
  saving,
  saveMessage,
  onNoteChange,
  onTagsChange,
  onSave,
  onClose,
}: {
  loading: boolean;
  error: string;

  profile:
    CaptainProfile | null;

  note: string;

  tagsText: string;

  saving: boolean;

  saveMessage: string;

  onNoteChange:
    (value: string) => void;

  onTagsChange:
    (value: string) => void;

  onSave:
    () => void;

  onClose:
    () => void;
}) {

  return (

    <div className="fixed inset-0 z-50">

      {/* OVERLAY */}

      <button
        type="button"
        aria-label="Close Captain Profile"
        onClick={
          onClose
        }
        className="absolute inset-0 bg-[var(--overlay)]"
      />


      {/* DRAWER */}

      <aside className="absolute bottom-0 right-0 top-0 w-full overflow-y-auto border-l border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:w-[520px]">

        {/* HEADER */}

        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-5 py-5 sm:px-6">

          <div>

            <div className="text-[13px] font-semibold text-[var(--muted)]">
              Flight LOG
            </div>

            <div className="mt-1 text-[20px] font-bold">
              Captain Profile
            </div>

          </div>


          <button
            type="button"
            onClick={
              onClose
            }
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--soft)] text-[22px] text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            ×
          </button>

        </div>


        <div className="px-5 pb-12 pt-6 sm:px-6">

          {
            loading

              ? (

                <SimpleLoading
                  text="Captain Profile을 불러오는 중..."
                />
              )

              : error

              ? (

                <div className="py-10 text-[14px] font-medium text-[var(--danger)]">
                  {error}
                </div>
              )

              : profile

              ? (
                <>

                  {/* IDENTITY */}

                  <section>

                    <div className="text-[30px] font-bold tracking-[-0.04em]">
                      {profile.captain}
                    </div>


                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[14px] font-medium text-[var(--muted)]">

                      <span>
                        {profile.computed.sectors}
                        {" "}
                        sectors together
                      </span>

                      {
                        profile
                          .computed
                          .lastFlown && (

                          <span>
                            Last flown ·{" "}
                            {
                              formatDateLong(
                                profile
                                  .computed
                                  .lastFlown
                              )
                            }
                          </span>
                        )
                      }

                    </div>


                    {
                      profile
                        .computed
                        .lastFlight && (

                        <div className="mt-5 rounded-[18px] bg-[var(--soft)] p-4">

                          <div className="text-[12px] font-semibold text-[var(--muted)]">
                            LAST FLIGHT
                          </div>

                          <div className="mt-1 text-[17px] font-bold">
                            {
                              profile
                                .computed
                                .lastFlight
                            }
                            {" · "}
                            {
                              routeArrow(
                                profile
                                  .computed
                                  .lastRoute
                              )
                            }
                          </div>

                        </div>
                      )
                    }

                  </section>


                  {/* NOTE */}

                  <section className="mt-9 border-t border-[var(--line)] pt-7">

                    <div className="text-[18px] font-bold">
                      Captain Note
                    </div>

                    <div className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
                      다음 비행에서 참고할 지속 메모
                    </div>


                    <textarea
                      value={
                        note
                      }
                      onChange={
                        e =>
                          onNoteChange(
                            e.target.value
                          )
                      }
                      className="mt-4 min-h-[150px] w-full resize-y rounded-[18px] border border-transparent bg-[var(--soft)] p-4 text-[15px] leading-relaxed text-[var(--text)] outline-none transition focus:border-[var(--blue)]"
                      placeholder="Operational / CRM reference note"
                    />

                  </section>


                  {/* TAGS */}

                  <section className="mt-7">

                    <div className="text-[18px] font-bold">
                      Tags
                    </div>

                    <div className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
                      쉼표로 구분해서 입력
                    </div>


                    <input
                      value={
                        tagsText
                      }
                      onChange={
                        e =>
                          onTagsChange(
                            e.target.value
                          )
                      }
                      className="mt-4 h-12 w-full rounded-[14px] border border-transparent bg-[var(--soft)] px-4 text-[15px] text-[var(--text)] outline-none transition focus:border-[var(--blue)]"
                      placeholder="STD BRF, Early setup, CRM"
                    />


                    {
                      tagsText
                        .split(",")
                        .map(
                          tag =>
                            tag.trim()
                        )
                        .filter(Boolean)
                        .length > 0 && (

                        <div className="mt-3 flex flex-wrap gap-2">

                          {
                            tagsText
                              .split(",")
                              .map(
                                tag =>
                                  tag.trim()
                              )
                              .filter(Boolean)
                              .map(
                                tag => (

                                  <span
                                    key={tag}
                                    className="rounded-full bg-[var(--blue-soft)] px-3 py-2 text-[12px] font-semibold text-[var(--blue)]"
                                  >
                                    {tag}
                                  </span>
                                )
                              )
                          }

                        </div>
                      )
                    }

                  </section>


                  {/* SAVE */}

                  <section className="mt-7">

                    <button
                      type="button"
                      onClick={
                        onSave
                      }
                      disabled={
                        saving
                      }
                      className="h-14 w-full rounded-[16px] bg-[var(--blue)] text-[16px] font-bold text-white transition hover:bg-[var(--blue-hover)] disabled:bg-[var(--muted-2)]"
                    >
                      {
                        saving
                          ? "저장 중..."
                          : "SAVE CAPTAIN NOTE"
                      }
                    </button>


                    {
                      saveMessage && (

                        <div
                          className={[
                            "mt-3 text-center text-[13px] font-semibold",

                            saveMessage.startsWith(
                              "오류"
                            )

                              ? "text-[var(--danger)]"

                              : "text-[var(--green)]",
                          ].join(" ")}
                        >
                          {saveMessage}
                        </div>
                      )
                    }

                  </section>


                  {/* FLIGHT HISTORY */}

                  <section className="mt-10 border-t border-[var(--line)] pt-7">

                    <div className="text-[18px] font-bold">
                      Recent Flights
                    </div>

                    <div className="mt-1 text-[13px] text-[var(--muted)]">
                      이 기장과 함께한 최근 비행
                    </div>


                    <div className="mt-4 divide-y divide-[var(--line)]">

                      {
                        profile.flights.length

                          ? profile.flights.map(
                              (
                                flight,
                                index
                              ) => (

                                <CaptainFlightRow
                                  key={
                                    flight.logId ||
                                    `${flight.date}-${flight.flight}-${index}`
                                  }
                                  flight={
                                    flight
                                  }
                                />
                              )
                            )

                          : (

                            <div className="py-6 text-[14px] text-[var(--muted)]">
                              No flight history found.
                            </div>
                          )
                      }

                    </div>

                  </section>

                </>
              )

              : null
          }

        </div>

      </aside>

    </div>
  );
}

/* =========================================================
   CAPTAIN FLIGHT
========================================================= */

function CaptainFlightRow({
  flight,
}: {
  flight: CaptainFlight;
}) {

  return (

    <div className="py-5 first:pt-0">

      <div className="grid grid-cols-[82px_1fr] gap-3">

        <div className="text-[12px] font-semibold text-[var(--muted)]">
          {
            formatDateCompact(
              flight.date
            )
          }
        </div>


        <div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">

            <div className="text-[15px] font-bold">
              {flight.flight}
            </div>

            <div className="text-[14px] font-semibold text-[var(--text-2)]">
              {flight.dep} → {flight.arr}
            </div>

          </div>


          <div className="mt-1 text-[11px] font-medium text-[var(--muted)]">
            {
              flight.recordStatus ||
              flight.verification ||
              ""
            }
          </div>


          {
            flight.flightComment && (

              <div className="mt-3 rounded-[14px] bg-[var(--soft)] px-4 py-3">

                <div className="text-[11px] font-semibold text-[var(--muted)]">
                  FLIGHT NOTE
                </div>

                <div className="mt-1 text-[14px] leading-relaxed text-[var(--text-2)]">
                  {flight.flightComment}
                </div>

              </div>
            )
          }

        </div>

      </div>

    </div>
  );
}

/* =========================================================
   TOP TAB
========================================================= */

function TopTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {

  return (

    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        "relative pb-4 text-[16px] font-semibold transition",

        active
          ? "text-[var(--text)]"
          : "text-[var(--muted)]",
      ].join(" ")}
    >
      {children}

      {
        active && (

          <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] rounded-full bg-[var(--text)]" />
        )
      }

    </button>
  );
}

/* =========================================================
   LABEL
========================================================= */

function InputLabel({
  children,
}: {
  children: ReactNode;
}) {

  return (

    <div className="mb-2 text-[13px] font-semibold text-[var(--muted)]">
      {children}
    </div>
  );
}

/* =========================================================
   METRIC
========================================================= */

function MetricBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (

    <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-3 py-4 text-center">

      <div className="text-[12px] font-semibold text-[var(--muted)]">
        {label}
      </div>

      <div className="mt-1 text-[24px] font-bold tracking-[-0.035em]">
        {value}
      </div>

    </div>
  );
}

/* =========================================================
   INFO
========================================================= */

function SoftInfo({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {

  return (

    <div
      className={
        wide
          ? "col-span-2 sm:col-span-1"
          : ""
      }
    >

      <div className="text-[12px] font-semibold text-[var(--muted)]">
        {label}
      </div>

      <div className="mt-1 break-words text-[15px] font-semibold leading-snug text-[var(--text-2)]">
        {value}
      </div>

    </div>
  );
}

/* =========================================================
   STATE
========================================================= */

function StateText({
  good,
  children,
}: {
  good: boolean;
  children: ReactNode;
}) {

  return (

    <div
      className={[
        "flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[12px] font-semibold",

        good
          ? "bg-[var(--green-soft)] text-[var(--green)]"
          : "bg-[var(--amber-soft)] text-[var(--amber)]",
      ].join(" ")}
    >

      <span
        className={[
          "h-2 w-2 rounded-full",

          good
            ? "bg-[var(--green)]"
            : "bg-[var(--amber)]",
        ].join(" ")}
      />

      {children}

    </div>
  );
}


function SoftStatus({
  children,
  good,
  pending = false,
}: {
  children: ReactNode;
  good: boolean;
  pending?: boolean;
}) {

  return (

    <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--muted)]">

      <span
        className={[
          "h-2 w-2 rounded-full",

          good
            ? "bg-[var(--green)]"
            : pending
            ? "bg-[var(--amber)]"
            : "bg-[var(--muted-2)]",
        ].join(" ")}
      />

      {children}

    </div>
  );
}

/* =========================================================
   PF / PM
========================================================= */

function PfPmControl({
  value,
  onChange,
}: {
  value: PfPm;
  onChange:
    (value: PfPm) => void;
}) {

  return (

    <div className="grid grid-cols-2 rounded-[14px] bg-[var(--soft)] p-1">

      <button
        type="button"
        onClick={
          () =>
            onChange(
              value === "PF"
                ? ""
                : "PF"
            )
        }
        className={[
          "h-11 rounded-[11px] text-[15px] font-semibold transition",

          value === "PF"
            ? "bg-[var(--surface-2)] text-[var(--text)] shadow-sm"
            : "text-[var(--muted)]",
        ].join(" ")}
      >
        PF
      </button>


      <button
        type="button"
        onClick={
          () =>
            onChange(
              value === "PM"
                ? ""
                : "PM"
            )
        }
        className={[
          "h-11 rounded-[11px] text-[15px] font-semibold transition",

          value === "PM"
            ? "bg-[var(--surface-2)] text-[var(--text)] shadow-sm"
            : "text-[var(--muted)]",
        ].join(" ")}
      >
        PM
      </button>

    </div>
  );
}

/* =========================================================
   YES / NO
========================================================= */

function YesNo({
  value,
  onChange,
  disabled = false,
}: {
  value: Choice;
  onChange:
    (value: Choice) => void;
  disabled?: boolean;
}) {

  return (

    <div className="grid grid-cols-2 rounded-[14px] bg-[var(--soft)] p-1">

      <button
        type="button"
        disabled={disabled}
        onClick={
          () =>
            onChange(
              value === "Y"
                ? ""
                : "Y"
            )
        }
        className={[
          "h-11 rounded-[11px] text-[14px] font-semibold transition disabled:opacity-40",

          value === "Y"
            ? "bg-[var(--surface-2)] text-[var(--green)] shadow-sm"
            : "text-[var(--muted)]",
        ].join(" ")}
      >
        YES
      </button>


      <button
        type="button"
        disabled={disabled}
        onClick={
          () =>
            onChange(
              value === "N"
                ? ""
                : "N"
            )
        }
        className={[
          "h-11 rounded-[11px] text-[14px] font-semibold transition disabled:opacity-40",

          value === "N"
            ? "bg-[var(--surface-2)] text-[var(--text-2)] shadow-sm"
            : "text-[var(--muted)]",
        ].join(" ")}
      >
        NO
      </button>

    </div>
  );
}

/* =========================================================
   HISTORY CALENDAR
========================================================= */

function HistoryCalendar({
  year,
  month,
  flights,
  selectedDay,
  onSelect,
}: {
  year: number;
  month: number;
  flights: Flight[];

  selectedDay:
    number | null;

  onSelect:
    (day: number) => void;
}) {

  const firstDay =
    new Date(
      year,
      month - 1,
      1
    ).getDay();

  const daysInMonth =
    new Date(
      year,
      month,
      0
    ).getDate();

  const today =
    new Date();

  const cells:
    ReactNode[] =
    [];

  for (
    let i = 0;
    i < firstDay;
    i++
  ) {

    cells.push(

      <div
        key={
          `blank-${i}`
        }
        className="aspect-square"
      />
    );
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day++
  ) {

    const count =
      flights.filter(
        flight =>
          Number(
            flight.day
          ) === day
      ).length;

    const selected =
      selectedDay ===
      day;

    const isToday =
      year ===
        today.getFullYear() &&
      month ===
        today.getMonth() + 1 &&
      day ===
        today.getDate();

    cells.push(

      <button
        type="button"
        key={day}
        onClick={
          () =>
            onSelect(day)
        }
        className={[
          "relative flex aspect-square min-h-[54px] flex-col items-center justify-center rounded-[16px] transition",

          selected
            ? "bg-[var(--blue)] text-white"
            : count
            ? "bg-[var(--blue-soft)] text-[var(--blue)]"
            : "text-[var(--muted)] hover:bg-[var(--soft)]",

          isToday &&
          !selected
            ? "ring-2 ring-[var(--blue)]"
            : "",
        ].join(" ")}
      >

        <span className="text-[14px] font-semibold">
          {day}
        </span>

        {
          count > 0 && (

            <span className="mt-1 text-[9px] font-semibold">
              {count} FLT
            </span>
          )
        }

      </button>
    );
  }

  return (

    <>

      <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-semibold text-[var(--muted-2)]">

        <div>Sun</div>
        <div>Mon</div>
        <div>Tue</div>
        <div>Wed</div>
        <div>Thu</div>
        <div>Fri</div>
        <div>Sat</div>

      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells}
      </div>

    </>
  );
}

/* =========================================================
   HISTORY FLIGHT
========================================================= */

function HistoryFlight({
  flight,
}: {
  flight: Flight;
}) {

  return (

    <div className="border-b border-[var(--line)] pb-8 last:border-b-0">

      <div className="flex justify-between gap-4">

        <div>

          <div className="text-[14px] font-semibold text-[var(--muted)]">
            {flight.flight}
          </div>

          <div className="mt-1 text-[25px] font-bold tracking-[-0.035em]">
            {flight.dep} → {flight.arr}
          </div>

        </div>


        <div className="text-[12px] font-semibold text-[var(--muted)]">

          {
            flight.official
              ? "Official"
              : "Provisional"
          }

        </div>

      </div>


      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">

        <SoftInfo
          label="BLOCK"
          value={
            flight.block ||
            "—"
          }
        />

        <SoftInfo
          label="POSITION"
          value={
            flight.position ||
            flight.role ||
            "—"
          }
        />

        <SoftInfo
          label="PIC"
          value={
            flight.pic ||
            "—"
          }
          wide
        />

        <SoftInfo
          label="T/O · L/D"
          value={
            `${flight.takeoff || "—"} · ${flight.landing || "—"}`
          }
        />

        <SoftInfo
          label="PF / PM"
          value={
            flight.pfpm ||
            "AUTO"
          }
        />

      </div>


      {
        flight.approachType && (

          <div className="mt-5 text-[14px] font-medium text-[var(--text-2)]">

            Approach · {flight.approachType}

            {
              flight.approachNo
                ? ` · ${flight.approachNo}`
                : ""
            }

          </div>
        )
      }


      {
        flight.comment && (

          <div className="mt-4 rounded-[16px] bg-[var(--soft)] p-4 text-[14px] leading-relaxed text-[var(--text-2)]">
            {flight.comment}
          </div>
        )
      }

    </div>
  );
}

/* =========================================================
   RECENCY
========================================================= */

function RecencyPanel({
  title,
  data,
  right = false,
}: {
  title: string;
  data: RecencyItem;
  right?: boolean;
}) {

  const current =
    data.status ===
    "CURRENT";

  const recent =
    data.recentThree ||
    [];

  return (

    <section
      className={
        right
          ? "md:border-l md:border-[var(--line)] md:pl-10"
          : "md:pr-10"
      }
    >

      <div className="flex items-center justify-between">

        <div className="text-[20px] font-bold">
          {title}
        </div>

        <StateText
          good={
            current
          }
        >
          {
            current
              ? "Current"
              : "Not current"
          }
        </StateText>

      </div>


      <div className="mt-8">

        <div className="text-[13px] font-semibold text-[var(--muted)]">
          다음 갱신 기준
        </div>

        <div className="mt-2 text-[38px] font-bold leading-none tracking-[-0.055em] sm:text-[44px]">

          {
            data.expiry
              ? formatDateLong(
                  data.expiry
                )
              : "—"
          }

        </div>

        <div className="mt-3 text-[16px] font-medium text-[var(--text-2)]">
          까지 유효해요
        </div>

      </div>


      <div className="mt-7 flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-medium text-[var(--muted)]">

        <span>
          {data.count ?? 0}
          {" "}
          qualifying events
        </span>

        <span>·</span>

        <span>
          {data.required ?? 3}
          {" "}
          required
        </span>

        <span>·</span>

        <span>
          {data.days ?? 90}
          {" "}
          days
        </span>

      </div>


      <div className="mt-8">

        <div className="mb-2 text-[13px] font-semibold text-[var(--muted)]">
          최근 기록
        </div>


        <div className="divide-y divide-[var(--line)]">

          {
            recent.length

              ? recent.map(
                  (
                    event,
                    index
                  ) => (

                    <div
                      key={
                        `${event.date}-${event.flight}-${index}`
                      }
                      className="grid grid-cols-[60px_1fr_auto] items-center gap-4 py-4"
                    >

                      <div className="text-[13px] font-semibold text-[var(--muted)]">

                        {
                          formatMonthDay(
                            event.date
                          )
                        }

                      </div>


                      <div>

                        <div className="text-[15px] font-bold">
                          {event.flight}
                        </div>

                        <div className="mt-1 text-[13px] font-medium text-[var(--muted)]">
                          {event.route}
                        </div>

                      </div>


                      <div className="max-w-[100px] text-right text-[10px] font-semibold text-[var(--muted-2)]">
                        {event.source || ""}
                      </div>

                    </div>
                  )
                )

              : (

                <div className="py-5 text-[14px] text-[var(--muted)]">
                  No qualifying event found.
                </div>
              )
          }

        </div>

      </div>

    </section>
  );
}

/* =========================================================
   STATES
========================================================= */

function SimpleLoading({
  text,
}: {
  text: string;
}) {

  return (

    <div className="py-20 text-center text-[15px] font-medium text-[var(--muted)]">
      {text}
    </div>
  );
}


function SimpleError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {

  return (

    <div className="py-14">

      <div className="text-[15px] font-medium text-[var(--danger)]">
        {message}
      </div>

      <button
        type="button"
        onClick={
          onRetry
        }
        className="mt-5 rounded-xl bg-[var(--blue)] px-5 py-3 text-[14px] font-bold text-white"
      >
        다시 시도
      </button>

    </div>
  );
}


function EmptyState({
  title,
  text,
}: {
  title: string;
  text: string;
}) {

  return (

    <div className="py-20 text-center">

      <div className="text-[22px] font-bold">
        {title}
      </div>

      <div className="mt-2 text-[15px] text-[var(--muted)]">
        {text}
      </div>

    </div>
  );
}

/* =========================================================
   DATE HELPERS
========================================================= */

function formatDateShort(
  value?: string
) {

  if (!value) {
    return "";
  }

  const parts =
    value.split("-");

  if (
    parts.length !==
    3
  ) {
    return value;
  }

  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];

  return `${months[
    Number(parts[1]) - 1
  ]} ${parts[2]}`;
}


function formatDateCompact(
  value?: string
) {

  if (!value) {
    return "—";
  }

  const parts =
    value.split("-");

  if (
    parts.length !==
    3
  ) {
    return value;
  }

  return `${parts[1]}/${parts[2]}`;
}


function formatMonthDay(
  value: string
) {

  const parts =
    value.split("-");

  if (
    parts.length !==
    3
  ) {
    return value;
  }

  return `${parts[1]}/${parts[2]}`;
}


function formatDateLong(
  value: string
) {

  const parts =
    value
      .split("-")
      .map(Number);

  if (
    parts.length !==
    3
  ) {
    return value;
  }

  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];

  return `${parts[2]} ${
    months[
      parts[1] - 1
    ]
  } ${parts[0]}`;
}


function monthName(
  month: number
) {

  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][month - 1] || "";
}


function monthNameShort(
  month: number
) {

  return [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][month - 1] || "";
}


function routeArrow(
  route?: string
) {

  if (!route) {
    return "—";
  }

  return route.replace(
    "-",
    " → "
  );
}