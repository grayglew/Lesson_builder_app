(function () {
  "use strict";

  const STORAGE_KEY = "lesson-builder-vercel:v1";
  const DB_NAME = "lesson-builder-vercel-db";
  const DB_VERSION = 1;
  const DB_STATE_STORE = "state";
  const CURRENT_STATE_KEY = "current";
  const SLIDE_VIEWBOX_WIDTH = 1600;
  const SLIDE_VIEWBOX_HEIGHT = 1000;
  const PDF_EXPORT_WIDTH = 1280;
  const PDF_EXPORT_WIDTHS = [1280, 1024, 800];
  const PDF_JPEG_QUALITY = 0.86;
  const DEFAULT_CLASSES = ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Year 13"];
  const DEFAULT_SLIDE_TEMPLATES = [
    {
      id: "template_start_expectations",
      title: "Start of lesson expectations",
      bullets: [
        "Enter calmly and get equipment ready",
        "Write the title and date",
        "Begin the starter task in silence",
        "Show all working clearly"
      ]
    },
    {
      id: "template_teacher_example_expectations",
      title: "Teacher example expectations",
      bullets: [
        "Track the example carefully",
        "Copy each step with annotations",
        "Ask questions at the pause points",
        "Check the final answer method"
      ]
    },
    {
      id: "template_independent_practice_expectations",
      title: "Independent practice expectations",
      bullets: [
        "Work independently for the full time",
        "Attempt every question before asking for help",
        "Use worked examples to self-check",
        "Correct mistakes in a different colour"
      ]
    }
  ];
  const LEGACY_IGNORED_SHEETS = new Set(["classroom codes", "image references"]);
  const DEFAULT_DRAWING_SIZE = { width: 2560, height: 1600 };
  const DEFAULT_PEN_COLOR = "#2563eb";
  const DEFAULT_PEN_SIZE = 2;
  const MIN_PEN_SIZE = 0.5;
  const CLOUD_SYNC_LATEST_URL = "/api/builder-sync/latest";
  const CLOUD_SYNC_UPLOAD_URL = "/api/builder-sync/upload-url";
  const CLOUD_SYNC_COMPLETE_URL = "/api/builder-sync/complete";
  const BUILDER_GLOBAL_URL = "/api/builder-global";
  const BUILDER_GLOBAL_BOOTSTRAP_URL = "/api/builder-global/bootstrap";
  const BUILDER_GLOBAL_CLASSES_URL = "/api/builder-global/classes";
  const BUILDER_GLOBAL_TEMPLATES_URL = "/api/builder-global/templates";
  const BUILDER_GLOBAL_RETRIEVAL_ITEMS_URL = "/api/builder-global/retrieval-items";
  const BUILDER_GLOBAL_RETRIEVAL_IMAGES_RESOLVE_URL = "/api/builder-global/retrieval-images/resolve";
  const BUILDER_GLOBAL_RETRIEVAL_LOG_URL = "/api/builder-global/retrieval-log";
  const BUILDER_GLOBAL_RETRIEVAL_NEXT_URL = "/api/builder-global/retrieval-next";
  const BUILDER_GLOBAL_IMAGE_UPLOAD_URL = "/api/builder-global/image-upload-url";
  const BUILDER_GLOBAL_IMAGE_COMPLETE_URL = "/api/builder-global/image-complete";
  const SYNC_WORKSPACE = "workspace";
  const SYNC_GLOBAL = "global";
  const SYNC_ALL = "all";
  const SAVED_LESSONS_LIST_URL = "/api/builder-lessons";
  const SAVED_LESSON_UPLOAD_URL = "/api/builder-lessons/upload-url";
  const SAVED_LESSON_COMPLETE_URL = "/api/builder-lessons/complete";
  const SAVED_LESSON_OPEN_URL = "/api/builder-lessons/open";
  const SAVED_LESSON_RENAME_URL = "/api/builder-lessons/rename";
  const SAVED_LESSON_TAUGHT_URL = "/api/builder-lessons/taught";
  const SAVED_LESSON_DELETE_URL = "/api/builder-lessons/delete";
  const PRESENTER_RETRIEVAL_LOG_URL = "/api/presenter/retrieval-log";
  const PRESENTER_RETRIEVAL_NEXT_URL = "/api/presenter/retrieval-next";
  const PRESENTER_PDF_SNAPSHOT_UPLOAD_URL = "/api/presenter/pdf-snapshot/upload-url";
  const PRESENTER_PDF_URL = "/api/presenter/pdf";
  const CLOUD_SYNC_DEBOUNCE_MS = 2500;
  const TARGETED_SYNC_QUEUED_STATUS = "Retrieval bank change saved locally; Supabase sync is queued.";
  const TARGETED_SYNCED_STATUS = "Retrieval bank synced to Supabase.";

  const panelNames = {
    starter: "Starter",
    "saved-lessons": "Saved lessons",
    retrieval: "Retrieval",
    example: "Example",
    worksheet: "Worksheet",
    pdf: "PDF",
    cfu: "CFU",
    draw: "Draw",
    templates: "Templates",
    placeholder: "Placeholder",
    math: "LaTeX"
  };

  const $ = (id) => document.getElementById(id);

  const draft = {
    starter: [
      { lo: "", image: null, answerImage: null, retrievalItemId: "", currentImageSlot: 1 },
      { lo: "", image: null, answerImage: null, retrievalItemId: "", currentImageSlot: 1 },
      { lo: "", image: null, answerImage: null, retrievalItemId: "", currentImageSlot: 1 },
      { lo: "", image: null, answerImage: null, retrievalItemId: "", currentImageSlot: 1 }
    ],
    example: {
      lo: "",
      spacing: 1.3,
      image1: null,
      image2: null,
      answerImage1: null,
      answerImage2: null,
      retrievalImages: emptyRetrievalImages(),
      retrievalAnswerImages: emptyRetrievalImages()
    },
    worksheet: { title: "", worksheet: null, answers: null },
    pdf: { file: null, renderWidth: 1800 },
    cfu: { placement: "full", image: null },
    placeholder: { text: "" },
    math: { questions: "", answers: "" }
  };

  const drawingState = {
    width: DEFAULT_DRAWING_SIZE.width,
    height: DEFAULT_DRAWING_SIZE.height,
    strokes: [],
    activeStroke: null
  };

  const legacyImport = {
    trackerFile: null,
    imageFiles: []
  };

  const retrievalEditor = {
    itemId: "",
    draft: null
  };

  const templateEditor = {
    activeId: ""
  };

  let state = createInitialState();
  let persistTimer = 0;
  let persistInFlight = Promise.resolve();
  let cloudPersistTimer = 0;
  let cloudPersistInFlight = Promise.resolve();
  let globalPersistTimer = 0;
  let globalPersistInFlight = Promise.resolve();
  let cloudLastSyncedAt = "";
  let relationalGlobalLastSyncedAt = "";
  let targetedGlobalPersistTimer = 0;
  let targetedGlobalPersistInFlight = Promise.resolve();
  const pendingRetrievalItemSaves = new Map();
  const pendingRetrievalItemDeletes = new Set();
  const pendingRetrievalNextItems = new Map();
  let pendingClassSync = false;
  let pendingTemplateSync = false;
  let cloudLastSyncedAtByKind = {
    [SYNC_WORKSPACE]: "",
    [SYNC_GLOBAL]: ""
  };
  let pendingCloudSyncKinds = new Set();
  let initialCloudRefreshInFlight = null;
  let savedLessons = [];
  let savedLessonTotalBytes = 0;
  let savedLessonsLoaded = false;
  let savedLessonFilters = {
    className: "",
    dateFrom: "",
    dateTo: ""
  };
  let selectedPreviewSlideId = "";
  let activeImageDropZone = null;
  let activeImagePasteHandler = null;
  let pdfJsPromise = null;

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayIso() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function createInitialState() {
    return {
      schemaVersion: 2,
      title: "Untitled lesson",
      className: "",
      teachingDate: todayIso(),
      activeLessonId: "",
      activeLessonSavedAt: "",
      lessonUpdatedAt: new Date().toISOString(),
      classNames: DEFAULT_CLASSES,
      slides: [],
      retrievalItems: [],
      slideTemplates: defaultSlideTemplates(),
      updatedAt: new Date().toISOString()
    };
  }

  async function loadState() {
    const localState = await loadLocalState();
    if (localState) {
      refreshStateFromSupabaseAfterBoot(localState);
      return localState;
    }

    const cloudState = await loadStateFromSupabase();
    if (cloudState) {
      cloudLastSyncedAt = cloudState.updatedAt || "";
      persistLightweightStateSnapshot(cloudState);
      saveStateToIndexedDb(cloudState).catch((err) => console.warn("Could not cache synced state in IndexedDB", err));
      setStatus("Loaded synced lesson data from Supabase.", "success");
      return cloudState;
    }

    return createInitialState();
  }

  function refreshStateFromSupabaseAfterBoot(localState) {
    const localUpdatedAt = String(localState && localState.updatedAt ? localState.updatedAt : "");
    initialCloudRefreshInFlight = loadStateFromSupabase()
      .then((cloudState) => {
        if (!cloudState) return;

        cloudLastSyncedAt = cloudState.updatedAt || "";
        if (compareIsoDateTimes(cloudState.updatedAt, localUpdatedAt) < 0) return;

        persistLightweightStateSnapshot(cloudState);
        saveStateToIndexedDb(cloudState).catch((err) => console.warn("Could not cache synced state in IndexedDB", err));

        if (state && compareIsoDateTimes(state.updatedAt, localUpdatedAt) > 0) {
          mergeGlobalFieldsFromCloudState(state, cloudState);
          syncStateFields();
          syncDraftFields();
          renderAll();
          setStatus("Supabase has a newer retrieval bank. Local lesson changes were kept; use Update Database when ready.", "warn");
          return;
        }

        state = cloudState;
        syncStateFields();
        syncDraftFields();
        renderAll();
        setStatus("Refreshed lesson data from Supabase.", "success");
      })
      .finally(() => {
        initialCloudRefreshInFlight = null;
        if (state && state.updatedAt !== cloudLastSyncedAt) scheduleCloudPersist();
      });
  }

  function mergeGlobalFieldsFromCloudState(targetState, cloudState) {
    if (!targetState || !cloudState) return;
    targetState.classNames = Array.isArray(cloudState.classNames) ? cloudState.classNames : targetState.classNames;
    targetState.retrievalItems = Array.isArray(cloudState.retrievalItems) ? cloudState.retrievalItems : targetState.retrievalItems;
    targetState.slideTemplates = Array.isArray(cloudState.slideTemplates) ? cloudState.slideTemplates : targetState.slideTemplates;
  }

  async function loadCurrentUser() {
    const el = $("current-user-email");
    if (!el) return;

    try {
      const response = await fetch("/api/me", {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/login?next=/builder/index.html";
        return;
      }

      if (!response.ok) {
        throw new Error(`User lookup failed with status ${response.status}.`);
      }

      const data = await response.json();
      const email = String(data.email || "").trim();
      el.textContent = email || "Signed in";
      el.title = email || "";
    } catch (err) {
      console.warn("Could not load current user details", err);
      el.textContent = "User unavailable";
      el.title = "";
    }
  }

  async function loadLocalState() {
    const indexedState = await loadStateFromIndexedDb();
    if (indexedState) return normalizeImportedState(indexedState);

    const localState = loadStateFromLocalStorage();
    if (localState) {
      const normalized = normalizeImportedState(localState);
      saveStateToIndexedDb(normalized).catch((err) => console.warn("Could not migrate state to IndexedDB", err));
      return normalized;
    }

    return null;
  }

  async function loadStateFromSupabase() {
    const workspaceDocument = await loadStateDocumentFromSupabase(SYNC_WORKSPACE);
    if (workspaceDocument && isLegacyCombinedSyncDocument(workspaceDocument.state)) {
      const legacyState = normalizeImportedState(workspaceDocument.state);
      const relationalGlobal = await loadGlobalStateFromSupabase();
      if (relationalGlobal) {
        const mergedLegacyState = mergeSyncedStateDocuments(legacyState, relationalGlobal);
        updateCloudSyncMarkers(SYNC_WORKSPACE, workspaceDocument.updatedAt || mergedLegacyState.updatedAt);
        relationalGlobalLastSyncedAt = relationalGlobal.updatedAt || mergedLegacyState.updatedAt || "";
        return mergedLegacyState;
      }
      updateCloudSyncMarkers(SYNC_WORKSPACE, workspaceDocument.updatedAt || legacyState.updatedAt);
      updateCloudSyncMarkers(SYNC_GLOBAL, workspaceDocument.updatedAt || legacyState.updatedAt);
      return legacyState;
    }

    const relationalGlobal = await loadGlobalStateFromSupabase();
    const globalDocument = relationalGlobal
      ? { state: relationalGlobal, updatedAt: relationalGlobal.updatedAt || "", syncKind: "relational-global" }
      : await loadStateDocumentFromSupabase(SYNC_GLOBAL);
    if (!workspaceDocument && !globalDocument) return null;

    const mergedState = mergeSyncedStateDocuments(
      workspaceDocument ? workspaceDocument.state : null,
      globalDocument ? globalDocument.state : null
    );
    if (workspaceDocument) updateCloudSyncMarkers(SYNC_WORKSPACE, workspaceDocument.updatedAt || mergedState.updatedAt);
    if (relationalGlobal) {
      relationalGlobalLastSyncedAt = relationalGlobal.updatedAt || mergedState.updatedAt || "";
    } else if (globalDocument) {
      updateCloudSyncMarkers(SYNC_GLOBAL, globalDocument.updatedAt || mergedState.updatedAt);
    }
    return mergedState;
  }

  async function loadGlobalStateFromSupabase() {
    try {
      const response = await fetch(BUILDER_GLOBAL_BOOTSTRAP_URL, {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/login?next=/builder/index.html";
        return null;
      }

      if (!response.ok) {
        throw new Error(`Global data lookup failed with status ${response.status}.`);
      }

      const data = await response.json();
      if (!data || data.ok === false) {
        throw new Error(data && data.error ? data.error : "Global data lookup failed.");
      }

      return data.state || null;
    } catch (err) {
      console.warn("Could not load relational global data from Supabase", err);
      return null;
    }
  }

  async function loadStateDocumentFromSupabase(syncKind) {
    try {
      const response = await fetch(`${CLOUD_SYNC_LATEST_URL}?kind=${encodeURIComponent(syncKind)}`, {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/login?next=/builder/index.html";
        return null;
      }

      if (!response.ok) {
        throw new Error(`Sync lookup failed with status ${response.status}.`);
      }

      const sync = await response.json();
      if (!sync.exists || !sync.signedUrl) return null;

      const stateResponse = await fetch(sync.signedUrl, { cache: "no-store" });
      if (!stateResponse.ok) {
        throw new Error(`Synced state download failed with status ${stateResponse.status}.`);
      }

      const syncedState = await stateResponse.json();
      return {
        state: syncedState,
        updatedAt: sync.updatedAt || syncedState.updatedAt || "",
        syncKind: sync.kind || syncKind,
        legacy: !!sync.legacy
      };
    } catch (err) {
      console.warn(`Could not load ${syncKind} sync state from Supabase`, err);
      setStatus("Supabase sync is unavailable, so this device is using its local copy.", "warn");
      return null;
    }
  }

  function isLegacyCombinedSyncDocument(document) {
    if (!document || typeof document !== "object") return false;
    if (document.syncKind === SYNC_WORKSPACE || document.syncKind === SYNC_GLOBAL) return false;
    return Array.isArray(document.retrievalItems) || !!document.lessonBuilder;
  }

  function mergeSyncedStateDocuments(workspaceDocument, globalDocument) {
    const workspace = normalizeImportedState(workspaceDocument || {});
    const global = normalizeImportedState(globalDocument || {});
    const workspaceUpdatedAt = workspaceDocument && workspaceDocument.updatedAt ? workspaceDocument.updatedAt : workspace.updatedAt;
    const globalUpdatedAt = globalDocument && globalDocument.updatedAt ? globalDocument.updatedAt : global.updatedAt;
    const updatedAt = maxIsoDateTime([workspaceUpdatedAt, globalUpdatedAt]);
    return {
      ...createInitialState(),
      title: workspace.title,
      className: workspace.className,
      teachingDate: workspace.teachingDate,
      activeLessonId: workspace.activeLessonId,
      activeLessonSavedAt: workspace.activeLessonSavedAt,
      lessonUpdatedAt: workspace.lessonUpdatedAt,
      slides: workspace.slides || [],
      classNames: uniqueStrings([
        workspace.className,
        ...(global.classNames || []),
        ...(global.retrievalItems || []).map((item) => item.className),
        ...DEFAULT_CLASSES
      ]),
      retrievalItems: global.retrievalItems || [],
      slideTemplates: global.slideTemplates || defaultSlideTemplates(),
      updatedAt
    };
  }

  function maxIsoDateTime(values) {
    return values.reduce((latest, value) => {
      const text = String(value || "");
      return compareIsoDateTimes(text, latest) > 0 ? text : latest;
    }, "");
  }

  function loadStateFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn("Could not load saved lesson state from localStorage", err);
      return null;
    }
  }

  function loadStateFromIndexedDb() {
    return openBuilderDb()
      .then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STATE_STORE, "readonly");
        const request = tx.objectStore(DB_STATE_STORE).get(CURRENT_STATE_KEY);
        request.onsuccess = () => resolve(request.result && request.result.state ? request.result.state : null);
        request.onerror = () => reject(request.error || new Error("Could not read IndexedDB state."));
        tx.oncomplete = () => db.close();
        tx.onabort = () => {
          db.close();
          reject(tx.error || new Error("IndexedDB read was aborted."));
        };
      }))
      .catch((err) => {
        console.warn("Could not load saved lesson state from IndexedDB", err);
        return null;
      });
  }

  function openBuilderDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is not available in this browser."));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STATE_STORE)) {
          db.createObjectStore(DB_STATE_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open IndexedDB."));
    });
  }

  function normalizeImportedState(input) {
    const base = createInitialState();
    const src = input && input.lessonBuilder ? input.lessonBuilder : input || {};
    const retrievalItems = Array.isArray(src.retrievalItems)
      ? src.retrievalItems.map((item) => normalizeRetrievalItem(item, String(src.className || "")))
      : [];
    const sourceClassNames = Array.isArray(src.classNames) ? src.classNames : [];
    const slideTemplates = normalizeSlideTemplates(src.slideTemplates || src.templates);
    return {
      ...base,
      ...src,
      schemaVersion: 2,
      title: String(src.title || base.title),
      className: String(src.className || ""),
      teachingDate: isIsoDate(src.teachingDate) ? src.teachingDate : base.teachingDate,
      activeLessonId: String(src.activeLessonId || ""),
      activeLessonSavedAt: String(src.activeLessonSavedAt || ""),
      lessonUpdatedAt: String(src.lessonUpdatedAt || src.activeLessonSavedAt || src.updatedAt || base.lessonUpdatedAt),
      classNames: uniqueStrings([
        src.className,
        ...sourceClassNames,
        ...retrievalItems.map((item) => item.className),
        ...DEFAULT_CLASSES
      ]),
      slides: Array.isArray(src.slides) ? src.slides : [],
      retrievalItems,
      slideTemplates
    };
  }

  function persist(syncScope) {
    state.updatedAt = new Date().toISOString();
    persistLightweightState();
    scheduleIndexedDbPersist();
    const scope = syncScope || SYNC_ALL;
    if (scope === SYNC_GLOBAL) {
      scheduleRelationalGlobalPersist();
    } else {
      scheduleCloudPersist(scope);
      if (scope === SYNC_ALL) scheduleRelationalGlobalPersist();
    }
  }

  async function persistNow(syncScope) {
    state.updatedAt = new Date().toISOString();
    persistLightweightState();
    window.clearTimeout(persistTimer);
    await saveStateToIndexedDb(state);
    const scope = syncScope || SYNC_ALL;
    if (scope === SYNC_GLOBAL) {
      scheduleRelationalGlobalPersist();
    } else {
      scheduleCloudPersist(scope);
      if (scope === SYNC_ALL) scheduleRelationalGlobalPersist();
    }
  }

  function markLessonDirty() {
    state.lessonUpdatedAt = new Date().toISOString();
  }

  function persistLessonChange() {
    markLessonDirty();
    persist(SYNC_WORKSPACE);
    renderSavedLessons();
  }

  function persistGlobalChange() {
    state.updatedAt = new Date().toISOString();
    persistLightweightState();
    scheduleIndexedDbPersist();
  }

  function persistClassContextChange() {
    markLessonDirty();
    state.updatedAt = new Date().toISOString();
    persistLightweightState();
    scheduleIndexedDbPersist();
    scheduleCloudPersist(SYNC_WORKSPACE);
    queueClassSync();
    renderSavedLessons();
  }

  function setActiveLessonSaved(id, updatedAt) {
    const savedAt = String(updatedAt || new Date().toISOString());
    state.activeLessonId = String(id || "");
    state.activeLessonSavedAt = savedAt;
    state.lessonUpdatedAt = savedAt;
  }

  function clearActiveLessonTracking() {
    state.activeLessonId = "";
    state.activeLessonSavedAt = "";
    state.lessonUpdatedAt = new Date().toISOString();
  }

  function hasCurrentLessonContent() {
    if ((state.slides || []).length) return true;
    if (String(state.className || "").trim()) return true;
    const title = String(state.title || "").trim();
    return !!title && title !== "Untitled lesson";
  }

  function isLessonDirty() {
    if (!state.activeLessonId) return hasCurrentLessonContent();
    const savedTime = Date.parse(state.activeLessonSavedAt || "");
    const lessonTime = Date.parse(state.lessonUpdatedAt || "");
    if (Number.isNaN(savedTime)) return true;
    if (Number.isNaN(lessonTime)) return false;
    return lessonTime > savedTime + 500;
  }

  async function updateDatabaseNow() {
    try {
      setStatus("Updating Supabase database...", "warn");
      state.updatedAt = new Date().toISOString();
      persistLightweightState();
      window.clearTimeout(persistTimer);
      window.clearTimeout(cloudPersistTimer);
      window.clearTimeout(globalPersistTimer);
      window.clearTimeout(targetedGlobalPersistTimer);
      pendingCloudSyncKinds.clear();
      await saveStateToIndexedDb(state);
      cloudPersistInFlight = cloudPersistInFlight
        .catch(() => {})
        .then(() => Promise.all([
          saveStateToSupabase(state, SYNC_WORKSPACE),
          flushTargetedGlobalSync()
        ]));
      await cloudPersistInFlight;
      setStatus("Updated the Supabase database.", "success");
    } catch (err) {
      console.warn("Could not update Supabase database", err);
      setStatus("Could not update Supabase. Your browser copy is still saved locally.", "error");
    }
  }

  function persistLightweightState() {
    persistLightweightStateSnapshot(state);
  }

  function persistLightweightStateSnapshot(nextState) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweightStateForLocalStorage(nextState)));
    } catch (err) {
      console.warn("Could not persist lightweight localStorage copy", err);
    }
  }

  function scheduleIndexedDbPersist() {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      persistTimer = 0;
      persistInFlight = persistInFlight
        .catch(() => {})
        .then(() => saveStateToIndexedDb(state))
        .catch((err) => {
          console.warn("Could not autosave to IndexedDB", err);
          setStatus("Autosave skipped because browser database storage is unavailable. Export a backup to keep this version.", "warn");
        });
    }, 350);
  }

  function scheduleCloudPersist(syncScope) {
    syncKindsForScope(syncScope || SYNC_ALL).forEach((syncKind) => pendingCloudSyncKinds.add(syncKind));
    window.clearTimeout(cloudPersistTimer);
    cloudPersistTimer = window.setTimeout(() => {
      cloudPersistTimer = 0;
      const syncKinds = Array.from(pendingCloudSyncKinds);
      pendingCloudSyncKinds.clear();
      cloudPersistInFlight = cloudPersistInFlight
        .catch(() => {})
        .then(() => Promise.all(syncKinds.map((syncKind) => saveStateToSupabase(state, syncKind))))
        .catch((err) => {
          console.warn("Could not sync lesson state to Supabase", err);
          setStatus("Saved locally, but Supabase sync is currently unavailable.", "warn");
        });
    }, CLOUD_SYNC_DEBOUNCE_MS);
  }

  function scheduleRelationalGlobalPersist() {
    window.clearTimeout(globalPersistTimer);
    globalPersistTimer = window.setTimeout(() => {
      globalPersistTimer = 0;
      globalPersistInFlight = globalPersistInFlight
        .catch(() => {})
        .then(() => saveGlobalStateToSupabase(state))
        .catch((err) => {
          console.warn("Could not sync global builder data to Supabase", err);
          setStatus("Saved locally, but retrieval bank sync is currently unavailable.", "warn");
        });
    }, CLOUD_SYNC_DEBOUNCE_MS);
  }

  function scheduleTargetedGlobalPersist() {
    window.clearTimeout(targetedGlobalPersistTimer);
    targetedGlobalPersistTimer = window.setTimeout(() => {
      targetedGlobalPersistTimer = 0;
      targetedGlobalPersistInFlight = targetedGlobalPersistInFlight
        .catch(() => {})
        .then(() => flushTargetedGlobalSync())
        .then((summary) => maybeShowTargetedSyncSuccess(summary))
        .catch((err) => {
          console.warn("Could not sync targeted retrieval changes to Supabase", err);
          setStatus("Saved locally, but targeted retrieval sync is currently unavailable.", "warn");
        });
    }, CLOUD_SYNC_DEBOUNCE_MS);
  }

  function queueRetrievalItemSave(item) {
    if (!item || !String(item.lo || "").trim()) return;
    pendingRetrievalItemSaves.set(String(item.id || item.lo), item);
    if (item.id) pendingRetrievalItemDeletes.delete(String(item.id));
    scheduleTargetedGlobalPersist();
  }

  function queueRetrievalItemDelete(id) {
    const itemId = String(id || "");
    if (!itemId) return;
    pendingRetrievalItemSaves.delete(itemId);
    if (isUuid(itemId)) pendingRetrievalItemDeletes.add(itemId);
    scheduleTargetedGlobalPersist();
  }

  function queueRetrievalNextSync(items) {
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (item && isUuid(item.id)) pendingRetrievalNextItems.set(item.id, item);
    });
    if (pendingRetrievalNextItems.size) scheduleTargetedGlobalPersist();
  }

  function queueClassSync() {
    pendingClassSync = true;
    scheduleTargetedGlobalPersist();
  }

  function queueTemplateSync() {
    pendingTemplateSync = true;
    scheduleTargetedGlobalPersist();
  }

  async function flushTargetedGlobalSync() {
    const itemSaves = Array.from(pendingRetrievalItemSaves.values());
    const itemDeletes = Array.from(pendingRetrievalItemDeletes.values());
    const nextItems = Array.from(pendingRetrievalNextItems.values());
    const shouldSaveClasses = pendingClassSync;
    const shouldSaveTemplates = pendingTemplateSync;
    const changeCount = itemSaves.length + itemDeletes.length + nextItems.length + (shouldSaveClasses ? 1 : 0) + (shouldSaveTemplates ? 1 : 0);

    pendingRetrievalItemSaves.clear();
    pendingRetrievalItemDeletes.clear();
    pendingRetrievalNextItems.clear();
    pendingClassSync = false;
    pendingTemplateSync = false;

    if (shouldSaveClasses) await saveClassNamesToSupabase();
    if (shouldSaveTemplates) await saveTemplatesToSupabase();
    for (const item of itemSaves) {
      await saveRetrievalItemToSupabase(item);
    }
    for (const id of itemDeletes) {
      await deleteRetrievalItemFromSupabase(id);
    }
    if (nextItems.length) {
      await advanceRetrievalItemsInSupabase(nextItems);
    }

    return { changed: changeCount > 0 };
  }

  function maybeShowTargetedSyncSuccess(summary) {
    if (!summary || !summary.changed) return;
    const el = $("status");
    if (el && el.textContent === TARGETED_SYNC_QUEUED_STATUS) {
      setStatus(TARGETED_SYNCED_STATUS, "success");
    }
  }

  async function saveStateToSupabase(nextState, syncKind) {
    if (!nextState) return;
    if (syncKind === SYNC_ALL) {
      await Promise.all([
        ...syncKindsForScope(SYNC_ALL).map((kind) => saveStateToSupabase(nextState, kind)),
        saveGlobalStateToSupabase(nextState)
      ]);
      return;
    }

    const document = syncDocumentForKind(nextState, syncKind);
    if (!document || document.updatedAt === cloudLastSyncedAtByKind[syncKind]) return;

    const json = JSON.stringify(document);
    const blob = new Blob([json], { type: "application/json" });
    const uploadResponse = await fetch(CLOUD_SYNC_UPLOAD_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: syncKind,
        byteSize: blob.size,
        updatedAt: document.updatedAt
      })
    });

    if (uploadResponse.status === 401 || uploadResponse.status === 403) {
      window.location.href = "/login?next=/builder/index.html";
      return;
    }

    if (!uploadResponse.ok) {
      throw new Error(`Could not create Supabase upload URL (${uploadResponse.status}).`);
    }

    const upload = await uploadResponse.json();
    const formData = new FormData();
    formData.append("cacheControl", "3600");
    formData.append("", blob, "lesson-builder-state.json");

    const signedUploadResponse = await fetch(upload.signedUrl, {
      method: "PUT",
      headers: { "x-upsert": "true" },
      body: formData
    });

    if (!signedUploadResponse.ok) {
      throw new Error(`Could not upload lesson state to Supabase (${signedUploadResponse.status}).`);
    }

    const completeResponse = await fetch(CLOUD_SYNC_COMPLETE_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: syncKind,
        path: upload.path,
        byteSize: blob.size,
        updatedAt: document.updatedAt
      })
    });

    if (!completeResponse.ok) {
      throw new Error(`Could not complete Supabase sync (${completeResponse.status}).`);
    }

    updateCloudSyncMarkers(syncKind, document.updatedAt || "");
  }

  async function saveGlobalStateToSupabase(nextState) {
    if (!nextState) return;
    const pendingUploads = collectPendingRetrievalImageUploads(nextState);
    const firstSave = await postGlobalStateMetadata(nextState);
    applyRelationalGlobalIdMap(nextState, firstSave.idMap || []);

    if (pendingUploads.length) {
      for (const upload of pendingUploads) {
        const item = nextState.retrievalItems.find((entry) => entry.id === upload.itemId || entry.id === upload.clientId);
        if (!item || !isUuid(item.id)) continue;
        await uploadRetrievalImagePayload(item, upload.field, upload.index, upload.role);
      }
    }

    const finalSave = pendingUploads.length ? await postGlobalStateMetadata(nextState) : firstSave;
    if (finalSave.state) mergeRelationalGlobalState(nextState, finalSave.state);
    relationalGlobalLastSyncedAt = finalSave.state && finalSave.state.updatedAt ? finalSave.state.updatedAt : nextState.updatedAt || "";
  }

  async function postGlobalStateMetadata(nextState) {
    const response = await fetch(BUILDER_GLOBAL_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(globalStateForRelationalSync(nextState))
    });

    const data = await readApiJson(response, "Could not save retrieval bank data.");
    return data || {};
  }

  async function saveClassNamesToSupabase() {
    const response = await fetch(BUILDER_GLOBAL_CLASSES_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classNames: getClassNamesForSelect() })
    });
    await readApiJson(response, "Could not save classes.");
  }

  async function saveTemplatesToSupabase() {
    const response = await fetch(BUILDER_GLOBAL_TEMPLATES_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slideTemplates: normalizeSlideTemplates(state.slideTemplates) })
    });
    await readApiJson(response, "Could not save slide templates.");
  }

  async function saveRetrievalItemToSupabase(item) {
    if (!item || !String(item.lo || "").trim()) return null;
    const response = await fetch(BUILDER_GLOBAL_RETRIEVAL_ITEMS_URL, {
      method: isUuid(item.id) ? "PATCH" : "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(retrievalItemPayloadForTargetedSync(item))
    });
    const data = await readApiJson(response, "Could not save retrieval item.");
    if (data && data.item) mergeSavedRetrievalItem(item, data.item, data.idMap || []);
    return data && data.item ? data.item : null;
  }

  async function deleteRetrievalItemFromSupabase(id) {
    if (!isUuid(id)) return;
    const response = await fetch(BUILDER_GLOBAL_RETRIEVAL_ITEMS_URL, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    await readApiJson(response, "Could not delete retrieval item.");
  }

  async function advanceRetrievalItemsInSupabase(items) {
    const itemIds = uniqueStrings((Array.isArray(items) ? items : []).map((item) => item && item.id).filter(isUuid));
    if (!itemIds.length) return;
    const response = await fetch(BUILDER_GLOBAL_RETRIEVAL_NEXT_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds })
    });
    await readApiJson(response, "Could not advance retrieval image slots.");
  }

  async function logRetrievalItemsInSupabase(entries) {
    const response = await fetch(BUILDER_GLOBAL_RETRIEVAL_LOG_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries })
    });
    const data = await readApiJson(response, "Could not log retrieval items.");
    if (data && Array.isArray(data.results)) {
      data.results.forEach((result) => {
        const item = findRetrievalItemForLo(result.lo_text || result.lo || "", result.class_name || result.className || "");
        if (!item) return;
        item.id = result.id || item.id;
        item.trackingId = result.trackingId || result.itemId || result.id || item.trackingId || item.id;
        item.contentId = result.contentId || result.retrieval_lo_id || item.contentId || "";
        item.loCode = result.loCode || item.loCode || extractRetrievalLoCode(item.lo);
        item.seenCount = Math.max(0, Number(result.seen_count || result.seenCount) || 0);
        item.lastTaught = result.last_taught || result.lastTaught || item.lastTaught;
      });
    }
  }

  function retrievalItemPayloadForTargetedSync(item) {
    return {
      id: item.id,
      trackingId: item.trackingId || item.id || "",
      contentId: item.contentId || "",
      loCode: item.loCode || extractRetrievalLoCode(item.lo),
      codeSource: item.codeSource || "",
      className: item.className || getActiveClassName(),
      legacyLoId: item.legacyLoId || "",
      legacyJsonId: item.legacyJsonId || (!isUuid(item.id) ? item.id : ""),
      lo: item.lo || "",
      spacingFactor: item.spacingFactor,
      seenCount: item.seenCount,
      currentImageSlot: normalizeImageSlot(item.currentImageSlot || item.seenCount || 1),
      lastTaught: item.lastTaught,
      images: normalizeRetrievalImages(item.images).map(imageDescriptorForTargetedSync),
      answerImages: normalizeRetrievalAnswerImages(item).map(imageDescriptorForTargetedSync)
    };
  }

  function imageDescriptorForTargetedSync(image) {
    if (!image) return null;
    return {
      name: image.name || "retrieval-image",
      type: image.type || "image/png",
      size: Number(image.size) || 0,
      assetId: image.assetId || "",
      storagePath: image.storagePath || "",
      checksum: image.checksum || ""
    };
  }

  function mergeSavedRetrievalItem(localItem, savedItem, idMap) {
    const previousId = String(localItem.id || "");
    localItem.id = savedItem.id || localItem.id;
    localItem.trackingId = savedItem.trackingId || savedItem.id || localItem.trackingId || localItem.id;
    localItem.contentId = savedItem.contentId || savedItem.retrieval_lo_id || localItem.contentId || "";
    localItem.loCode = savedItem.loCode || savedItem.lo_code || localItem.loCode || extractRetrievalLoCode(savedItem.lo || localItem.lo);
    localItem.codeSource = savedItem.codeSource || savedItem.code_source || localItem.codeSource || "";
    localItem.className = savedItem.className || localItem.className;
    localItem.legacyLoId = savedItem.legacyLoId || localItem.legacyLoId || "";
    localItem.legacyJsonId = savedItem.legacyJsonId || localItem.legacyJsonId || "";
    localItem.lo = savedItem.lo || localItem.lo;
    localItem.spacingFactor = coerceSpacing(savedItem.spacingFactor || localItem.spacingFactor);
    localItem.seenCount = Math.max(0, Number(savedItem.seenCount || localItem.seenCount) || 0);
    localItem.currentImageSlot = normalizeImageSlot(savedItem.currentImageSlot || localItem.currentImageSlot);
    localItem.lastTaught = isIsoDate(savedItem.lastTaught) ? savedItem.lastTaught : localItem.lastTaught;
    localItem.images = mergeImageMetadata(normalizeRetrievalImages(localItem.images), normalizeRetrievalImages(savedItem.images));
    localItem.answerImages = mergeImageMetadata(normalizeRetrievalAnswerImages(localItem), normalizeRetrievalImages(savedItem.answerImages));
    if (previousId && previousId !== localItem.id) {
      updateRetrievalReferences(previousId, localItem.id);
    }
    applyRelationalGlobalIdMap(state, idMap);
    persistGlobalChange();
  }

  function mergeImageMetadata(localImages, savedImages) {
    return Array.from({ length: 8 }, (_, index) => {
      const local = localImages[index];
      const saved = savedImages[index];
      if (!saved) return local || null;
      return {
        ...saved,
        dataUrl: local && local.dataUrl && String(local.dataUrl).startsWith("data:") ? local.dataUrl : saved.dataUrl || ""
      };
    });
  }

  function updateRetrievalReferences(previousId, nextId) {
    state.slides.forEach((slide) => {
      if (!slide) return;
      if (Array.isArray(slide.slots)) {
        slide.slots.forEach((slot) => {
          if (slot && slot.retrievalItemId === previousId) slot.retrievalItemId = nextId;
        });
      }
    });
    draft.starter.forEach((slot) => {
      if (slot.retrievalItemId === previousId) slot.retrievalItemId = nextId;
    });
  }

  async function resolveRetrievalImagePairs(items, mode) {
    const sourceItems = Array.isArray(items) ? items : [];
    if (!sourceItems.length) return new Map();
    const requests = sourceItems.map((item) => ({
      itemId: item.id,
      contentId: item.contentId || "",
      lo: item.lo,
      className: item.className || getActiveClassName(),
      mode: mode || "current",
      seenCount: item.seenCount,
      currentImageSlot: item.currentImageSlot
    }));
    const data = await resolveRetrievalImages(requests);
    const results = new Map();
    (data.items || []).forEach((entry) => {
      results.set(String(entry.itemId || ""), entry);
    });
    return results;
  }

  async function resolveRetrievalEditorImages(item) {
    if (!item) return null;
    const data = await resolveRetrievalImages([{
      itemId: item.id,
      contentId: item.contentId || "",
      lo: item.lo,
      className: item.className || getActiveClassName(),
      mode: "all"
    }]);
    const [resolved] = data.items || [];
    if (!resolved) return null;
    item.id = resolved.itemId || item.id;
    item.trackingId = resolved.trackingId || resolved.itemId || item.trackingId || item.id;
    item.contentId = resolved.contentId || resolved.retrieval_lo_id || item.contentId || "";
    item.loCode = resolved.loCode || item.loCode || extractRetrievalLoCode(item.lo);
    item.images = normalizeRetrievalImages(resolved.images);
    item.answerImages = normalizeRetrievalImages(resolved.answerImages);
    item.currentImageSlot = normalizeImageSlot(resolved.currentImageSlot || item.currentImageSlot);
    persistGlobalChange();
    return item;
  }

  async function resolveRetrievalImages(requests) {
    const response = await fetch(BUILDER_GLOBAL_RETRIEVAL_IMAGES_RESOLVE_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests })
    });
    return readApiJson(response, "Could not resolve retrieval images.");
  }

  function globalStateForRelationalSync(nextState) {
    return {
      classNames: uniqueStrings([
        nextState.className,
        ...(Array.isArray(nextState.classNames) ? nextState.classNames : []),
        ...(nextState.retrievalItems || []).map((item) => item.className),
        ...DEFAULT_CLASSES
      ]),
      retrievalItems: (nextState.retrievalItems || []).map((item) => ({
        id: item.id,
        trackingId: item.trackingId || item.id || "",
        contentId: item.contentId || "",
        loCode: item.loCode || extractRetrievalLoCode(item.lo),
        codeSource: item.codeSource || "",
        legacyJsonId: item.legacyJsonId || (!isUuid(item.id) ? item.id : ""),
        className: item.className || "",
        legacyLoId: item.legacyLoId || "",
        lo: item.lo || "",
        spacingFactor: item.spacingFactor,
        seenCount: item.seenCount,
        currentImageSlot: item.currentImageSlot,
        lastTaught: item.lastTaught,
        images: normalizeRetrievalImages(item.images).map(imageDescriptorForRelationalSync),
        answerImages: normalizeRetrievalAnswerImages(item).map(imageDescriptorForRelationalSync),
        selected: !!item.selected
      })),
      slideTemplates: clonePlain(nextState.slideTemplates || defaultSlideTemplates())
    };
  }

  function imageDescriptorForRelationalSync(image) {
    if (!image) return null;
    return {
      name: image.name || "retrieval-image",
      type: image.type || "image/png",
      size: Number(image.size) || 0,
      assetId: image.assetId || "",
      storagePath: image.storagePath || ""
    };
  }

  function collectPendingRetrievalImageUploads(nextState) {
    const uploads = [];
    (nextState.retrievalItems || []).forEach((item) => {
      [
        { field: "images", role: "question", values: normalizeRetrievalImages(item.images) },
        { field: "answerImages", role: "answer", values: normalizeRetrievalAnswerImages(item) }
      ].forEach((group) => {
        group.values.forEach((image, index) => {
          if (!image || !String(image.dataUrl || "").startsWith("data:")) return;
          uploads.push({
            clientId: item.id,
            itemId: item.id,
            field: group.field,
            role: group.role,
            index
          });
        });
      });
    });
    return uploads;
  }

  async function syncRetrievalItemImages(item) {
    if (!item || !isUuid(item.id)) return;
    const groups = [
      { field: "images", role: "question", values: normalizeRetrievalImages(item.images) },
      { field: "answerImages", role: "answer", values: normalizeRetrievalAnswerImages(item) }
    ];
    for (const group of groups) {
      item[group.field] = normalizeRetrievalImages(item[group.field]);
      for (let index = 0; index < 8; index += 1) {
        const image = group.values[index];
        if (image && String(image.dataUrl || "").startsWith("data:")) {
          await uploadRetrievalImagePayload(item, group.field, index, group.role);
        } else if (!image) {
          await clearRetrievalImageSlot(item.id, group.role, index);
        }
      }
    }
  }

  async function clearRetrievalImageSlot(itemId, role, seenIndex) {
    const response = await fetch(BUILDER_GLOBAL_IMAGE_COMPLETE_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId,
        role,
        seenIndex,
        clear: true
      })
    });
    await readApiJson(response, "Could not clear retrieval image slot.");
  }

  function applyRelationalGlobalIdMap(nextState, idMap) {
    if (!Array.isArray(idMap) || !idMap.length) return;
    const map = new Map(idMap.map((entry) => [String(entry.clientId || ""), String(entry.id || "")]));
    (nextState.retrievalItems || []).forEach((item) => {
      const replacement = map.get(String(item.id || ""));
      if (!replacement) return;
      item.legacyJsonId = item.legacyJsonId || item.id;
      item.id = replacement;
      item.trackingId = replacement;
    });
  }

  async function uploadRetrievalImagePayload(item, field, index, role) {
    const images = field === "answerImages" ? normalizeRetrievalAnswerImages(item) : normalizeRetrievalImages(item.images);
    const image = images[index];
    if (!image || !String(image.dataUrl || "").startsWith("data:")) return;

    const blob = await dataUrlToBlob(image.dataUrl);
    const uploadResponse = await fetch(BUILDER_GLOBAL_IMAGE_UPLOAD_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: item.id,
        role,
        seenIndex: index,
        fileName: image.name || `retrieval-${role}-${index + 1}.png`,
        mimeType: image.type || blob.type || "image/png",
        byteSize: blob.size || image.size || 0,
        checksum: image.checksum || ""
      })
    });
    const uploadData = await readApiJson(uploadResponse, "Could not create retrieval image upload URL.");
    const upload = uploadData.upload;
    if (upload && upload.reusedImage) {
      item[field] = normalizeRetrievalImages(item[field]);
      item[field][index] = upload.reusedImage;
      return;
    }
    const formData = new FormData();
    formData.append("cacheControl", "3600");
    formData.append("", blob, image.name || `retrieval-${role}-${index + 1}.png`);

    const signedUploadResponse = await fetch(upload.signedUrl, {
      method: "PUT",
      headers: { "x-upsert": "false" },
      body: formData
    });

    if (!signedUploadResponse.ok) {
      throw new Error(`Could not upload retrieval image (${signedUploadResponse.status}).`);
    }

    const completeResponse = await fetch(BUILDER_GLOBAL_IMAGE_COMPLETE_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: item.id,
        role,
        seenIndex: index,
        assetId: upload.assetId,
        path: upload.path,
        fileName: image.name || `retrieval-${role}-${index + 1}.png`,
        mimeType: image.type || blob.type || "image/png",
        byteSize: blob.size || image.size || 0,
        checksum: image.checksum || ""
      })
    });
    const completeData = await readApiJson(completeResponse, "Could not save retrieval image metadata.");
    item[field] = normalizeRetrievalImages(item[field]);
    item[field][index] = completeData.image;
  }

  async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error("Could not prepare retrieval image for upload.");
    return response.blob();
  }

  function mergeRelationalGlobalState(nextState, globalState) {
    const selectedByKey = new Map((nextState.retrievalItems || []).map((item) => [retrievalItemSelectionKey(item), !!item.selected]));
    const normalized = normalizeImportedState(globalState || {});
    nextState.classNames = normalized.classNames;
    nextState.retrievalItems = normalized.retrievalItems.map((item) => ({
      ...item,
      selected: selectedByKey.get(retrievalItemSelectionKey(item)) || false
    }));
    nextState.slideTemplates = normalized.slideTemplates;
    syncStateFields();
    renderAll();
  }

  function retrievalItemSelectionKey(item) {
    return `${normalizeClassName(item && item.className)}::${normalizeLo(item && item.lo)}`;
  }

  function syncKindsForScope(syncScope) {
    if (syncScope === SYNC_WORKSPACE) return [SYNC_WORKSPACE];
    return [SYNC_WORKSPACE];
  }

  function updateCloudSyncMarkers(syncKind, updatedAt) {
    const timestamp = String(updatedAt || "");
    if (syncKind === SYNC_WORKSPACE || syncKind === SYNC_GLOBAL) {
      cloudLastSyncedAtByKind[syncKind] = timestamp;
    }
    cloudLastSyncedAt = maxIsoDateTime([
      cloudLastSyncedAtByKind[SYNC_WORKSPACE],
      cloudLastSyncedAtByKind[SYNC_GLOBAL],
      cloudLastSyncedAt
    ]);
  }

  function syncDocumentForKind(nextState, syncKind) {
    if (syncKind === SYNC_WORKSPACE) return workspaceStateForSync(nextState);
    return null;
  }

  function workspaceStateForSync(nextState) {
    return {
      schemaVersion: 3,
      syncKind: SYNC_WORKSPACE,
      title: String(nextState.title || "Untitled lesson"),
      className: String(nextState.className || ""),
      teachingDate: isIsoDate(nextState.teachingDate) ? nextState.teachingDate : todayIso(),
      activeLessonId: String(nextState.activeLessonId || ""),
      activeLessonSavedAt: String(nextState.activeLessonSavedAt || ""),
      lessonUpdatedAt: String(nextState.lessonUpdatedAt || nextState.updatedAt || new Date().toISOString()),
      slides: clonePlain(nextState.slides || []),
      updatedAt: nextState.updatedAt || new Date().toISOString()
    };
  }

  async function readApiJson(response, fallbackMessage) {
    if (response.status === 401 || response.status === 403) {
      window.location.href = "/login?next=/builder/index.html";
      return null;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || fallbackMessage || `Request failed with status ${response.status}.`);
    }
    return data;
  }

  function currentLessonDocument() {
    return {
      schemaVersion: 1,
      lessonKind: "saved-builder-lesson",
      title: String(state.title || "Untitled lesson").trim() || "Untitled lesson",
      className: String(state.className || "").trim(),
      teachingDate: isIsoDate(state.teachingDate) ? state.teachingDate : todayIso(),
      slides: clonePlain(state.slides || []),
      savedAt: new Date().toISOString()
    };
  }

  function normalizeLessonDocument(input, metadata) {
    const source = input && input.lessonBuilder ? input.lessonBuilder : input || {};
    const meta = metadata || {};
    const title = String(meta.title || source.title || "Untitled lesson").trim() || "Untitled lesson";
    const className = String(meta.className || source.className || "").trim();
    const teachingDate = isIsoDate(meta.teachingDate)
      ? meta.teachingDate
      : isIsoDate(source.teachingDate)
        ? source.teachingDate
        : todayIso();
    return {
      title,
      className,
      teachingDate,
      slides: Array.isArray(source.slides) ? clonePlain(source.slides) : []
    };
  }

  function lessonExportStateFromDocument(document, metadata) {
    const lesson = normalizeLessonDocument(document, metadata);
    return {
      schemaVersion: 2,
      title: lesson.title,
      className: lesson.className,
      teachingDate: lesson.teachingDate,
      classNames: uniqueStrings([lesson.className, ...DEFAULT_CLASSES]),
      slides: clonePlain(lesson.slides || []),
      retrievalItems: [],
      retrievalBankOmitted: true,
      slideTemplates: [],
      exportScope: "lesson-only",
      updatedAt: metadata && metadata.updatedAt ? metadata.updatedAt : new Date().toISOString()
    };
  }

  async function hydrateLiveStarterSlots(lessonState) {
    const globalState = await loadGlobalStateFromSupabase();
    if (!globalState || !Array.isArray(globalState.retrievalItems)) return lessonState;

    const retrievalItems = globalState.retrievalItems.map((item) => normalizeRetrievalItem(item, lessonState.className));
    const hydrated = {
      ...lessonState,
      slides: clonePlain(lessonState.slides || [])
    };

    const requests = [];
    const slotRefs = [];

    hydrated.slides.forEach((slide) => {
      if (!slide || slide.type !== "starter" || !Array.isArray(slide.slots)) return;
      slide.slots.forEach((slot, slotIndex) => {
        const item = findRetrievalItemForLiveSlot(retrievalItems, slot, lessonState.className);
        if (!item) return;
        requests.push({
          itemId: item.id,
          lo: item.lo,
          className: item.className || lessonState.className,
          mode: "current",
          currentImageSlot: slot.lockImageSlot ? slot.currentImageSlot || item.currentImageSlot : item.currentImageSlot
        });
        slotRefs.push({ slide, slotIndex, slot, item });
      });
    });

    if (!requests.length) return hydrated;

    try {
      const data = await resolveRetrievalImages(requests);
      const resolvedItems = Array.isArray(data && data.items) ? data.items : [];
      slotRefs.forEach((ref, index) => {
        const resolved = resolvedItems[index] || {};
        ref.slide.slots[ref.slotIndex] = {
          ...ref.slot,
          retrievalItemId: resolved.itemId || ref.item.id,
          currentImageSlot: resolved.currentImageSlot || ref.slot.currentImageSlot || ref.item.currentImageSlot || 1,
          image: resolved.questionImage || ref.slot.image || null,
          answerImage: resolved.answerImage || ref.slot.answerImage || null
        };
      });
    } catch (err) {
      console.warn("Could not hydrate live starter images", err);
    }

    return hydrated;
  }

  function findRetrievalItemForLiveSlot(items, slot, className) {
    const itemId = String(slot && slot.retrievalItemId || "");
    if (itemId) {
      const byId = items.find((item) => String(item.id || "") === itemId);
      if (byId) return byId;
    }

    const lo = normalizeLo(slot && slot.lo);
    const targetClass = normalizeClassName(className);
    if (!lo) return null;

    return items.find((item) => {
      if (normalizeLo(item.lo) !== lo) return false;
      return !targetClass || !item.className || normalizeClassName(item.className) === targetClass;
    }) || null;
  }

  async function loadSavedLessons(options) {
    const settings = options || {};
    try {
      const response = await fetch(SAVED_LESSONS_LIST_URL, {
        credentials: "same-origin",
        cache: "no-store"
      });
      const data = await readApiJson(response, "Could not load saved lessons.");
      if (!data) return;
      savedLessons = Array.isArray(data.lessons) ? data.lessons : [];
      savedLessonTotalBytes = Number(data.totalByteSize) || savedLessons.reduce((total, lesson) => total + (Number(lesson.byteSize) || 0), 0);
      savedLessonsLoaded = true;
      renderSavedLessons();
      if (settings.showStatus) setStatus("Saved lessons refreshed.", "success");
    } catch (err) {
      console.warn("Could not load saved lessons", err);
      savedLessonsLoaded = false;
      renderSavedLessons();
      if (settings.showStatus) {
        setStatus(err.message || "Could not load saved lessons.", "error");
      }
    }
  }

  async function saveCurrentLesson(options) {
    const settings = options || {};
    const copy = !!settings.copy;
    const doc = currentLessonDocument();
    if (!String(doc.className || "").trim()) {
      setStatus("Choose a class before saving this lesson.", "error");
      const classInput = $("class-name");
      if (classInput) classInput.focus();
      return;
    }
    const blob = new Blob([JSON.stringify(doc)], { type: "application/json" });

    try {
      setSavedLessonBusy(true);
      setStatus(copy ? "Saving lesson copy..." : "Saving lesson...", "warn");
      const uploadResponse = await fetch(SAVED_LESSON_UPLOAD_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: copy ? "" : state.activeLessonId,
          byteSize: blob.size
        })
      });
      const upload = await readApiJson(uploadResponse, "Could not create lesson upload URL.");
      if (!upload) return;

      const formData = new FormData();
      formData.append("cacheControl", "3600");
      formData.append("", blob, "lesson.json");
      const signedUploadResponse = await fetch(upload.signedUrl, {
        method: "PUT",
        headers: { "x-upsert": "true" },
        body: formData
      });
      if (!signedUploadResponse.ok) {
        throw new Error(`Could not upload saved lesson (${signedUploadResponse.status}).`);
      }

      const completeResponse = await fetch(SAVED_LESSON_COMPLETE_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: upload.id,
          path: upload.path,
          title: doc.title,
          className: doc.className,
          teachingDate: doc.teachingDate,
          byteSize: blob.size
        })
      });
      const completed = await readApiJson(completeResponse, "Could not complete saved lesson upload.");
      if (!completed || !completed.lesson) return;

      setActiveLessonSaved(completed.lesson.id, completed.lesson.updatedAt);
      persist(SYNC_WORKSPACE);
      await loadSavedLessons();
      setStatus(`Saved "${completed.lesson.title}" (${formatBytes(completed.lesson.byteSize)}).`, "success");
    } catch (err) {
      console.warn("Could not save lesson", err);
      setStatus(err.message || "Could not save this lesson.", "error");
    } finally {
      setSavedLessonBusy(false);
      renderSavedLessons();
    }
  }

  async function openSavedLesson(id) {
    const lesson = savedLessons.find((entry) => entry.id === id);
    const name = lesson ? lesson.title : "this saved lesson";
    if (isLessonDirty() && !window.confirm(`Open "${name}"? Unsaved changes to the current lesson will not be saved to the lesson library.`)) {
      return;
    }

    try {
      setSavedLessonBusy(true);
      setStatus(`Opening "${name}"...`, "warn");
      const openResponse = await fetch(SAVED_LESSON_OPEN_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const openData = await readApiJson(openResponse, "Could not open saved lesson.");
      if (!openData || !openData.signedUrl) return;

      const lessonResponse = await fetch(openData.signedUrl, { cache: "no-store" });
      if (!lessonResponse.ok) {
        throw new Error(`Could not download saved lesson (${lessonResponse.status}).`);
      }
      const lessonDocument = await lessonResponse.json();
      applyLessonDocument(await prepareSavedLessonOpenDocument(lessonDocument, openData.lesson), openData.lesson);
      setStatus(`Opened "${openData.lesson.title}".`, "success");
    } catch (err) {
      console.warn("Could not open saved lesson", err);
      setStatus(err.message || "Could not open saved lesson.", "error");
    } finally {
      setSavedLessonBusy(false);
      renderSavedLessons();
    }
  }

  async function prepareSavedLessonOpenDocument(document, metadata) {
    const lessonState = lessonExportStateFromDocument(document, metadata);
    return hydrateLiveStarterSlots(lessonState);
  }

  function applyLessonDocument(document, metadata) {
    const lesson = normalizeLessonDocument(document, metadata);
    state.title = lesson.title;
    state.className = lesson.className;
    state.teachingDate = lesson.teachingDate;
    state.slides = lesson.slides;
    selectedPreviewSlideId = "";
    state.classNames = uniqueStrings([state.className, ...(state.classNames || []), ...DEFAULT_CLASSES]);
    if (metadata && metadata.id) {
      setActiveLessonSaved(metadata.id, metadata.updatedAt);
    } else {
      clearActiveLessonTracking();
    }
    persistClassContextChange();
    syncStateFields();
    renderAll();
    renderSavedLessons();
  }

  async function renameSavedLesson(id) {
    const lesson = savedLessons.find((entry) => entry.id === id);
    if (!lesson) {
      setStatus("That saved lesson could not be found.", "error");
      return;
    }

    const nextTitle = window.prompt("Lesson title", lesson.title || "Untitled lesson");
    if (nextTitle === null) return;
    const title = String(nextTitle || "").trim();
    if (!title) {
      setStatus("Enter a lesson title before renaming.", "error");
      return;
    }

    try {
      setSavedLessonBusy(true);
      const response = await fetch(SAVED_LESSON_RENAME_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title,
          className: lesson.className,
          teachingDate: lesson.teachingDate
        })
      });
      const data = await readApiJson(response, "Could not rename saved lesson.");
      if (!data || !data.lesson) return;

      if (state.activeLessonId === id) {
        const hadDirtyChanges = isLessonDirty();
        state.title = data.lesson.title;
        if (hadDirtyChanges) {
          markLessonDirty();
        } else {
          setActiveLessonSaved(data.lesson.id, data.lesson.updatedAt);
        }
        persist(SYNC_WORKSPACE);
        syncStateFields();
        renderPreview();
      }
      await loadSavedLessons();
      setStatus(`Renamed lesson to "${data.lesson.title}".`, "success");
    } catch (err) {
      console.warn("Could not rename saved lesson", err);
      setStatus(err.message || "Could not rename saved lesson.", "error");
    } finally {
      setSavedLessonBusy(false);
      renderSavedLessons();
    }
  }

  async function changeSavedLessonClass(id) {
    const lesson = savedLessons.find((entry) => entry.id === id);
    if (!lesson) {
      setStatus("That saved lesson could not be found.", "error");
      return;
    }

    const nextClass = window.prompt("Class", lesson.className || state.className || "");
    if (nextClass === null) return;
    const className = String(nextClass || "").trim();
    if (!className) {
      setStatus("Enter a class before updating this saved lesson.", "error");
      return;
    }

    try {
      setSavedLessonBusy(true);
      const response = await fetch(SAVED_LESSON_RENAME_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title: lesson.title,
          className,
          teachingDate: lesson.teachingDate
        })
      });
      const data = await readApiJson(response, "Could not update saved lesson class.");
      if (!data || !data.lesson) return;

      state.classNames = uniqueStrings([data.lesson.className, ...(state.classNames || []), ...DEFAULT_CLASSES]);
      if (state.activeLessonId === id) {
        const hadDirtyChanges = isLessonDirty();
        state.className = data.lesson.className;
        if (hadDirtyChanges) {
          markLessonDirty();
        } else {
          setActiveLessonSaved(data.lesson.id, data.lesson.updatedAt);
        }
        persist(SYNC_WORKSPACE);
        syncStateFields();
        renderRetrievalRows();
        renderPreview();
      }
      persistGlobalChange();
      queueClassSync();
      await loadSavedLessons();
      setStatus(`Changed "${data.lesson.title}" to ${data.lesson.className}.`, "success");
    } catch (err) {
      console.warn("Could not update saved lesson class", err);
      setStatus(err.message || "Could not update saved lesson class.", "error");
    } finally {
      setSavedLessonBusy(false);
      renderSavedLessons();
    }
  }

  async function toggleSavedLessonTaught(id) {
    const lesson = savedLessons.find((entry) => entry.id === id);
    if (!lesson) {
      setStatus("That saved lesson could not be found.", "error");
      return;
    }

    const taught = !lesson.isTaught;
    try {
      setSavedLessonBusy(true);
      const response = await fetch(SAVED_LESSON_TAUGHT_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, taught: taught })
      });
      const data = await readApiJson(response, "Could not update taught status.");
      if (!data || !data.lesson) return;

      savedLessons = savedLessons.map((entry) => entry.id === id ? data.lesson : entry);
      if (state.activeLessonId === id && !isLessonDirty()) {
        setActiveLessonSaved(data.lesson.id, data.lesson.updatedAt);
      }
      setStatus(taught ? `Marked "${data.lesson.title}" as taught.` : `Unmarked "${data.lesson.title}" as taught.`, "success");
    } catch (err) {
      console.warn("Could not update saved lesson taught status", err);
      setStatus(err.message || "Could not update taught status.", "error");
    } finally {
      setSavedLessonBusy(false);
      renderSavedLessons();
    }
  }

  async function deleteSavedLesson(id) {
    const lesson = savedLessons.find((entry) => entry.id === id);
    const name = lesson ? lesson.title : "this saved lesson";
    if (!window.confirm(`Delete "${name}" from the saved lesson library?`)) return;

    try {
      setSavedLessonBusy(true);
      const response = await fetch(SAVED_LESSON_DELETE_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await readApiJson(response, "Could not delete saved lesson.");
      if (!data) return;

      if (state.activeLessonId === id) {
        clearActiveLessonTracking();
        persist(SYNC_WORKSPACE);
      }
      await loadSavedLessons();
      setStatus(`Deleted "${name}". The current slides remain open.`, "success");
    } catch (err) {
      console.warn("Could not delete saved lesson", err);
      setStatus(err.message || "Could not delete saved lesson.", "error");
    } finally {
      setSavedLessonBusy(false);
      renderSavedLessons();
    }
  }

  async function downloadSavedLesson(id) {
    const lesson = savedLessons.find((entry) => entry.id === id);
    const name = lesson ? lesson.title : "this saved lesson";

    try {
      setSavedLessonBusy(true);
      setStatus(`Preparing "${name}" download...`, "warn");
      const openResponse = await fetch(SAVED_LESSON_OPEN_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const openData = await readApiJson(openResponse, "Could not create saved lesson download.");
      if (!openData || !openData.signedUrl) return;

      const lessonResponse = await fetch(openData.signedUrl, { cache: "no-store" });
      if (!lessonResponse.ok) {
        throw new Error(`Could not download saved lesson (${lessonResponse.status}).`);
      }

      let exportState = lessonExportStateFromDocument(await lessonResponse.json(), openData.lesson || lesson);
      exportState = await prepareStandaloneLessonDownloadState(exportState);
      downloadBlob(
        buildStandaloneHtml(exportState),
        `${sanitizeFilePart(exportState.title)}.html`,
        "text/html"
      );
      setStatus(`Downloading presenter HTML for "${exportState.title}".`, "success");
    } catch (err) {
      console.warn("Could not download saved lesson", err);
      setStatus(err.message || "Could not download saved lesson.", "error");
    } finally {
      setSavedLessonBusy(false);
      renderSavedLessons();
    }
  }

  async function downloadSavedLessonPowerPointBundle(id) {
    const lesson = savedLessons.find((entry) => entry.id === id);
    const name = lesson ? lesson.title : "this saved lesson";

    try {
      setSavedLessonBusy(true);
      setStatus(`Preparing PowerPoint bundle for "${name}"...`, "warn");
      const openResponse = await fetch(SAVED_LESSON_OPEN_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const openData = await readApiJson(openResponse, "Could not create saved lesson PowerPoint bundle.");
      if (!openData || !openData.signedUrl) return;

      const lessonResponse = await fetch(openData.signedUrl, { cache: "no-store" });
      if (!lessonResponse.ok) {
        throw new Error(`Could not download saved lesson (${lessonResponse.status}).`);
      }

      let exportState = lessonExportStateFromDocument(await lessonResponse.json(), openData.lesson || lesson);
      exportState = await prepareStandaloneLessonDownloadState(exportState);
      const zipBlob = await buildPowerPointBundleZip(exportState);
      downloadBlob(
        zipBlob,
        `${sanitizeFilePart(exportState.title)}-powerpoint-bundle.zip`,
        "application/zip"
      );
      setStatus(`Downloading PowerPoint bundle for "${exportState.title}".`, "success");
    } catch (err) {
      console.warn("Could not download saved lesson PowerPoint bundle", err);
      setStatus(err.message || "Could not download saved lesson PowerPoint bundle.", "error");
    } finally {
      setSavedLessonBusy(false);
      renderSavedLessons();
    }
  }

  async function prepareStandaloneLessonDownloadState(lessonState) {
    const hydrated = await hydrateLiveStarterSlots(lessonState);
    return inlineRemoteLessonImages(hydrated);
  }

  async function inlineRemoteLessonImages(lessonState) {
    const cloned = clonePlain(lessonState);
    const cache = new Map();
    await inlineRemoteImagesInValue(cloned, cache);
    return cloned;
  }

  async function inlineRemoteImagesInValue(value, cache) {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        await inlineRemoteImagesInValue(value[index], cache);
      }
      return;
    }
    if (!value || typeof value !== "object") return;

    if (isImagePayload(value) && isRemoteImageUrl(value.dataUrl)) {
      const embedded = await dataUrlFromRemoteImage(value.dataUrl, cache);
      if (embedded) value.dataUrl = embedded;
    }

    for (const key of Object.keys(value)) {
      await inlineRemoteImagesInValue(value[key], cache);
    }
  }

  function isRemoteImageUrl(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }

  async function dataUrlFromRemoteImage(url, cache) {
    const key = String(url || "");
    if (cache.has(key)) return cache.get(key);
    try {
      const response = await fetch(key, { cache: "no-store" });
      if (!response.ok) throw new Error(`Image download failed with status ${response.status}.`);
      const dataUrl = await blobToDataUrl(await response.blob());
      cache.set(key, dataUrl);
      return dataUrl;
    } catch (err) {
      console.warn("Could not embed remote lesson image", err);
      cache.set(key, "");
      return "";
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read downloaded image."));
      reader.readAsDataURL(blob);
    });
  }

  async function presentSavedLesson(id) {
    const lesson = savedLessons.find((entry) => entry.id === id);
    const name = lesson ? lesson.title : "this saved lesson";
    const presenterWindow = window.open("", "_blank");
    if (!presenterWindow) {
      setStatus("The browser blocked the presenter window. Allow pop-ups for this site and try again.", "error");
      return;
    }

    try {
      setSavedLessonBusy(true);
      setStatus(`Opening live presenter for "${name}"...`, "warn");
      presenterWindow.document.open();
      presenterWindow.document.write("<!doctype html><title>Opening presenter...</title><p>Opening presenter...</p>");
      presenterWindow.document.close();

      const openResponse = await fetch(SAVED_LESSON_OPEN_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const openData = await readApiJson(openResponse, "Could not create live presenter.");
      if (!openData || !openData.signedUrl) return;

      const lessonResponse = await fetch(openData.signedUrl, { cache: "no-store" });
      if (!lessonResponse.ok) {
        throw new Error(`Could not download saved lesson (${lessonResponse.status}).`);
      }

      let exportState = lessonExportStateFromDocument(await lessonResponse.json(), openData.lesson || lesson);
      exportState = await hydrateLiveStarterSlots(exportState);
      const html = buildStandaloneHtml(exportState, {
        liveRetrieval: {
          enabled: true,
          endpoint: PRESENTER_RETRIEVAL_LOG_URL,
          nextEndpoint: PRESENTER_RETRIEVAL_NEXT_URL,
          lessonId: id,
          className: exportState.className,
          teachingDate: exportState.teachingDate
        },
        presenterConfig: {
          enabled: true,
          sourceLessonId: id,
          originalTitle: exportState.title,
          className: exportState.className,
          teachingDate: exportState.teachingDate,
          uploadEndpoint: SAVED_LESSON_UPLOAD_URL,
          completeEndpoint: SAVED_LESSON_COMPLETE_URL,
          taughtEndpoint: SAVED_LESSON_TAUGHT_URL,
          pdfSnapshotUploadEndpoint: PRESENTER_PDF_SNAPSHOT_UPLOAD_URL,
          pdfEndpoint: PRESENTER_PDF_URL
        }
      });

      presenterWindow.document.open();
      presenterWindow.document.write(html);
      presenterWindow.document.close();
      setStatus(`Opened live presenter for "${exportState.title}".`, "success");
    } catch (err) {
      console.warn("Could not open live presenter", err);
      if (!presenterWindow.closed) presenterWindow.close();
      setStatus(err.message || "Could not open live presenter.", "error");
    } finally {
      setSavedLessonBusy(false);
      renderSavedLessons();
    }
  }

  function newCurrentLesson() {
    if (isLessonDirty() && !window.confirm("Start a new blank lesson? Unsaved current lesson changes will not be saved to the lesson library.")) {
      return;
    }

    state.title = "Untitled lesson";
    state.className = "";
    state.teachingDate = todayIso();
    state.slides = [];
    selectedPreviewSlideId = "";
    clearActiveLessonTracking();
    resetLessonDrafts();
    persist(SYNC_WORKSPACE);
    syncStateFields();
    syncDraftFields();
    renderAll();
    renderSavedLessons();
    setStatus("Started a new blank lesson. Retrieval bank and templates were kept.", "success");
  }

  function handleSavedLessonsClick(event) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-saved-action]");
    if (!button) return;
    const id = button.getAttribute("data-id") || "";
    const action = button.getAttribute("data-saved-action");
    if (!id) return;

    if (action === "open") {
      openSavedLesson(id);
    } else if (action === "present") {
      presentSavedLesson(id);
    } else if (action === "download") {
      downloadSavedLesson(id);
    } else if (action === "ppt-bundle") {
      downloadSavedLessonPowerPointBundle(id);
    } else if (action === "toggle-taught") {
      toggleSavedLessonTaught(id);
    } else if (action === "change-class") {
      changeSavedLessonClass(id);
    } else if (action === "rename") {
      renameSavedLesson(id);
    } else if (action === "delete") {
      deleteSavedLesson(id);
    }
  }

  function saveStateToIndexedDb(nextState) {
    return openBuilderDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STATE_STORE, "readwrite");
      tx.objectStore(DB_STATE_STORE).put({
        id: CURRENT_STATE_KEY,
        state: indexedDbRecoveryState(nextState),
        updatedAt: new Date().toISOString()
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("Could not write IndexedDB state."));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error("IndexedDB write was aborted."));
      };
    }));
  }

  function indexedDbRecoveryState(source) {
    return stripSignedImageUrls(source);
  }

  function stripSignedImageUrls(value) {
    if (Array.isArray(value)) return value.map(stripSignedImageUrls);
    if (!value || typeof value !== "object") return value;
    const output = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (key === "dataUrl" && isRemoteImageUrl(entry)) {
        output[key] = "";
      } else {
        output[key] = stripSignedImageUrls(entry);
      }
    });
    return output;
  }

  function stripHeavyData(value) {
    if (Array.isArray(value)) return value.map(stripHeavyData);
    if (!value || typeof value !== "object") return value;
    const output = {};
    Object.entries(value).forEach(([key, entry]) => {
      output[key] = key === "dataUrl" ? "" : stripHeavyData(entry);
    });
    return output;
  }

  function lightweightStateForLocalStorage(source) {
    return {
      ...source,
      slides: stripHeavyData(source.slides || []),
      retrievalItems: (source.retrievalItems || []).map((item) => ({
        id: item.id,
        className: item.className,
        legacyLoId: item.legacyLoId,
        legacyJsonId: item.legacyJsonId,
        lo: item.lo,
        spacingFactor: item.spacingFactor,
        seenCount: item.seenCount,
        currentImageSlot: normalizeImageSlot(item.currentImageSlot || item.seenCount || 1),
        lastTaught: item.lastTaught,
        images: emptyRetrievalImages(),
        answerImages: emptyRetrievalImages(),
        selected: item.selected
      })),
      slideTemplates: source.slideTemplates || defaultSlideTemplates()
    };
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function uniqueStrings(values) {
    const seen = new Set();
    const result = [];
    values.forEach((value) => {
      const text = String(value || "").trim();
      const key = text.toLowerCase();
      if (text && !seen.has(key)) {
        seen.add(key);
        result.push(text);
      }
    });
    return result;
  }

  function emptyRetrievalImages() {
    return Array.from({ length: 8 }, () => null);
  }

  function isImagePayload(value) {
    return !!(value && typeof value === "object" && value.dataUrl);
  }

  function normalizeRetrievalImages(images) {
    const output = emptyRetrievalImages();
    if (!Array.isArray(images)) return output;
    images.slice(0, 8).forEach((image, index) => {
      const source = image && typeof image === "object" && "question" in image ? image.question : image;
      output[index] = isImagePayload(source) ? source : null;
    });
    return output;
  }

  function normalizeRetrievalAnswerImages(item) {
    const source = item || {};
    if (Array.isArray(source.answerImages)) return normalizeRetrievalImages(source.answerImages);
    if (Array.isArray(source.answers)) return normalizeRetrievalImages(source.answers);
    if (Array.isArray(source.images)) {
      const output = emptyRetrievalImages();
      source.images.slice(0, 8).forEach((image, index) => {
        const answer = image && typeof image === "object" && "answer" in image ? image.answer : null;
        output[index] = isImagePayload(answer) ? answer : null;
      });
      return output;
    }
    return emptyRetrievalImages();
  }

  function defaultSlideTemplates() {
    return DEFAULT_SLIDE_TEMPLATES.map((template) => ({
      id: template.id,
      title: template.title,
      bullets: [...template.bullets]
    }));
  }

  function normalizeSlideTemplates(input) {
    const templates = Array.isArray(input)
      ? input.map(normalizeSlideTemplate).filter(Boolean)
      : [];
    return templates.length ? uniqueTemplatesById(templates) : defaultSlideTemplates();
  }

  function normalizeSlideTemplate(template) {
    if (!template || typeof template !== "object") return null;
    const title = String(template.title || "").trim();
    const bullets = Array.isArray(template.bullets)
      ? template.bullets.map((bullet) => String(bullet || "").trim()).filter(Boolean)
      : String(template.body || template.text || "")
          .split(/\r?\n/)
          .map((bullet) => bullet.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean);
    if (!title && !bullets.length) return null;
    return {
      id: String(template.id || uid("template")),
      title: title || "Untitled template",
      bullets
    };
  }

  function uniqueTemplatesById(templates) {
    const seen = new Set();
    const result = [];
    templates.forEach((template) => {
      const normalized = normalizeSlideTemplate(template);
      if (!normalized || seen.has(normalized.id)) return;
      seen.add(normalized.id);
      result.push(normalized);
    });
    return result;
  }

  function normalizeRetrievalItem(item, defaultClassName) {
    const source = item || {};
    const loText = String(source.lo || source.lo_text || "");
    const loCode = String(source.loCode || source.lo_code || extractRetrievalLoCode(loText) || "").trim().toLowerCase();
    return {
      id: source.id || uid("lo"),
      trackingId: String(source.trackingId || source.tracking_id || source.id || "").trim(),
      contentId: String(source.contentId || source.content_id || source.retrieval_lo_id || "").trim(),
      loCode,
      codeSource: String(source.codeSource || source.code_source || (loCode ? "prefix" : "")).trim(),
      className: String(source.className || source.class || defaultClassName || "").trim(),
      legacyLoId: String(source.legacyLoId || source.loId || "").trim(),
      legacyJsonId: String(source.legacyJsonId || "").trim(),
      lo: loText,
      spacingFactor: coerceSpacing(source.spacingFactor || 1.3),
      seenCount: Math.max(0, Number(source.seenCount) || 0),
      currentImageSlot: normalizeImageSlot(source.currentImageSlot || source.current_image_slot || source.seenCount || 1),
      lastTaught: isIsoDate(source.lastTaught) ? source.lastTaught : todayIso(),
      images: normalizeRetrievalImages(source.images),
      answerImages: normalizeRetrievalAnswerImages(source),
      selected: !!source.selected
    };
  }

  function countRetrievalImages(images) {
    return normalizeRetrievalImages(images).filter(Boolean).length;
  }

  function countRetrievalAnswerImages(item) {
    return normalizeRetrievalAnswerImages(item).filter(Boolean).length;
  }

  function normalizeLo(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function extractRetrievalLoCode(lo) {
    const match = String(lo || "").trim().match(/^([0-9]{2,3}[a-z])(?=\s*:|\b)/i);
    return match ? match[1].toLowerCase() : "";
  }

  function getLoFamilyKey(lo) {
    const match = String(lo || "").trim().match(/^(\d{2,3})[a-z](?=\s*:|\b)/i);
    return match ? match[1] : "";
  }

  function normalizeClassName(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function getActiveClassName() {
    return String(state.className || "").trim();
  }

  function classNamesMatch(a, b) {
    return normalizeClassName(a) === normalizeClassName(b);
  }

  function itemMatchesActiveClass(item) {
    const activeClass = getActiveClassName();
    if (!activeClass) return true;
    return !item.className || classNamesMatch(item.className, activeClass);
  }

  function getVisibleRetrievalItems() {
    return state.retrievalItems.filter(itemMatchesActiveClass);
  }

  function findRetrievalItemForLo(lo, className) {
    const targetClass = String(className || getActiveClassName()).trim();
    const targetCode = extractRetrievalLoCode(lo);
    return state.retrievalItems.find((item) => {
      const itemCode = item.loCode || extractRetrievalLoCode(item.lo);
      const codeMatches = targetCode && itemCode ? itemCode === targetCode : false;
      if (!codeMatches && normalizeLo(item.lo) !== normalizeLo(lo)) return false;
      if (!targetClass) return !item.className;
      return !item.className || classNamesMatch(item.className, targetClass);
    });
  }

  function findSharedRetrievalBankStatus(lo) {
    const loCode = extractRetrievalLoCode(lo);
    if (!loCode) {
      return { state: "no-code", loCode: "", exists: false, trackedForClass: false, contentId: "" };
    }
    const matching = state.retrievalItems.filter((item) => (item.loCode || extractRetrievalLoCode(item.lo)) === loCode);
    const trackedForClass = matching.some((item) => itemMatchesActiveClass(item) && classNamesMatch(item.className, getActiveClassName()));
    const first = matching[0] || null;
    return {
      state: matching.length ? trackedForClass ? "tracked" : "untracked-class" : "new",
      loCode,
      exists: matching.length > 0,
      trackedForClass,
      contentId: first ? String(first.contentId || first.retrieval_lo_id || "") : "",
      item: first
    };
  }

  function updateExampleRetrievalBankStatus() {
    const element = $("example-lo-bank-status");
    if (!element) return;
    const status = findSharedRetrievalBankStatus(draft.example.lo);
    element.classList.remove("good", "warn");
    if (status.state === "tracked") {
      element.textContent = "Already in shared retrieval bank; tracked for this class.";
      element.classList.add("good");
    } else if (status.state === "untracked-class") {
      element.textContent = "Already in shared retrieval bank; not yet tracked for this class.";
      element.classList.add("warn");
    } else if (status.state === "new") {
      element.textContent = "New LO code; adding will create a shared bank entry.";
    } else {
      element.textContent = "No LO code detected.";
    }
  }

  function getClassNamesForSelect() {
    return uniqueStrings([
      state.className,
      ...(Array.isArray(state.classNames) ? state.classNames : []),
      ...(state.retrievalItems || []).map((item) => item.className),
      ...DEFAULT_CLASSES
    ]);
  }

  function addClassName() {
    const entered = window.prompt("Class name");
    if (entered === null) return;

    const nextClassName = String(entered || "").trim();
    if (!nextClassName) {
      setStatus("Enter a class name before adding it.", "error");
      return;
    }

    const existing = getClassNamesForSelect().find((className) => classNamesMatch(className, nextClassName));
    const selectedClassName = existing || nextClassName;
    state.className = selectedClassName;
    state.classNames = uniqueStrings([selectedClassName, ...(Array.isArray(state.classNames) ? state.classNames : [])]);
    renderClassOptions();
    syncStateFields();
    persistClassContextChange();
    queueClassSync();
    renderRetrievalRows();
    setStatus(existing ? `Selected ${selectedClassName}.` : `Added ${selectedClassName}.`, "success");
  }

  function isIsoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  function compareIsoDateTimes(left, right) {
    const leftTime = Date.parse(left || "");
    const rightTime = Date.parse(right || "");
    const safeLeft = Number.isNaN(leftTime) ? 0 : leftTime;
    const safeRight = Number.isNaN(rightTime) ? 0 : rightTime;
    return safeLeft === safeRight ? 0 : safeLeft > safeRight ? 1 : -1;
  }

  function dateFromIso(value) {
    if (!isIsoDate(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addDays(isoDate, days) {
    const date = dateFromIso(isoDate) || dateFromIso(todayIso());
    date.setDate(date.getDate() + Number(days || 0));
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatSavedLessonDate(value) {
    if (isIsoDate(value)) return value;
    return "No date";
  }

  function formatSavedLessonUpdatedAt(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function sanitizeFilePart(value) {
    return String(value || "lesson")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "lesson";
  }

  function setStatus(message, type) {
    const el = $("status");
    el.textContent = message || "";
    el.className = `status${type ? ` ${type}` : ""}`;
  }

  function setSavedLessonBusy(isBusy) {
    [
      "saved-lessons-refresh",
      "saved-lesson-new",
      "saved-lesson-save",
      "saved-lesson-save-copy",
      "quick-lesson-new",
      "quick-lesson-save",
      "quick-lesson-save-copy"
    ].forEach((id) => {
      const button = $(id);
      if (button) button.disabled = !!isBusy;
    });
  }

  function getSavedLessonFilterClassNames() {
    return uniqueStrings(savedLessons.map((lesson) => lesson.className));
  }

  function syncSavedLessonFilterControls() {
    const classSelect = $("saved-lesson-filter-class");
    const dateFromInput = $("saved-lesson-filter-from");
    const dateToInput = $("saved-lesson-filter-to");
    if (!classSelect || !dateFromInput || !dateToInput) return;

    const classNames = getSavedLessonFilterClassNames();
    const selectedClass = String(savedLessonFilters.className || "").trim();
    classSelect.innerHTML = [
      `<option value="">All classes</option>`,
      ...classNames.map((className) => `<option value="${escapeAttr(className)}">${escapeHtml(className)}</option>`)
    ].join("");
    classSelect.value = classNames.some((className) => classNamesMatch(className, selectedClass)) ? selectedClass : "";
    if (selectedClass && !classSelect.value) savedLessonFilters.className = "";
    dateFromInput.value = isIsoDate(savedLessonFilters.dateFrom) ? savedLessonFilters.dateFrom : "";
    dateToInput.value = isIsoDate(savedLessonFilters.dateTo) ? savedLessonFilters.dateTo : "";
  }

  function savedLessonMatchesFilters(lesson) {
    const selectedClass = String(savedLessonFilters.className || "").trim();
    if (selectedClass && !classNamesMatch(lesson.className, selectedClass)) return false;

    const teachingDate = String(lesson.teachingDate || "");
    const hasDateFilter = isIsoDate(savedLessonFilters.dateFrom) || isIsoDate(savedLessonFilters.dateTo);
    if (hasDateFilter && !isIsoDate(teachingDate)) return false;
    if (isIsoDate(savedLessonFilters.dateFrom) && teachingDate < savedLessonFilters.dateFrom) return false;
    if (isIsoDate(savedLessonFilters.dateTo) && teachingDate > savedLessonFilters.dateTo) return false;
    return true;
  }

  function getFilteredSavedLessons() {
    return savedLessons.filter(savedLessonMatchesFilters);
  }

  function getSortedSavedLessons(lessons) {
    return (Array.isArray(lessons) ? lessons.slice() : []).sort((left, right) => {
      const leftTaught = !!left.isTaught;
      const rightTaught = !!right.isTaught;
      if (leftTaught !== rightTaught) return leftTaught ? 1 : -1;

      const leftDate = isIsoDate(left.teachingDate) ? left.teachingDate : "9999-12-31";
      const rightDate = isIsoDate(right.teachingDate) ? right.teachingDate : "9999-12-31";
      const dateCompare = leftDate.localeCompare(rightDate);
      if (dateCompare) return dateCompare;

      const leftTitle = String(left.title || "").trim().toLowerCase();
      const rightTitle = String(right.title || "").trim().toLowerCase();
      return leftTitle.localeCompare(rightTitle);
    });
  }

  function hasSavedLessonFilters() {
    return !!(
      String(savedLessonFilters.className || "").trim() ||
      isIsoDate(savedLessonFilters.dateFrom) ||
      isIsoDate(savedLessonFilters.dateTo)
    );
  }

  function renderSavedLessons() {
    const activeEl = $("active-lesson-name");
    const storageEl = $("saved-lesson-storage");
    const listEl = $("saved-lesson-list");
    if (!activeEl || !storageEl || !listEl) return;

    const dirty = isLessonDirty();
    const activeTitle = String(state.title || "Untitled lesson").trim() || "Untitled lesson";
    activeEl.textContent = state.activeLessonId
      ? `${activeTitle}${dirty ? " *" : ""}`
      : dirty
        ? "Unsaved lesson *"
        : "Unsaved lesson";
    activeEl.title = dirty ? "Current lesson has unsaved library changes." : "Current lesson is saved.";

    if (!savedLessonsLoaded) {
      syncSavedLessonFilterControls();
      storageEl.textContent = "Saved lessons not loaded.";
      listEl.innerHTML = `<div class="saved-lesson-empty">Refresh to load saved lessons.</div>`;
      return;
    }

    syncSavedLessonFilterControls();
    const filteredLessons = getSortedSavedLessons(getFilteredSavedLessons());
    storageEl.textContent = hasSavedLessonFilters()
      ? `${filteredLessons.length} shown of ${savedLessons.length} saved - ${formatBytes(savedLessonTotalBytes)} stored`
      : `${savedLessons.length} saved - ${formatBytes(savedLessonTotalBytes)} stored`;
    if (!filteredLessons.length) {
      listEl.innerHTML = `<div class="saved-lesson-empty">${savedLessons.length ? "No saved lessons match these filters." : "No saved lessons yet."}</div>`;
      return;
    }

    listEl.innerHTML = filteredLessons
      .map((lesson) => {
        const active = lesson.id === state.activeLessonId;
        const taught = !!lesson.isTaught;
        const className = lesson.className ? lesson.className : "No class";
        const taughtText = taught ? "Taught" : "Not taught";
        return `
          <article class="saved-lesson-item${active ? " is-active" : ""}${taught ? " is-taught" : ""}">
            <div class="saved-lesson-main">
              <strong>${escapeHtml(lesson.title || "Untitled lesson")}</strong>
              <span>${escapeHtml(className)} - ${escapeHtml(formatSavedLessonDate(lesson.teachingDate))}</span>
              <span>${escapeHtml(taughtText)} - ${escapeHtml(formatBytes(lesson.byteSize))} - updated ${escapeHtml(formatSavedLessonUpdatedAt(lesson.updatedAt))}</span>
            </div>
            <div class="saved-lesson-row-actions">
              <button class="mini-button" type="button" data-saved-action="open" data-id="${escapeAttr(lesson.id)}">Open</button>
              <button class="mini-button" type="button" data-saved-action="present" data-id="${escapeAttr(lesson.id)}">Present</button>
              <button class="mini-button" type="button" data-saved-action="download" data-id="${escapeAttr(lesson.id)}">Download</button>
              <button class="mini-button" type="button" data-saved-action="ppt-bundle" data-id="${escapeAttr(lesson.id)}">PPT bundle</button>
              <button class="mini-button" type="button" data-saved-action="toggle-taught" data-id="${escapeAttr(lesson.id)}">${taught ? "Unmark taught" : "Mark taught"}</button>
              <button class="mini-button" type="button" data-saved-action="change-class" data-id="${escapeAttr(lesson.id)}">Class</button>
              <button class="mini-button" type="button" data-saved-action="rename" data-id="${escapeAttr(lesson.id)}">Rename</button>
              <button class="mini-button danger-mini" type="button" data-saved-action="delete" data-id="${escapeAttr(lesson.id)}">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function wireInputs() {
    $("lesson-title").addEventListener("input", (event) => {
      state.title = event.target.value;
      persistLessonChange();
      renderPreview();
    });

    $("class-name").addEventListener("change", (event) => {
      state.className = event.target.value;
      state.classNames = uniqueStrings([state.className, ...state.classNames]);
      persistClassContextChange();
      renderClassOptions();
      renderRetrievalRows();
      updateExampleRetrievalBankStatus();
    });

    $("add-class").addEventListener("click", addClassName);

    $("teaching-date").addEventListener("input", (event) => {
      state.teachingDate = event.target.value || todayIso();
      persistLessonChange();
      renderRetrievalRows();
    });

    $("saved-lessons-refresh").addEventListener("click", () => loadSavedLessons({ showStatus: true }));
    $("saved-lesson-new").addEventListener("click", newCurrentLesson);
    $("saved-lesson-save").addEventListener("click", () => saveCurrentLesson({ copy: false }));
    $("saved-lesson-save-copy").addEventListener("click", () => saveCurrentLesson({ copy: true }));
    $("quick-lesson-new").addEventListener("click", newCurrentLesson);
    $("quick-lesson-save").addEventListener("click", () => saveCurrentLesson({ copy: false }));
    $("quick-lesson-save-copy").addEventListener("click", () => saveCurrentLesson({ copy: true }));
    $("saved-lesson-list").addEventListener("click", handleSavedLessonsClick);
    $("saved-lesson-filter-class").addEventListener("change", (event) => {
      savedLessonFilters.className = event.target.value;
      renderSavedLessons();
    });
    $("saved-lesson-filter-from").addEventListener("input", (event) => {
      savedLessonFilters.dateFrom = event.target.value;
      renderSavedLessons();
    });
    $("saved-lesson-filter-to").addEventListener("input", (event) => {
      savedLessonFilters.dateTo = event.target.value;
      renderSavedLessons();
    });
    $("saved-lesson-filter-clear").addEventListener("click", () => {
      savedLessonFilters = { className: "", dateFrom: "", dateTo: "" };
      renderSavedLessons();
      setStatus("Cleared saved lesson filters.", "success");
    });

    document.querySelectorAll(".nav-button").forEach((button) => {
      button.addEventListener("click", () => showPanel(button.dataset.panel));
    });

    $("starter-suggest").addEventListener("click", suggestStarterLos);
    $("starter-add-slide").addEventListener("click", addStarterSlide);
    $("starter-log").addEventListener("click", () => logLos(getStarterLos(), "Logged starter retrieval."));
    $("retrieval-add-row").addEventListener("click", () => addRetrievalItem());
    $("retrieval-select-all").addEventListener("click", () => setVisibleRetrievalSelection("all"));
    $("retrieval-select-due").addEventListener("click", () => setVisibleRetrievalSelection("due"));
    $("retrieval-deselect-all").addEventListener("click", () => setVisibleRetrievalSelection("none"));
    $("retrieval-add-slide").addEventListener("click", addRetrievalSlide);
    $("retrieval-generate-revision").addEventListener("click", generateRevisionLesson);
    $("retrieval-log").addEventListener("click", () => logLos(getSelectedRetrievalLos(), "Logged selected retrieval."));
    $("retrieval-update-database").addEventListener("click", updateDatabaseNow);
    $("retrieval-editor-close").addEventListener("click", closeRetrievalEditor);
    $("retrieval-editor-cancel").addEventListener("click", closeRetrievalEditor);
    $("retrieval-editor-save").addEventListener("click", saveRetrievalEditor);
    $("retrieval-editor").addEventListener("click", (event) => {
      if (event.target === $("retrieval-editor")) closeRetrievalEditor();
    });
    $("example-add-slide").addEventListener("click", addExampleSlide);
    $("example-add-bank").addEventListener("click", addExampleToRetrievalBank);
    $("worksheet-add-slide").addEventListener("click", addWorksheetSlide);
    $("worksheet-clear-files").addEventListener("click", clearWorksheetFiles);
    $("pdf-file-drop").addEventListener("click", () => $("pdf-file-input").click());
    $("pdf-file-drop").addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        $("pdf-file-input").click();
      }
    });
    $("pdf-file-drop").addEventListener("dragover", (event) => {
      event.preventDefault();
      $("pdf-file-drop").classList.add("drag-over");
    });
    $("pdf-file-drop").addEventListener("dragleave", () => $("pdf-file-drop").classList.remove("drag-over"));
    $("pdf-file-drop").addEventListener("drop", (event) => {
      event.preventDefault();
      $("pdf-file-drop").classList.remove("drag-over");
      handlePdfFile(event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null);
    });
    $("pdf-file-input").addEventListener("change", (event) => {
      handlePdfFile(event.target.files && event.target.files[0]);
      event.target.value = "";
    });
    $("pdf-render-width").addEventListener("change", (event) => {
      draft.pdf.renderWidth = Number(event.target.value) || 1800;
    });
    $("pdf-add-slides").addEventListener("click", addPdfSlides);
    $("pdf-clear").addEventListener("click", clearPdfDraft);
    $("cfu-add-slide").addEventListener("click", addCfuSlide);
    $("drawing-undo").addEventListener("click", undoDrawing);
    $("drawing-clear").addEventListener("click", clearDrawing);
    $("drawing-add-slide").addEventListener("click", addDrawingSlide);
    $("drawing-resolution").addEventListener("change", updateDrawingResolution);
    $("drawing-pen").addEventListener("click", () => setDrawingMode("pen"));
    $("drawing-eraser").addEventListener("click", () => setDrawingMode("eraser"));
    document.querySelectorAll("[data-drawing-color]").forEach((input) => {
      input.addEventListener("input", () => setDrawingColor(input.value, input));
      input.addEventListener("click", () => setDrawingColor(input.value, input));
    });
    $("template-select").addEventListener("change", () => {
      templateEditor.activeId = $("template-select").value;
      syncTemplateFields();
    });
    $("template-add").addEventListener("click", addSlideTemplate);
    $("template-save").addEventListener("click", saveSlideTemplate);
    $("template-delete").addEventListener("click", deleteSlideTemplate);
    $("template-insert").addEventListener("click", insertTemplateSlide);
    $("placeholder-add-slide").addEventListener("click", addPlaceholderSlide);
    $("math-add-slide").addEventListener("click", addMathSlides);
    $("export-json").addEventListener("click", exportJson);
    $("export-backup").addEventListener("click", exportFullBackup);
    $("export-html").addEventListener("click", exportHtml);
    $("export-pdf").addEventListener("click", exportPdf);
    $("preview-lesson").addEventListener("click", previewLesson);
    $("import-html-trigger").addEventListener("click", () => $("import-html").click());
    $("import-html").addEventListener("change", importHtml);
    $("import-json-trigger").addEventListener("click", () => $("import-json").click());
    $("import-json").addEventListener("change", importJson);
    $("log-out").addEventListener("click", () => {
      window.location.href = "/auth/logout";
    });
    $("legacy-tracker-trigger").addEventListener("click", () => $("legacy-tracker-file").click());
    $("legacy-tracker-file").addEventListener("change", handleLegacyTrackerChoice);
    $("legacy-images-trigger").addEventListener("click", () => $("legacy-images-folder").click());
    $("legacy-images-folder").addEventListener("change", handleLegacyImagesChoice);
    $("legacy-import-run").addEventListener("click", importLegacyGoogleTracker);
    $("reset-lesson").addEventListener("click", resetLesson);
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const qaToggle = event.target.closest("[data-qa-toggle]");
      if (qaToggle) {
        toggleAnswerImage(qaToggle);
        return;
      }
      const button = event.target.closest("[data-example-reveal]");
      if (button) toggleExampleReveal(button);
    });
    document.addEventListener("paste", handleGlobalImagePaste);

    [0, 1, 2, 3].forEach((index) => {
      const input = $(`starter-lo-${index}`);
      input.addEventListener("input", (event) => {
        draft.starter[index].lo = event.target.value;
        draft.starter[index].retrievalItemId = "";
        draft.starter[index].currentImageSlot = 1;
      });
      bindImageDropZone(`starter-image-${index}`, (image) => {
        draft.starter[index].image = image;
        draft.starter[index].answerImage = null;
        draft.starter[index].retrievalItemId = "";
        draft.starter[index].currentImageSlot = 1;
      });
    });

    $("example-lo").addEventListener("input", (event) => {
      draft.example.lo = event.target.value;
      updateExampleRetrievalBankStatus();
    });
    $("example-spacing").addEventListener("input", (event) => {
      draft.example.spacing = coerceSpacing(event.target.value);
    });
    bindImageDropZone("example-image-1", (image) => {
      draft.example.image1 = image;
    });
    bindImageDropZone("example-image-2", (image) => {
      draft.example.image2 = image;
    });
    bindImageDropZone("example-answer-image-1", (image) => {
      draft.example.answerImage1 = image;
    });
    bindImageDropZone("example-answer-image-2", (image) => {
      draft.example.answerImage2 = image;
    });
    Array.from({ length: 8 }, (_, index) => index).forEach((index) => {
      bindImageDropZone(`example-retrieval-image-${index}`, (image) => {
        draft.example.retrievalImages[index] = image;
      });
      bindImageDropZone(`example-retrieval-answer-image-${index}`, (image) => {
        draft.example.retrievalAnswerImages[index] = image;
      });
    });

    $("worksheet-title").addEventListener("input", (event) => {
      draft.worksheet.title = event.target.value;
    });
    bindFileDropZone("worksheet-file", (file) => {
      draft.worksheet.worksheet = file;
    });
    bindFileDropZone("answers-file", (file) => {
      draft.worksheet.answers = file;
    });

    $("cfu-placement").addEventListener("input", (event) => {
      draft.cfu.placement = event.target.value;
    });
    bindImageDropZone("cfu-image", (image) => {
      draft.cfu.image = image;
    });

    $("placeholder-text").addEventListener("input", (event) => {
      draft.placeholder.text = event.target.value;
    });

    $("math-questions").addEventListener("input", (event) => {
      draft.math.questions = event.target.value;
      renderMathLivePreview();
    });
    $("math-answers").addEventListener("input", (event) => {
      draft.math.answers = event.target.value;
      renderMathLivePreview();
    });

    bindDrawingCanvas();
  }

  function showPanel(name) {
    Object.keys(panelNames).forEach((panel) => {
      $(`panel-${panel}`).classList.toggle("is-active", panel === name);
      document.querySelector(`[data-panel="${panel}"]`).classList.toggle("is-active", panel === name);
    });
    $("workspace-heading").textContent = panelNames[name] || "Lesson Builder";
    setStatus("", "");
  }

  function bindImageDropZone(id, onImage) {
    const zone = $(id);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.className = "hidden-file";
    document.body.appendChild(input);

    const handleFile = async (file) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setStatus("Choose an image file for this slot.", "error");
        return;
      }
      const image = await readFileAsDataUrl(file);
      onImage(image);
      renderImageZone(zone, image);
      setStatus(`Loaded ${file.name}.`, "success");
    };

    const activate = () => activateImageDropZone(zone, handleFile);

    zone.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Element && event.target.closest("[data-choose-image]")) return;
      activate();
    });
    zone.addEventListener("click", (event) => {
      activate();
      if (event.target instanceof Element && event.target.closest("[data-choose-image]")) {
        input.click();
      }
    });
    zone.addEventListener("focus", activate);
    zone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", () => handleFile(input.files && input.files[0]));
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
      const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
      handleFile(file);
    });
    zone.addEventListener("paste", (event) => {
      const file = imageFileFromClipboardEvent(event);
      if (file) {
        event.preventDefault();
        event.stopPropagation();
        handleFile(file);
      }
    });
  }

  function activateImageDropZone(zone, pasteHandler) {
    if (!zone) return;
    if (activeImageDropZone && activeImageDropZone !== zone) {
      activeImageDropZone.classList.remove("is-paste-target");
    }
    activeImageDropZone = zone;
    activeImagePasteHandler = pasteHandler;
    zone.classList.add("is-paste-target");
    if (document.activeElement !== zone) {
      zone.focus({ preventScroll: true });
    }
  }

  function handleGlobalImagePaste(event) {
    if (event.defaultPrevented) return;
    if (!activeImageDropZone || !activeImagePasteHandler) return;
    const active = document.activeElement;
    const zoneIsFocused = active === activeImageDropZone || activeImageDropZone.contains(active);
    if (!zoneIsFocused) return;
    const file = imageFileFromClipboardEvent(event);
    if (!file) return;
    event.preventDefault();
    activeImagePasteHandler(file);
  }

  function imageFileFromClipboardEvent(event) {
    const items = event.clipboardData && event.clipboardData.items ? Array.from(event.clipboardData.items) : [];
    const item = items.find((entry) => entry.type && entry.type.startsWith("image/"));
    return item ? item.getAsFile() : null;
  }

  function bindFileDropZone(id, onFile) {
    const zone = $(id);
    const input = document.createElement("input");
    input.type = "file";
    input.className = "hidden-file";
    document.body.appendChild(input);

    const handleFile = async (file) => {
      if (!file) return;
      const payload = await readFileAsDataUrl(file);
      onFile(payload);
      renderFileZone(zone, payload);
      setStatus(`Loaded ${file.name}.`, "success");
    };

    zone.addEventListener("click", () => input.click());
    zone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", () => handleFile(input.files && input.files[0]));
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
      const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
      handleFile(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        let checksum = "";
        try {
          checksum = await sha256Blob(file);
        } catch (err) {
          console.warn("Could not checksum image file", err);
        }
        resolve({
          name: file.name || "file",
          type: file.type || "application/octet-stream",
          size: file.size || 0,
          dataUrl: String(reader.result || ""),
          checksum
        });
      };
      reader.onerror = () => reject(reader.error || new Error("Could not read file."));
      reader.readAsDataURL(file);
    });
  }

  async function sha256Blob(blob) {
    if (!window.crypto || !window.crypto.subtle || !blob) return "";
    const hash = await window.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function renderImageZone(zone, image) {
    if (!image || !image.dataUrl) {
      zone.innerHTML = `
        <span>
          <strong>Paste or drop image</strong>
          <small>Click here, then paste. Use the button for file picker.</small>
          <button class="drop-action-button" type="button" data-choose-image>Choose image</button>
        </span>
      `;
      return;
    }
    zone.innerHTML = `
      <img src="${escapeAttr(image.dataUrl)}" alt="${escapeAttr(image.name || "Selected image")}">
      <button class="drop-action-button image-change-button" type="button" data-choose-image>Replace</button>
    `;
  }

  function renderFileZone(zone, file) {
    if (!file || !file.dataUrl) {
      zone.textContent = "Choose or drop file";
      return;
    }
    zone.innerHTML = `<span><strong>${escapeHtml(file.name)}</strong><small>${escapeHtml(file.type || "file")} - ${formatBytes(file.size)}</small></span>`;
  }

  function coerceSpacing(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 1.3;
    return Math.min(2, Math.max(1, Number(num.toFixed(1))));
  }

  function normalizeImageSlot(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 1;
    return Math.min(8, Math.max(1, Math.round(num)));
  }

  function coercePenSize(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_PEN_SIZE;
    return Math.max(MIN_PEN_SIZE, num);
  }

  function getStarterLos() {
    return draft.starter.map((slot) => String(slot.lo || "").trim()).filter(Boolean);
  }

  function getExampleRetrievalImages() {
    return normalizeRetrievalImages(draft.example.retrievalImages);
  }

  function getExampleRetrievalAnswerImages() {
    return normalizeRetrievalImages(draft.example.retrievalAnswerImages);
  }

  function getDueRetrievalItems() {
    return getVisibleRetrievalItems()
      .map((item) => ({ item, nextDue: getNextDueDate(item) }))
      .filter(({ item }) => isRetrievalItemDue(item))
      .sort((a, b) => String(a.nextDue).localeCompare(String(b.nextDue)))
      .map(({ item }) => item);
  }

  function selectDiverseStarterItems(items, limit) {
    const candidates = Array.isArray(items) ? items.filter(Boolean) : [];
    const maxItems = Math.max(0, Number(limit) || 0);
    const selected = [];
    const usedFamilies = new Set();

    candidates.forEach((item, index) => {
      if (selected.length >= maxItems) return;
      const family = getLoFamilyKey(item && item.lo);
      const familyKey = family || `unique:${item && (item.id || item.lo) ? item.id || item.lo : index}`;
      if (usedFamilies.has(familyKey)) return;
      selected.push(item);
      usedFamilies.add(familyKey);
    });

    candidates.forEach((item) => {
      if (selected.length >= maxItems) return;
      if (selected.includes(item)) return;
      selected.push(item);
    });

    return selected;
  }

  function isRetrievalItemDue(item) {
    const teachingDate = dateFromIso(state.teachingDate) || dateFromIso(todayIso());
    const due = dateFromIso(getNextDueDate(item));
    return !!(due && due.getTime() <= teachingDate.getTime());
  }

  function compareRetrievalItemsForDisplay(left, right) {
    const leftDue = isRetrievalItemDue(left);
    const rightDue = isRetrievalItemDue(right);
    if (leftDue !== rightDue) return leftDue ? -1 : 1;

    const nextDueCompare = String(getNextDueDate(left)).localeCompare(String(getNextDueDate(right)));
    if (nextDueCompare) return nextDueCompare;

    return String(left.lo || "").localeCompare(String(right.lo || ""));
  }

  function getNextDueDate(item) {
    const seenCount = Math.max(0, Number(item.seenCount) || 0);
    const lastTaught = isIsoDate(item.lastTaught) ? item.lastTaught : state.teachingDate;
    if (seenCount <= 0) return lastTaught;
    const spacing = coerceSpacing(item.spacingFactor || 1.3);
    const days = Math.max(1, Math.round(spacing * (0.5 * seenCount * seenCount + 0.5 * seenCount)));
    return addDays(lastTaught, days);
  }

  function getRetrievalImageForSeenCount(item) {
    return getRetrievalImagePairForSeenCount(item).question;
  }

  function getRetrievalImagePairForSeenCount(item) {
    const images = normalizeRetrievalImages(item && item.images);
    const answerImages = normalizeRetrievalAnswerImages(item);
    const seenCount = Math.max(1, Number(item && item.seenCount) || 1);
    const targetIndex = (seenCount - 1) % 8;
    return {
      question: images[targetIndex] || [...images].reverse().find(Boolean) || null,
      answer: answerImages[targetIndex] || null
    };
  }

  function getRetrievalImagePairForCurrentSlot(item) {
    const images = normalizeRetrievalImages(item && item.images);
    const answerImages = normalizeRetrievalAnswerImages(item);
    const currentSlot = normalizeImageSlot(item && item.currentImageSlot);
    const targetIndex = currentSlot - 1;
    const fallbackIndex = images.findIndex(Boolean);
    const index = images[targetIndex] ? targetIndex : fallbackIndex;
    return {
      question: index >= 0 ? images[index] : null,
      answer: index >= 0 ? answerImages[index] || null : null,
      currentImageSlot: index >= 0 ? index + 1 : currentSlot
    };
  }

  function incrementRetrievalImageSlot(value) {
    const currentSlot = normalizeImageSlot(value);
    return currentSlot >= 8 ? 1 : currentSlot + 1;
  }

  async function suggestStarterLos() {
    const suggestions = selectDiverseStarterItems(getDueRetrievalItems(), 4);
    if (!suggestions.length) {
      setStatus("No due retrieval items found for the selected date.", "warn");
      return;
    }
    const resolvedPairs = await resolveRetrievalImagePairs(suggestions, "current");
    [0, 1, 2, 3].forEach((index) => {
      const item = suggestions[index];
      const lo = item ? item.lo : "";
      const resolved = item ? resolvedPairs.get(String(item.id || "")) : null;
      const imagePair = resolved
        ? {
            question: resolved.questionImage,
            answer: resolved.answerImage,
            currentImageSlot: resolved.currentImageSlot
          }
        : item
          ? getRetrievalImagePairForCurrentSlot(item)
          : { question: null, answer: null, currentImageSlot: 1 };
      draft.starter[index].lo = lo;
      draft.starter[index].image = imagePair.question;
      draft.starter[index].answerImage = imagePair.answer;
      draft.starter[index].retrievalItemId = item ? item.id : "";
      draft.starter[index].currentImageSlot = imagePair.currentImageSlot || 1;
      $(`starter-lo-${index}`).value = lo;
      renderImageZone($(`starter-image-${index}`), imagePair.question);
    });
    setStatus(`Loaded ${suggestions.length} due retrieval item${suggestions.length === 1 ? "" : "s"} with seen-count images.`, "success");
  }

  function addRetrievalItem(seed) {
    const seedLo = seed && seed.lo ? seed.lo : "";
    const seedCode = seed && seed.loCode ? seed.loCode : extractRetrievalLoCode(seedLo);
    const item = {
      id: uid("lo"),
      trackingId: "",
      contentId: seed && seed.contentId ? String(seed.contentId).trim() : "",
      loCode: seedCode,
      codeSource: seedCode ? "prefix" : "",
      className: seed && seed.className ? String(seed.className).trim() : getActiveClassName(),
      legacyLoId: seed && seed.legacyLoId ? String(seed.legacyLoId).trim() : "",
      lo: seedLo,
      spacingFactor: coerceSpacing(seed && seed.spacingFactor ? seed.spacingFactor : 1.3),
      seenCount: Number(seed && seed.seenCount) || 0,
      currentImageSlot: normalizeImageSlot(seed && seed.currentImageSlot ? seed.currentImageSlot : seed && seed.seenCount ? seed.seenCount : 1),
      lastTaught: seed && isIsoDate(seed.lastTaught) ? seed.lastTaught : state.teachingDate,
      images: normalizeRetrievalImages(seed && seed.images),
      answerImages: normalizeRetrievalImages(seed && seed.answerImages),
      selected: false
    };
    state.retrievalItems.push(item);
    persistGlobalChange();
    if (seed && String(item.lo || "").trim()) queueRetrievalItemSave(item);
    renderRetrievalRows();
    if (seed) {
      setStatus("Added a retrieval row.", "success");
    } else {
      openRetrievalEditor(item.id);
      setStatus("Added a retrieval row.", "success");
    }
    return item;
  }

  function addExampleToRetrievalBank() {
    const lo = String(draft.example.lo || "").trim();
    if (!lo) {
      setStatus("Add a learning objective before saving to the retrieval bank.", "error");
      return;
    }
    const retrievalImages = getExampleRetrievalImages();
    const retrievalAnswerImages = getExampleRetrievalAnswerImages();
    const hasRetrievalImages = retrievalImages.some(Boolean);
    const hasRetrievalAnswerImages = retrievalAnswerImages.some(Boolean);
    const sharedStatus = findSharedRetrievalBankStatus(lo);
    const existing = findRetrievalItemForLo(lo);
    let itemToSave = null;
    let successMessage = "";
    if (existing) {
      const shouldUpdate = window.confirm("This LO already exists in the retrieval bank. Updating it will replace the spacing, last taught date, seen count, and any retrieval images you have added here. Continue?");
      if (!shouldUpdate) {
        setStatus("Existing retrieval item was not updated.", "warn");
        return;
      }
      existing.spacingFactor = draft.example.spacing;
      existing.lastTaught = state.teachingDate;
      existing.seenCount = Math.max(1, Number(existing.seenCount) || 0);
      if (hasRetrievalImages) {
        existing.images = retrievalImages;
      }
      if (hasRetrievalAnswerImages) {
        existing.answerImages = retrievalAnswerImages;
      }
      queueRetrievalItemSave(existing);
      itemToSave = existing;
      successMessage = "Updated the existing retrieval item.";
    } else {
      itemToSave = addRetrievalItem({
        contentId: sharedStatus.contentId,
        loCode: sharedStatus.loCode,
        lo,
        spacingFactor: draft.example.spacing,
        lastTaught: state.teachingDate,
        seenCount: 1,
        images: retrievalImages,
        answerImages: retrievalAnswerImages
      });
      successMessage = sharedStatus.exists ? "Added class tracking for the existing shared LO." : "Added a retrieval row.";
      updateExampleRetrievalBankStatus();
    }
    persistGlobalChange();
    renderRetrievalRows();
    updateExampleRetrievalBankStatus();
    if (itemToSave) {
      saveRetrievalItemToSupabase(itemToSave)
        .then(() => (hasRetrievalImages || hasRetrievalAnswerImages ? syncRetrievalItemImages(itemToSave) : null))
        .then(() => {
          renderRetrievalRows();
          updateExampleRetrievalBankStatus();
          setStatus(successMessage, "success");
        })
        .catch((err) => {
          console.warn("Could not immediately sync example retrieval item", err);
          setStatus("Saved locally; retrieval bank sync is queued.", "warn");
        });
    }
  }

  function logLos(los, successMessage) {
    const uniqueLos = uniqueStrings(los);
    if (!uniqueLos.length) {
      setStatus("Select or enter at least one learning objective.", "error");
      return;
    }
    uniqueLos.forEach((lo) => {
      let item = findRetrievalItemForLo(lo);
      if (!item) {
        item = {
          id: uid("lo"),
          trackingId: "",
          contentId: "",
          loCode: extractRetrievalLoCode(lo),
          codeSource: extractRetrievalLoCode(lo) ? "prefix" : "",
          className: getActiveClassName(),
          legacyLoId: extractLegacyLoId(lo),
          lo,
          spacingFactor: 1.3,
          seenCount: 0,
          currentImageSlot: 1,
          lastTaught: state.teachingDate,
          images: emptyRetrievalImages(),
          answerImages: emptyRetrievalImages(),
          selected: false
        };
        state.retrievalItems.push(item);
      }
      item.lastTaught = state.teachingDate;
      item.seenCount = (Number(item.seenCount) || 0) + 1;
    });
    logRetrievalItemsInSupabase(uniqueLos.map((lo) => {
      const item = findRetrievalItemForLo(lo);
      return {
        itemId: item && item.id,
        lo,
        className: item && item.className || getActiveClassName(),
        deltaSeen: 1,
        teachingDate: state.teachingDate
      };
    })).catch((err) => {
      console.warn("Could not sync logged retrieval items", err);
      setStatus("Logged locally, but retrieval log sync is currently unavailable.", "warn");
    });
    persistGlobalChange();
    renderRetrievalRows();
    setStatus(successMessage || `Logged ${uniqueLos.length} retrieval item${uniqueLos.length === 1 ? "" : "s"}.`, "success");
  }

  function getSelectedRetrievalLos() {
    return getSelectedRetrievalItems().map((item) => item.lo);
  }

  function getSelectedRetrievalItems() {
    return getVisibleRetrievalItems().filter((item) => item.selected);
  }

  function setVisibleRetrievalSelection(mode) {
    const visibleItems = getVisibleRetrievalItems();
    const dueIds = new Set(getDueRetrievalItems().map((item) => item.id));
    if (!visibleItems.length) {
      setStatus("No retrieval items are visible.", "warn");
      return;
    }

    visibleItems.forEach((item) => {
      if (mode === "all") {
        item.selected = true;
      } else if (mode === "due") {
        item.selected = dueIds.has(item.id);
      } else if (mode === "none") {
        item.selected = false;
      }
    });

    persistGlobalChange();
    renderRetrievalRows();
    if (mode === "all") {
      setStatus(`Selected ${visibleItems.length} retrieval item${visibleItems.length === 1 ? "" : "s"}.`, "success");
    } else if (mode === "due") {
      setStatus(`Selected ${dueIds.size} due retrieval item${dueIds.size === 1 ? "" : "s"}.`, dueIds.size ? "success" : "warn");
    } else {
      setStatus("Deselected visible retrieval items.", "success");
    }
  }

  function renderRetrievalRows() {
    const tbody = $("retrieval-rows");
    const visibleItems = getVisibleRetrievalItems().slice().sort(compareRetrievalItemsForDisplay);
    const dueItems = getDueRetrievalItems();
    const dueIds = new Set(dueItems.map((item) => item.id));
    const activeClass = getActiveClassName();
    const countPrefix = activeClass ? `${activeClass}: ` : "";
    $("retrieval-count").textContent = `${countPrefix}${visibleItems.length} item${visibleItems.length === 1 ? "" : "s"}`;
    $("retrieval-due-count").textContent = `${dueItems.length} due`;

    if (!visibleItems.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No retrieval items yet.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = visibleItems
      .map((item) => {
        const nextDue = getNextDueDate(item);
        const isDue = dueIds.has(item.id);
        return `
          <tr class="${isDue ? "is-due" : ""}" data-id="${escapeAttr(item.id)}">
            <td><input type="checkbox" data-field="selected" ${item.selected ? "checked" : ""}></td>
            <td><textarea data-field="lo" rows="2">${escapeHtml(item.lo)}</textarea></td>
            <td><input type="number" data-field="spacingFactor" min="1" max="2" step="0.1" value="${escapeAttr(item.spacingFactor || 1.3)}"></td>
            <td><input type="number" data-field="seenCount" min="0" step="1" value="${escapeAttr(item.seenCount || 0)}"></td>
            <td><input type="date" data-field="lastTaught" value="${escapeAttr(item.lastTaught || state.teachingDate)}"></td>
            <td>${escapeHtml(nextDue)} ${isDue ? `<strong>Due</strong>` : ""}</td>
            <td>Q ${countRetrievalImages(item.images)} / 8<br>A ${countRetrievalAnswerImages(item)} / 8</td>
            <td>
              <div class="row-actions">
                <button class="mini-button" type="button" data-action="edit">Edit</button>
                <button class="mini-button" type="button" data-action="delete">Delete</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    tbody.querySelectorAll("tr[data-id]").forEach((row) => {
      const id = row.dataset.id;
      const item = state.retrievalItems.find((entry) => entry.id === id);
      if (!item) return;

      row.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("change", () => {
          const field = input.dataset.field;
          if (field === "selected") {
            item.selected = input.checked;
          } else if (field === "spacingFactor") {
            item.spacingFactor = coerceSpacing(input.value);
          } else if (field === "seenCount") {
            item.seenCount = Math.max(0, Number(input.value) || 0);
          } else if (field === "lastTaught") {
            item.lastTaught = isIsoDate(input.value) ? input.value : state.teachingDate;
          } else if (field === "lo") {
            item.lo = input.value;
          }
          if (field !== "selected") {
            persistGlobalChange();
            queueRetrievalItemSave(item);
            setStatus(TARGETED_SYNC_QUEUED_STATUS, "warn");
          } else {
            persistGlobalChange();
          }
          renderRetrievalRows();
        });
      });

      row.querySelector('[data-action="edit"]').addEventListener("click", () => openRetrievalEditor(id));
      row.querySelector('[data-action="delete"]').addEventListener("click", () => {
        state.retrievalItems = state.retrievalItems.filter((entry) => entry.id !== id);
        persistGlobalChange();
        queueRetrievalItemDelete(id);
        renderRetrievalRows();
      });
    });
  }

  async function openRetrievalEditor(id) {
    const item = state.retrievalItems.find((entry) => entry.id === id);
    if (!item) {
      setStatus("That retrieval item could not be found.", "error");
      return;
    }

    if (isUuid(item.id)) {
      try {
        setStatus("Loading retrieval images...", "warn");
        await resolveRetrievalEditorImages(item);
      } catch (err) {
        console.warn("Could not resolve retrieval editor images", err);
        setStatus("Loaded LO details, but images could not be refreshed from Supabase.", "warn");
      }
    }

    retrievalEditor.itemId = id;
    retrievalEditor.draft = {
      lo: String(item.lo || ""),
      spacingFactor: coerceSpacing(item.spacingFactor || 1.3),
      seenCount: Math.max(0, Number(item.seenCount) || 0),
      lastTaught: isIsoDate(item.lastTaught) ? item.lastTaught : state.teachingDate,
      images: normalizeRetrievalImages(item.images),
      answerImages: normalizeRetrievalAnswerImages(item)
    };

    $("retrieval-edit-lo").value = retrievalEditor.draft.lo;
    $("retrieval-edit-spacing").value = String(retrievalEditor.draft.spacingFactor);
    $("retrieval-edit-seen").value = String(retrievalEditor.draft.seenCount);
    $("retrieval-edit-last-taught").value = retrievalEditor.draft.lastTaught;
    renderRetrievalEditorImages();
    $("retrieval-editor").hidden = false;
    $("retrieval-edit-lo").focus();
  }

  function closeRetrievalEditor() {
    $("retrieval-editor").hidden = true;
    retrievalEditor.itemId = "";
    retrievalEditor.draft = null;
    $("retrieval-edit-images").innerHTML = "";
  }

  function syncRetrievalEditorFields() {
    if (!retrievalEditor.draft) return;
    retrievalEditor.draft.lo = $("retrieval-edit-lo").value;
    retrievalEditor.draft.spacingFactor = coerceSpacing($("retrieval-edit-spacing").value);
    retrievalEditor.draft.seenCount = Math.max(0, Number($("retrieval-edit-seen").value) || 0);
    retrievalEditor.draft.lastTaught = isIsoDate($("retrieval-edit-last-taught").value)
      ? $("retrieval-edit-last-taught").value
      : state.teachingDate;
  }

  async function saveRetrievalEditor() {
    if (!retrievalEditor.draft || !retrievalEditor.itemId) return;
    syncRetrievalEditorFields();
    const item = state.retrievalItems.find((entry) => entry.id === retrievalEditor.itemId);
    if (!item) {
      closeRetrievalEditor();
      setStatus("That retrieval item could not be found.", "error");
      return;
    }

    const lo = String(retrievalEditor.draft.lo || "").trim();
    if (!lo) {
      setStatus("Add a learning objective before saving.", "error");
      $("retrieval-edit-lo").focus();
      return;
    }

    item.lo = lo;
    item.spacingFactor = coerceSpacing(retrievalEditor.draft.spacingFactor);
    item.seenCount = Math.max(0, Number(retrievalEditor.draft.seenCount) || 0);
    item.lastTaught = isIsoDate(retrievalEditor.draft.lastTaught) ? retrievalEditor.draft.lastTaught : state.teachingDate;
    item.images = normalizeRetrievalImages(retrievalEditor.draft.images);
    item.answerImages = normalizeRetrievalImages(retrievalEditor.draft.answerImages);
    persistGlobalChange();
    try {
      setStatus("Saving retrieval item...", "warn");
      await saveRetrievalItemToSupabase(item);
      await syncRetrievalItemImages(item);
      renderRetrievalRows();
      closeRetrievalEditor();
      setStatus("Updated retrieval item.", "success");
    } catch (err) {
      console.warn("Could not save retrieval item", err);
      queueRetrievalItemSave(item);
      renderRetrievalRows();
      closeRetrievalEditor();
      setStatus("Saved locally, but this LO could not sync to Supabase yet.", "warn");
    }
  }

  function renderRetrievalEditorImages() {
    const container = $("retrieval-edit-images");
    const draftItem = retrievalEditor.draft;
    if (!draftItem) {
      container.innerHTML = "";
      return;
    }

    draftItem.images = normalizeRetrievalImages(draftItem.images);
    draftItem.answerImages = normalizeRetrievalImages(draftItem.answerImages);
    container.innerHTML = draftItem.images
      .map((_, index) => `
        <div class="retrieval-edit-image-slot">
          <span class="field-label">Seen ${index + 1}</span>
          <div class="qa-edit-pair">
            <div>
              <span class="field-label">Question</span>
              <div id="retrieval-edit-image-${index}" class="image-drop small" tabindex="0" role="group" aria-label="Edit retrieval question image ${index + 1}"></div>
            </div>
            <div>
              <span class="field-label">Answer</span>
              <div id="retrieval-edit-answer-image-${index}" class="image-drop small" tabindex="0" role="group" aria-label="Edit retrieval answer image ${index + 1}"></div>
            </div>
          </div>
          <div class="image-slot-actions">
            <button class="secondary-button tiny-button" type="button" data-clear-retrieval-image="${index}">Clear question</button>
            <button class="secondary-button tiny-button" type="button" data-clear-retrieval-answer="${index}">Clear answer</button>
          </div>
        </div>
      `)
      .join("");

    draftItem.images.forEach((image, index) => {
      const zone = $(`retrieval-edit-image-${index}`);
      renderImageZone(zone, image);
      bindRetrievalEditorImageZone(zone, index, "images");
      const answerZone = $(`retrieval-edit-answer-image-${index}`);
      renderImageZone(answerZone, draftItem.answerImages[index]);
      bindRetrievalEditorImageZone(answerZone, index, "answerImages");
    });

    container.querySelectorAll("[data-clear-retrieval-image]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-clear-retrieval-image"));
        if (!Number.isInteger(index)) return;
        draftItem.images[index] = null;
        renderRetrievalEditorImages();
      });
    });
    container.querySelectorAll("[data-clear-retrieval-answer]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-clear-retrieval-answer"));
        if (!Number.isInteger(index)) return;
        draftItem.answerImages[index] = null;
        renderRetrievalEditorImages();
      });
    });
  }

  function bindRetrievalEditorImageZone(zone, index, field) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.className = "hidden-file";
    zone.appendChild(input);

    const handleFile = async (file) => {
      if (!file || !retrievalEditor.draft) return;
      if (!file.type.startsWith("image/")) {
        setStatus("Choose an image file for this retrieval slot.", "error");
        return;
      }
      retrievalEditor.draft[field][index] = await readFileAsDataUrl(file);
      renderRetrievalEditorImages();
      setStatus(`Loaded ${file.name}.`, "success");
    };

    const activate = () => activateImageDropZone(zone, handleFile);

    zone.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Element && event.target.closest("[data-choose-image]")) return;
      activate();
    });
    zone.addEventListener("click", (event) => {
      activate();
      if (event.target instanceof Element && event.target.closest("[data-choose-image]")) {
        input.click();
      }
    });
    zone.addEventListener("focus", activate);
    zone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", () => {
      handleFile(input.files && input.files[0]);
      input.value = "";
    });
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
      const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
      handleFile(file);
    });
    zone.addEventListener("paste", (event) => {
      const file = imageFileFromClipboardEvent(event);
      if (file) {
        event.preventDefault();
        event.stopPropagation();
        handleFile(file);
      }
    });
  }

  function getActiveTemplate() {
    state.slideTemplates = normalizeSlideTemplates(state.slideTemplates);
    if (!templateEditor.activeId || !state.slideTemplates.some((template) => template.id === templateEditor.activeId)) {
      templateEditor.activeId = state.slideTemplates[0] ? state.slideTemplates[0].id : "";
    }
    return state.slideTemplates.find((template) => template.id === templateEditor.activeId) || null;
  }

  function renderTemplateEditor() {
    const select = $("template-select");
    if (!select) return;

    state.slideTemplates = normalizeSlideTemplates(state.slideTemplates);
    const active = getActiveTemplate();
    select.innerHTML = state.slideTemplates
      .map((template) => `<option value="${escapeAttr(template.id)}">${escapeHtml(template.title)}</option>`)
      .join("");
    select.value = active ? active.id : "";
    syncTemplateFields();
  }

  function syncTemplateFields() {
    const active = getActiveTemplate();
    $("template-title").value = active ? active.title : "";
    $("template-bullets").value = active ? active.bullets.join("\n") : "";
  }

  function addSlideTemplate() {
    const template = {
      id: uid("template"),
      title: "New template",
      bullets: ["First expectation"]
    };
    state.slideTemplates = normalizeSlideTemplates([...(state.slideTemplates || []), template]);
    templateEditor.activeId = template.id;
    persistGlobalChange();
    queueTemplateSync();
    renderTemplateEditor();
    setStatus("Added template.", "success");
  }

  function saveSlideTemplate() {
    const active = getActiveTemplate();
    if (!active) return;

    const title = String($("template-title").value || "").trim();
    const bullets = String($("template-bullets").value || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);

    if (!title) {
      setStatus("Add a template title before saving.", "error");
      $("template-title").focus();
      return;
    }

    active.title = title;
    active.bullets = bullets;
    persistGlobalChange();
    queueTemplateSync();
    renderTemplateEditor();
    setStatus("Saved template.", "success");
  }

  function deleteSlideTemplate() {
    const active = getActiveTemplate();
    if (!active) return;
    if (state.slideTemplates.length <= 1) {
      setStatus("Keep at least one template.", "warn");
      return;
    }
    if (!window.confirm(`Delete "${active.title}"?`)) return;
    state.slideTemplates = state.slideTemplates.filter((template) => template.id !== active.id);
    templateEditor.activeId = state.slideTemplates[0] ? state.slideTemplates[0].id : "";
    persistGlobalChange();
    queueTemplateSync();
    renderTemplateEditor();
    setStatus("Deleted template.", "success");
  }

  function insertTemplateSlide() {
    const active = getActiveTemplate();
    if (!active) {
      setStatus("Choose a template first.", "error");
      return;
    }
    addSlide({
      type: "template",
      title: active.title,
      bullets: [...active.bullets]
    });
  }

  function addSlide(slide) {
    insertSlidesAfterSelectedSlide([slide]);
    persistLessonChange();
    renderPreview();
    setStatus("Slide added to the local lesson.", "success");
  }

  function addSlides(slides, successMessage) {
    const addedSlides = insertSlidesAfterSelectedSlide(slides);
    if (!addedSlides.length) return;
    persistLessonChange();
    renderPreview();
    setStatus(successMessage || `Added ${addedSlides.length} slides to the local lesson.`, "success");
  }

  function getSelectedSlideInsertIndex() {
    if (!selectedPreviewSlideId) return state.slides.length;
    const selectedIndex = state.slides.findIndex((slide) => slide.id === selectedPreviewSlideId);
    return selectedIndex >= 0 ? selectedIndex + 1 : state.slides.length;
  }

  function insertSlidesAfterSelectedSlide(slides) {
    const sourceSlides = Array.isArray(slides) ? slides : [];
    if (!sourceSlides.length) return [];
    const createdAt = new Date().toISOString();
    const preparedSlides = sourceSlides.map((slide) => ({
      id: uid("slide"),
      createdAt,
      ...slide
    }));
    state.slides.splice(getSelectedSlideInsertIndex(), 0, ...preparedSlides);
    selectedPreviewSlideId = preparedSlides[preparedSlides.length - 1].id;
    return preparedSlides;
  }

  function addStarterSlide() {
    const slots = draft.starter.map((slot) => ({
      lo: String(slot.lo || "").trim(),
      retrievalItemId: String(slot.retrievalItemId || ""),
      currentImageSlot: normalizeImageSlot(slot.currentImageSlot || 1),
      image: slot.image,
      answerImage: slot.answerImage || null
    }));
    if (!slots.some((slot) => slot.lo || slot.image)) {
      setStatus("Add at least one starter LO or image.", "error");
      return;
    }
    addSlide({ type: "starter", title: "Starter", slots });
  }

  async function addRetrievalSlide() {
    const selectedItems = getSelectedRetrievalItems().slice().sort(compareRetrievalItemsForDisplay);
    if (!selectedItems.length) {
      setStatus("Select at least one retrieval item first.", "error");
      return;
    }

    const resolvedPairs = await resolveRetrievalImagePairs(selectedItems, "current");
    const usedSlotByItemId = new Map();
    const slides = [];
    for (let index = 0; index < selectedItems.length; index += 4) {
      slides.push({
        type: "starter",
        title: "Retrieval",
        slots: selectedItems.slice(index, index + 4).map((item) => {
          const resolved = resolvedPairs.get(String(item.id || ""));
          const imagePair = resolved
            ? {
                question: resolved.questionImage,
                answer: resolved.answerImage,
                currentImageSlot: resolved.currentImageSlot
              }
            : getRetrievalImagePairForCurrentSlot(item);
          usedSlotByItemId.set(item.id, imagePair.currentImageSlot || normalizeImageSlot(item.currentImageSlot));
          return {
            lo: item.lo,
            retrievalItemId: item.id,
            currentImageSlot: imagePair.currentImageSlot,
            lockImageSlot: true,
            image: imagePair.question,
            answerImage: imagePair.answer
          };
        })
      });
    }

    addSlides(slides, `Added ${slides.length} retrieval image slide${slides.length === 1 ? "" : "s"} from ${selectedItems.length} selected item${selectedItems.length === 1 ? "" : "s"}.`);
    selectedItems.forEach((item) => {
      const usedSlot = usedSlotByItemId.get(item.id) || normalizeImageSlot(item.currentImageSlot);
      item.currentImageSlot = incrementRetrievalImageSlot(usedSlot);
    });
    persistGlobalChange();
    queueRetrievalNextSync(selectedItems);
    renderRetrievalRows();
  }

  async function generateRevisionLesson() {
    const selectedItems = getSelectedRetrievalItems().slice().sort(compareRetrievalItemsForDisplay);
    if (!selectedItems.length) {
      setStatus("Select at least one retrieval item before generating a revision lesson.", "error");
      return;
    }

    const resolvedPairs = await resolveRetrievalImagePairs(selectedItems, "seen");
    const slides = [];
    for (let index = 0; index < selectedItems.length; index += 2) {
      slides.push({
        type: "revision",
        title: "Revision",
        items: selectedItems.slice(index, index + 2).map((item) => {
          const resolved = resolvedPairs.get(String(item.id || ""));
          const imagePair = resolved
            ? {
                question: resolved.questionImage,
                answer: resolved.answerImage
              }
            : getRetrievalImagePairForSeenCount(item);
          return {
            lo: item.lo,
            image: imagePair.question,
            answerImage: imagePair.answer,
            seenCount: Math.max(1, Number(item.seenCount) || 1)
          };
        })
      });
    }

    addSlides(slides, `Generated ${slides.length} revision slide${slides.length === 1 ? "" : "s"} from ${selectedItems.length} selected item${selectedItems.length === 1 ? "" : "s"}.`);
  }

  function addExampleSlide() {
    const lo = String(draft.example.lo || "").trim();
    if (!lo) {
      setStatus("Add a learning objective before creating the example slide.", "error");
      return;
    }
    if (!draft.example.image1 && !draft.example.image2) {
      setStatus("Add at least one example image.", "error");
      return;
    }
    addSlide({
      type: "example",
      title: "Example",
      lo,
      image1: draft.example.image1,
      image2: draft.example.image2,
      answerImage1: draft.example.answerImage1,
      answerImage2: draft.example.answerImage2
    });
  }

  function addWorksheetSlide() {
    if (!draft.worksheet.worksheet) {
      setStatus("Choose a worksheet file first.", "error");
      return;
    }
    addSlide({
      type: "worksheet",
      title: draft.worksheet.title || "Worksheet",
      worksheet: draft.worksheet.worksheet,
      answers: draft.worksheet.answers
    });
  }

  function clearWorksheetFiles() {
    draft.worksheet.worksheet = null;
    draft.worksheet.answers = null;
    renderFileZone($("worksheet-file"), null);
    renderFileZone($("answers-file"), null);
    setStatus("Cleared worksheet files.", "success");
  }

  function handlePdfFile(file) {
    if (!file) return;
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name || "")) {
      setStatus("Choose a PDF file.", "error");
      return;
    }
    draft.pdf.file = file;
    renderFileZone($("pdf-file-drop"), {
      name: file.name || "worksheet.pdf",
      type: file.type || "application/pdf",
      size: file.size || 0,
      dataUrl: "selected"
    });
    $("pdf-summary").textContent = `${file.name || "PDF"} selected. Pages will be rendered locally when you add slides.`;
    setStatus(`Loaded ${file.name || "PDF"}.`, "success");
  }

  function clearPdfDraft() {
    draft.pdf.file = null;
    draft.pdf.renderWidth = Number($("pdf-render-width").value) || 1800;
    renderFileZone($("pdf-file-drop"), null);
    $("pdf-summary").textContent = "No PDF selected.";
    setStatus("Cleared PDF selection.", "success");
  }

  async function addPdfSlides() {
    const file = draft.pdf.file;
    if (!file) {
      setStatus("Choose a PDF worksheet first.", "error");
      return;
    }

    const button = $("pdf-add-slides");
    button.disabled = true;
    const renderWidth = Math.max(600, Math.min(2600, Number($("pdf-render-width").value) || draft.pdf.renderWidth || 1800));
    draft.pdf.renderWidth = renderWidth;
    setStatus("Loading PDF renderer...", "warn");

    try {
      const pdfjs = await loadPdfJs();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const slides = [];
      $("pdf-summary").textContent = `Rendering ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}...`;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setStatus(`Rendering PDF page ${pageNumber} of ${pdf.numPages}...`, "warn");
        const slide = await renderPdfPageToSlide(pdf, pageNumber, file, renderWidth);
        slides.push(slide);
        $("pdf-summary").textContent = `Rendered ${pageNumber} of ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}.`;
        await waitForUi();
      }

      addSlides(slides, `Added ${slides.length} PDF page slide${slides.length === 1 ? "" : "s"}.`);
      $("pdf-summary").textContent = `${file.name || "PDF"} rendered as ${slides.length} slide${slides.length === 1 ? "" : "s"}.`;
    } catch (err) {
      console.error(err);
      setStatus("Could not render that PDF. Try a smaller render width or another PDF.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function loadPdfJs() {
    if (!pdfJsPromise) {
      pdfJsPromise = import("./vendor/pdf.min.mjs").then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";
        return pdfjs;
      });
    }
    return pdfJsPromise;
  }

  async function renderPdfPageToSlide(pdf, pageNumber, file, renderWidth) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = renderWidth / Math.max(1, baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/png");
    const aspect = canvas.width / Math.max(1, canvas.height);
    return {
      type: "pdf-page",
      title: `${file.name || "PDF"} page ${pageNumber}`,
      sourceName: file.name || "PDF",
      pageNumber,
      pageCount: pdf.numPages,
      orientation: aspect >= 1 ? "landscape" : "portrait",
      width: canvas.width,
      height: canvas.height,
      aspect,
      image: {
        name: `${sanitizeFilePart(file.name || "pdf")}-page-${pageNumber}.png`,
        type: "image/png",
        size: Math.round((dataUrl.length * 3) / 4),
        dataUrl
      }
    };
  }

  function bindDrawingCanvas() {
    const canvas = $("drawing-canvas");
    if (!canvas) return;
    resizeDrawingCanvas(DEFAULT_DRAWING_SIZE.width, DEFAULT_DRAWING_SIZE.height);

    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const point = getCanvasPoint(event);
      drawingState.activeStroke = {
        mode: $("drawing-mode").value || "pen",
        color: $("drawing-color").value || DEFAULT_PEN_COLOR,
        sizeRatio: coercePenSize($("drawing-size").value) / drawingState.height,
        points: [point]
      };
      drawStrokePoint(getDrawingContext(), drawingState.activeStroke, point);
    });

    canvas.addEventListener("pointermove", (event) => {
      const stroke = drawingState.activeStroke;
      if (!stroke) return;
      event.preventDefault();
      const point = getCanvasPoint(event);
      const previous = stroke.points[stroke.points.length - 1];
      stroke.points.push(point);
      drawStrokeSegment(getDrawingContext(), stroke, previous, point);
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
      canvas.addEventListener(eventName, (event) => {
        const stroke = drawingState.activeStroke;
        if (!stroke) return;
        event.preventDefault();
        if (stroke.points.length) {
          drawingState.strokes.push(stroke);
        }
        drawingState.activeStroke = null;
      });
    });
  }

  function setDrawingMode(mode) {
    const value = mode === "eraser" ? "eraser" : "pen";
    $("drawing-mode").value = value;
    $("drawing-pen").classList.toggle("is-active", value === "pen");
    $("drawing-eraser").classList.toggle("is-active", value === "eraser");
    $("drawing-pen").setAttribute("aria-pressed", value === "pen" ? "true" : "false");
    $("drawing-eraser").setAttribute("aria-pressed", value === "eraser" ? "true" : "false");
    $("drawing-canvas").style.cursor = value === "eraser" ? "cell" : "crosshair";
  }

  function setDrawingColor(color, activeInput) {
    const value = color || DEFAULT_PEN_COLOR;
    $("drawing-color").value = value;
    document.querySelectorAll("[data-drawing-color]").forEach((input) => {
      input.classList.toggle("is-active", input === activeInput);
    });
  }

  function getDrawingContext() {
    return $("drawing-canvas").getContext("2d");
  }

  function getCanvasPoint(event) {
    const canvas = $("drawing-canvas");
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
  }

  function resizeDrawingCanvas(width, height) {
    const canvas = $("drawing-canvas");
    drawingState.width = width;
    drawingState.height = height;
    canvas.width = width;
    canvas.height = height;
    redrawDrawing();
  }

  function updateDrawingResolution() {
    const [width, height] = String($("drawing-resolution").value || "2560x1600").split("x").map(Number);
    if (!width || !height) return;
    resizeDrawingCanvas(width, height);
    setStatus(`Drawing canvas set to ${width} x ${height}.`, "success");
  }

  function redrawDrawing() {
    const ctx = getDrawingContext();
    ctx.clearRect(0, 0, drawingState.width, drawingState.height);
    drawingState.strokes.forEach((stroke) => drawFullStroke(ctx, stroke));
  }

  function drawFullStroke(ctx, stroke) {
    if (!stroke || !stroke.points || !stroke.points.length) return;
    drawStrokePoint(ctx, stroke, stroke.points[0]);
    for (let index = 1; index < stroke.points.length; index += 1) {
      drawStrokeSegment(ctx, stroke, stroke.points[index - 1], stroke.points[index]);
    }
  }

  function applyStrokeStyle(ctx, stroke) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = stroke.mode === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.color || "#111827";
    ctx.fillStyle = stroke.color || "#111827";
    ctx.lineWidth = Math.max(MIN_PEN_SIZE, stroke.sizeRatio * drawingState.height);
  }

  function drawStrokePoint(ctx, stroke, point) {
    applyStrokeStyle(ctx, stroke);
    const radius = Math.max(MIN_PEN_SIZE / 2, (stroke.sizeRatio * drawingState.height) / 2);
    ctx.beginPath();
    ctx.arc(point.x * drawingState.width, point.y * drawingState.height, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawStrokeSegment(ctx, stroke, from, to) {
    applyStrokeStyle(ctx, stroke);
    ctx.beginPath();
    ctx.moveTo(from.x * drawingState.width, from.y * drawingState.height);
    ctx.lineTo(to.x * drawingState.width, to.y * drawingState.height);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  function undoDrawing() {
    if (!drawingState.strokes.length) {
      setStatus("Nothing to undo on the drawing canvas.", "warn");
      return;
    }
    drawingState.strokes.pop();
    redrawDrawing();
    setStatus("Undid the last stroke.", "success");
  }

  function clearDrawing() {
    if (drawingState.strokes.length && !confirm("Clear the drawing canvas?")) return;
    drawingState.strokes = [];
    drawingState.activeStroke = null;
    redrawDrawing();
    setStatus("Cleared the drawing canvas.", "success");
  }

  function exportDrawingImage() {
    const source = $("drawing-canvas");
    const output = document.createElement("canvas");
    output.width = source.width;
    output.height = source.height;
    const ctx = output.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(source, 0, 0);
    return {
      name: `drawing-${output.width}x${output.height}.png`,
      type: "image/png",
      size: 0,
      dataUrl: output.toDataURL("image/png")
    };
  }

  function addDrawingSlide() {
    if (!drawingState.strokes.length) {
      setStatus("Draw something before saving a drawing slide.", "error");
      return;
    }
    const image = exportDrawingImage();
    addSlide({
      type: "drawing",
      title: "Drawing",
      width: drawingState.width,
      height: drawingState.height,
      image
    });
  }

  function addCfuSlide() {
    if (!draft.cfu.image) {
      setStatus("Add a CFU image first.", "error");
      return;
    }
    addSlide({
      type: "cfu",
      title: "Check for Understanding",
      placement: draft.cfu.placement,
      image: draft.cfu.image
    });
  }

  function addPlaceholderSlide() {
    const text = String(draft.placeholder.text || "").trim();
    if (!text) {
      setStatus("Add placeholder text first.", "error");
      return;
    }
    addSlide({ type: "placeholder", title: "Placeholder", text });
  }

  function addMathSlides() {
    const questions = String(draft.math.questions || "").trim();
    const answers = String(draft.math.answers || "").trim();
    if (!questions && !answers) {
      setStatus("Add question or answer LaTeX first.", "error");
      return;
    }
    if (questions) {
      addSlide({ type: "math", title: "Questions", mode: "Questions", latex: questions });
    }
    if (answers) {
      addSlide({ type: "math", title: "Answers", mode: "Answers", latex: answers });
    }
  }

  function moveSlide(id, direction) {
    const index = state.slides.findIndex((slide) => slide.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= state.slides.length) return;
    const [slide] = state.slides.splice(index, 1);
    state.slides.splice(nextIndex, 0, slide);
    persistLessonChange();
    renderPreview();
  }

  function deleteSlide(id) {
    if (selectedPreviewSlideId === id) selectedPreviewSlideId = "";
    state.slides = state.slides.filter((slide) => slide.id !== id);
    persistLessonChange();
    renderPreview();
    setStatus("Slide removed.", "success");
  }

  function toggleSelectedPreviewSlide(id) {
    selectedPreviewSlideId = selectedPreviewSlideId === id ? "" : id;
    renderPreview();
  }

  function renderPreview() {
    const list = $("slide-list");
    $("slide-count").textContent = `${state.slides.length} slide${state.slides.length === 1 ? "" : "s"}`;
    if (selectedPreviewSlideId && !state.slides.some((slide) => slide.id === selectedPreviewSlideId)) {
      selectedPreviewSlideId = "";
    }

    if (!state.slides.length) {
      list.innerHTML = `<div class="empty-state">No local lesson slides yet.</div>`;
      return;
    }

    list.innerHTML = state.slides
      .map((slide, index) => {
        const isSelected = slide.id === selectedPreviewSlideId;
        return `
        <article class="slide-item${isSelected ? " is-selected" : ""}" data-id="${escapeAttr(slide.id)}" role="button" tabindex="0" aria-selected="${isSelected ? "true" : "false"}">
          <div class="slide-toolbar">
            <span>${index + 1}. ${escapeHtml(slide.title || slide.type)}</span>
            <div class="slide-actions">
              <button class="mini-button" type="button" data-action="up">Up</button>
              <button class="mini-button" type="button" data-action="down">Down</button>
              <button class="mini-button" type="button" data-action="delete">Delete</button>
            </div>
          </div>
          ${renderLessonSlide(slide)}
        </article>
      `;
      })
      .join("");

    list.querySelectorAll(".slide-item").forEach((item) => {
      const id = item.dataset.id;
      item.addEventListener("click", (event) => {
        if (event.target.closest(".slide-actions")) return;
        toggleSelectedPreviewSlide(id);
      });
      item.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleSelectedPreviewSlide(id);
      });
      item.querySelector('[data-action="up"]').addEventListener("click", () => moveSlide(id, -1));
      item.querySelector('[data-action="down"]').addEventListener("click", () => moveSlide(id, 1));
      item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteSlide(id));
    });
  }

  function renderLessonSlide(slide, renderOptions) {
    let html = "";
    if (slide.type === "starter") html = renderStarterSlide(slide, renderOptions);
    else if (slide.type === "retrieval") html = renderRetrievalSlide(slide);
    else if (slide.type === "revision") html = renderRevisionSlide(slide);
    else if (slide.type === "example") html = renderExampleSlide(slide);
    else if (slide.type === "worksheet") html = renderWorksheetSlide(slide);
    else if (slide.type === "pdf-page") html = renderPdfPageSlide(slide);
    else if (slide.type === "cfu") html = renderCfuSlide(slide);
    else if (slide.type === "drawing") html = renderDrawingSlide(slide);
    else if (slide.type === "template") html = renderTemplateSlide(slide);
    else if (slide.type === "placeholder") html = renderPlaceholderSlide(slide);
    else if (slide.type === "math") html = renderMathSlide(slide);
    else if (slide.type === "blank") html = renderBlankSlide(slide);
    else if (slide.type === "imported-html") html = renderImportedHtmlSlide(slide);
    else html = `<section class="lesson-slide"><p>Unsupported slide type.</p></section>`;
    return decorateLessonSlide(html, slide);
  }

  function decorateLessonSlide(html, slide) {
    const attrs = `data-builder-slide-id="${escapeAttr(slide.id || "")}" data-builder-slide-type="${escapeAttr(slide.type || "")}"`;
    const withMetadata = html.replace(/<section\s+/, `<section ${attrs} `);
    return injectSlideAnnotations(withMetadata, slide.annotations);
  }

  function renderStarterSlide(slide, renderOptions) {
    const slots = Array.isArray(slide.slots) ? slide.slots : [];
    return `
      <section class="lesson-slide starter-slide">
        <div class="starter-slide-grid">
          ${[0, 1, 2, 3].map((index) => {
            const slot = slots[index] || {};
            const revealKey = `starter-answer-${index}`;
            return `
              <div class="starter-cell">
                <div class="live-starter-image-host" data-live-image-host>
                  ${toggleableImageTag(
                    slot.image,
                    slot.answerImage,
                    "Starter image",
                    "replace",
                    revealKey,
                    revealIsShown(slide, revealKey)
                  )}
                </div>
                ${liveRetrievalButton(slot, index, renderOptions)}
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function liveRetrievalButton(slot, slotIndex, renderOptions) {
    const liveRetrieval = renderOptions && renderOptions.liveRetrieval;
    const lo = String(slot && slot.lo || "").trim();
    if (!liveRetrieval || !liveRetrieval.enabled || !lo) return "";
    return `
      <div class="live-retrieval-controls" data-ignore-annotation>
        <button
          class="live-retrieval-button"
          type="button"
          aria-label="Seen +1"
          title="Seen +1"
          data-ignore-annotation
          data-live-retrieval
          data-live-delta="1"
          data-live-lo="${escapeAttr(lo)}"
          data-live-item-id="${escapeAttr(slot.retrievalItemId || "")}"
          data-live-current-image-slot="${escapeAttr(slot.currentImageSlot || 1)}"
          data-live-slide-index="${escapeAttr(renderOptions.slideIndex || 0)}"
          data-live-slot-index="${escapeAttr(slotIndex)}"
        >+1</button>
        <button
          class="live-retrieval-button"
          type="button"
          aria-label="Seen -1"
          title="Seen -1"
          data-ignore-annotation
          data-live-retrieval
          data-live-delta="-1"
          data-live-lo="${escapeAttr(lo)}"
          data-live-item-id="${escapeAttr(slot.retrievalItemId || "")}"
          data-live-current-image-slot="${escapeAttr(slot.currentImageSlot || 1)}"
          data-live-slide-index="${escapeAttr(renderOptions.slideIndex || 0)}"
          data-live-slot-index="${escapeAttr(slotIndex)}"
        >-1</button>
        <button
          class="live-retrieval-button"
          type="button"
          aria-label="Next retrieval question"
          title="Next retrieval question"
          data-ignore-annotation
          data-live-retrieval-next
          data-live-lo="${escapeAttr(lo)}"
          data-live-item-id="${escapeAttr(slot.retrievalItemId || "")}"
          data-live-current-image-slot="${escapeAttr(slot.currentImageSlot || 1)}"
          data-live-slide-index="${escapeAttr(renderOptions.slideIndex || 0)}"
          data-live-slot-index="${escapeAttr(slotIndex)}"
        >&#8635;</button>
      </div>
    `;
  }

  function renderRetrievalSlide(slide) {
    const los = Array.isArray(slide.los) ? slide.los : [];
    return `
      <section class="lesson-slide retrieval-slide">
        <div>
          <h4>${escapeHtml(slide.title || "Retrieval task")}</h4>
          <ul>${los.map((lo) => `<li>${escapeHtml(lo)}</li>`).join("")}</ul>
        </div>
        <span class="slide-label">Retrieval</span>
      </section>
    `;
  }

  function renderRevisionSlide(slide) {
    const items = Array.isArray(slide.items) ? slide.items.slice(0, 2) : [];
    return `
      <section class="lesson-slide revision-slide">
        <div class="revision-slide-grid">
          ${[0, 1].map((index) => {
            const item = items[index] || null;
            const revealKey = `revision-answer-${index}`;
            return `
              <div class="revision-question-cell" data-lo="${escapeAttr(item ? item.lo : "")}">
                ${item ? toggleableImageTag(
                  item.image,
                  item.answerImage,
                  item.lo || `Revision question ${index + 1}`,
                  "replace",
                  revealKey,
                  revealIsShown(slide, revealKey)
                ) : ""}
              </div>
            `;
          }).join("")}
          <div class="revision-working-area"></div>
        </div>
        <span class="slide-label">Revision</span>
      </section>
    `;
  }

  function renderExampleSlide(slide) {
    const panes = [
      { question: slide.image1, answer: slide.answerImage1, label: "Example image 1" },
      { question: slide.image2, answer: slide.answerImage2, label: "Example image 2" }
    ].map((pane, index) => ({
      ...pane,
      revealKey: `example-answer-${index}`
    })).filter((pane) => pane.question);
    const secondImageShown = revealIsShown(slide, "example-second-image");
    const imageHtml = panes.length > 1
      ? `<div class="example-images">
          <div class="example-image-pane">${exampleQaImagePane(panes[0], revealIsShown(slide, panes[0].revealKey))}</div>
          <div class="example-image-pane example-reveal-region${secondImageShown ? "" : " is-hidden"}" data-example-reveal-region data-reveal-key="example-second-image" aria-hidden="${secondImageShown ? "false" : "true"}">${exampleQaImagePane(panes[1], revealIsShown(slide, panes[1].revealKey))}</div>
        </div>`
      : `<div class="single-image">${exampleQaImagePane(panes[0], panes[0] ? revealIsShown(slide, panes[0].revealKey) : false)}</div>`;
    return `
      <section class="lesson-slide example-slide">
        <div class="lo-bar">
          <span class="lo-bar-text">${escapeHtml(slide.lo || "")}</span>
          ${panes.length > 1 ? `<button class="example-reveal-button" type="button" data-example-reveal aria-expanded="${secondImageShown ? "true" : "false"}">${secondImageShown ? "Hide second image" : "Show second image"}</button>` : ""}
        </div>
        ${imageHtml}
        <span class="slide-label">Example</span>
      </section>
    `;
  }

  function exampleQaImagePane(pane, initiallyShown) {
    if (!pane || !pane.question) return `<div class="empty-state">No image</div>`;
    if (!pane.answer) return imageTag(pane.question, pane.label || "Example image");
    const showingAnswer = !!initiallyShown;
    return `
      <div class="example-qa-block${showingAnswer ? " is-showing-answer" : ""}" data-qa-toggle="below" data-reveal-key="${escapeAttr(pane.revealKey || "")}" aria-expanded="${showingAnswer ? "true" : "false"}">
        <button class="qa-question-button" type="button">
          ${imageTag(pane.question, pane.label || "Example image")}
        </button>
        <div class="example-answer-region${showingAnswer ? "" : " is-hidden"}" data-qa-answer-region aria-hidden="${showingAnswer ? "false" : "true"}">
          ${imageTag(pane.answer, `${pane.label || "Example"} answer`)}
        </div>
      </div>
    `;
  }

  function toggleAnswerImage(control) {
    const mode = control.getAttribute("data-qa-toggle") || "replace";
    const showingAnswer = control.classList.toggle("is-showing-answer");
    if (mode === "below") {
      control.setAttribute("aria-expanded", showingAnswer ? "true" : "false");
      const region = control.querySelector("[data-qa-answer-region]");
      if (region) {
        region.classList.toggle("is-hidden", !showingAnswer);
        region.setAttribute("aria-hidden", showingAnswer ? "false" : "true");
      }
      return;
    }

    control.setAttribute("aria-pressed", showingAnswer ? "true" : "false");
    const label = control.querySelector("[data-qa-toggle-label]");
    if (label) label.textContent = showingAnswer ? "Answer" : "Question";
  }

  function toggleExampleReveal(button) {
    const slide = button.closest(".example-slide");
    const region = slide && slide.querySelector("[data-example-reveal-region]");
    if (!region) return;
    const shouldReveal = region.classList.contains("is-hidden");
    region.classList.toggle("is-hidden", !shouldReveal);
    region.setAttribute("aria-hidden", shouldReveal ? "false" : "true");
    button.setAttribute("aria-expanded", shouldReveal ? "true" : "false");
    button.textContent = shouldReveal ? "Hide second image" : "Show second image";
  }

  function renderWorksheetSlide(slide) {
    const links = [slide.worksheet, slide.answers].filter(Boolean);
    return `
      <section class="lesson-slide worksheet-slide">
        <div>
          <h4>${escapeHtml(slide.title || "Worksheet")}</h4>
          <div class="worksheet-links">
            ${links.map((file) => `<a href="${escapeAttr(file.dataUrl)}" download="${escapeAttr(file.name)}">${escapeHtml(file.name)}</a>`).join("")}
          </div>
        </div>
        <span class="slide-label">Worksheet</span>
      </section>
    `;
  }

  function renderPdfPageSlide(slide) {
    const aspect = normalizeSlideAspect(slide.aspect || (Number(slide.width) / Math.max(1, Number(slide.height) || 1)));
    const orientation = aspect >= 1 ? "landscape" : "portrait";
    return `
      <section class="lesson-slide pdf-page-slide ${escapeAttr(orientation)}" style="--slide-aspect: ${escapeAttr(aspect)};" data-slide-aspect="${escapeAttr(aspect)}">
        ${imageTag(slide.image, `PDF page ${slide.pageNumber || ""}`)}
        <span class="slide-label">${escapeHtml(slide.sourceName || "PDF")} ${escapeHtml(slide.pageNumber || "")}/${escapeHtml(slide.pageCount || "")}</span>
      </section>
    `;
  }

  function renderCfuSlide(slide) {
    const placement = slide.placement || "full";
    return `
      <section class="lesson-slide cfu-slide ${escapeAttr(placement)}">
        <div class="cfu-image-wrap">${imageTag(slide.image, "CFU image")}</div>
        <span class="slide-label">CFU</span>
      </section>
    `;
  }

  function renderDrawingSlide(slide) {
    return `
      <section class="lesson-slide drawing-slide">
        ${imageTag(slide.image, "Drawing")}
        <span class="slide-label">${escapeHtml(slide.width || "")} x ${escapeHtml(slide.height || "")}</span>
      </section>
    `;
  }

  function renderTemplateSlide(slide) {
    const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
    return `
      <section class="lesson-slide template-slide">
        <div class="template-slide-inner">
          <h4>${escapeHtml(slide.title || "Template")}</h4>
          <ul>${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>
        </div>
        <span class="slide-label">Template</span>
      </section>
    `;
  }

  function renderPlaceholderSlide(slide) {
    return `
      <section class="lesson-slide placeholder-slide">
        <p>${escapeHtml(slide.text || "")}</p>
        <span class="slide-label">Placeholder</span>
      </section>
    `;
  }

  function renderMathSlide(slide) {
    const source = String(slide.latex || "").trim();
    return `
      <section class="lesson-slide math-slide rendered-math-slide">
        <div class="math-slide-inner">
          <h4>${escapeHtml(slide.mode || "LaTeX")}</h4>
          <div class="latex-rendered">${renderLatexDocument(source)}</div>
        </div>
        <span class="slide-label">LaTeX</span>
      </section>
    `;
  }

  function renderBlankSlide() {
    return `
      <section class="lesson-slide blank-slide">
        <span class="slide-label">Blank</span>
      </section>
    `;
  }

  function renderImportedHtmlSlide(slide) {
    const className = sanitizeImportedSlideClass(slide.className);
    const html = String(slide.html || `<div class="empty-state">Imported slide</div>`);
    return `
      <section class="${escapeAttr(className)}">
        ${html}
      </section>
    `;
  }

  function sanitizeImportedSlideClass(value) {
    const className = String(value || "")
      .split(/\s+/)
      .map((part) => part.replace(/[^A-Za-z0-9_-]/g, ""))
      .filter(Boolean)
      .join(" ");
    return className.includes("lesson-slide") ? className : `lesson-slide ${className || "imported-html-slide"}`;
  }

  function injectSlideAnnotations(html, annotations) {
    const layer = renderAnnotationLayer(annotations);
    if (!layer) return html;
    const end = html.lastIndexOf("</section>");
    if (end < 0) return html + layer;
    return `${html.slice(0, end)}${layer}${html.slice(end)}`;
  }

  function renderAnnotationLayer(annotations) {
    const strokes = normalizeAnnotationStrokes(annotations);
    if (!strokes.length) return "";
    return `<svg class="annotation-svg static-annotation-svg" viewBox="0 0 ${SLIDE_VIEWBOX_WIDTH} ${SLIDE_VIEWBOX_HEIGHT}" preserveAspectRatio="none" aria-label="Imported annotation layer">${strokes.map(renderAnnotationPath).join("")}</svg>`;
  }

  function renderAnnotationPath(stroke) {
    return `<path d="${escapeAttr(annotationPathFromPoints(stroke.points))}" fill="none" stroke="${escapeAttr(stroke.color || "#2563eb")}" stroke-width="${escapeAttr(stroke.width || 6)}" stroke-linecap="round" stroke-linejoin="round"></path>`;
  }

  function annotationPathFromPoints(points) {
    const safePoints = Array.isArray(points) ? points : [];
    if (!safePoints.length) return "";
    if (safePoints.length === 1) {
      return `M${roundAnnotationValue(safePoints[0].x)} ${roundAnnotationValue(safePoints[0].y)} l0.1 0`;
    }
    if (safePoints.length === 2) {
      return `M${roundAnnotationValue(safePoints[0].x)} ${roundAnnotationValue(safePoints[0].y)} L${roundAnnotationValue(safePoints[1].x)} ${roundAnnotationValue(safePoints[1].y)}`;
    }

    let d = `M${roundAnnotationValue(safePoints[0].x)} ${roundAnnotationValue(safePoints[0].y)}`;
    for (let index = 1; index < safePoints.length - 1; index += 1) {
      const mid = {
        x: (Number(safePoints[index].x) + Number(safePoints[index + 1].x)) / 2,
        y: (Number(safePoints[index].y) + Number(safePoints[index + 1].y)) / 2
      };
      d += ` Q${roundAnnotationValue(safePoints[index].x)} ${roundAnnotationValue(safePoints[index].y)} ${roundAnnotationValue(mid.x)} ${roundAnnotationValue(mid.y)}`;
    }
    const last = safePoints[safePoints.length - 1];
    d += ` L${roundAnnotationValue(last.x)} ${roundAnnotationValue(last.y)}`;
    return d;
  }

  function roundAnnotationValue(value) {
    return Math.round(Number(value || 0) * 10) / 10;
  }

  function normalizeAnnotationStrokes(strokes) {
    if (!Array.isArray(strokes)) return [];
    return strokes
      .map((stroke) => {
        const points = Array.isArray(stroke && stroke.points)
          ? stroke.points
              .map((point) => ({
                x: Math.max(0, Math.min(SLIDE_VIEWBOX_WIDTH, Number(point && point.x) || 0)),
                y: Math.max(0, Math.min(SLIDE_VIEWBOX_HEIGHT, Number(point && point.y) || 0))
              }))
              .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
          : [];
        if (!points.length) return null;
        return {
          id: String(stroke.id || uid("stroke")),
          color: /^#[0-9a-f]{3,8}$/i.test(String(stroke.color || "")) ? stroke.color : "#2563eb",
          width: Math.max(1, Math.min(120, Number(stroke.width) || 6)),
          createdAt: Number(stroke.createdAt) || Date.now(),
          points
        };
      })
      .filter(Boolean);
  }

  function renderMathLivePreview() {
    renderLatexPreviewSurface("math-questions-preview", draft.math.questions, "Questions preview");
    renderLatexPreviewSurface("math-answers-preview", draft.math.answers, "Answers preview");
  }

  function renderLatexPreviewSurface(id, source, label) {
    const surface = $(id);
    if (!surface) return;
    const text = String(source || "").trim();
    surface.innerHTML = text
      ? `<div class="latex-rendered">${renderLatexDocument(text)}</div>`
      : `<div class="empty-state">${escapeHtml(label || "Preview")}</div>`;
  }

  function renderLatexDocument(source) {
    const text = String(source || "").replace(/\r\n?/g, "\n").trim();
    if (!text) return `<div class="empty-state">No LaTeX</div>`;
    return tokenizeLatexDocument(text).map((block) => {
      if (block.type === "display") {
        return renderLatexMath(block.value, true);
      }
      if (block.type === "align") {
        return renderLatexAlign(block.value);
      }
      return renderLatexTextBlock(block.value);
    }).join("");
  }

  function tokenizeLatexDocument(text) {
    const blocks = [];
    let buffer = "";
    let index = 0;

    const flushText = () => {
      if (buffer.trim()) blocks.push({ type: "text", value: buffer });
      buffer = "";
    };

    while (index < text.length) {
      const displayStart = findDisplayStart(text, index);
      if (!displayStart) {
        buffer += text.slice(index);
        break;
      }

      buffer += text.slice(index, displayStart.index);
      flushText();

      const closeIndex = text.indexOf(displayStart.close, displayStart.index + displayStart.open.length);
      if (closeIndex < 0) {
        buffer += text.slice(displayStart.index);
        break;
      }

      const value = text.slice(displayStart.index + displayStart.open.length, closeIndex).trim();
      blocks.push({ type: displayStart.align ? "align" : "display", value });
      index = closeIndex + displayStart.close.length;
    }

    flushText();
    return blocks;
  }

  function findDisplayStart(text, fromIndex) {
    const candidates = [
      { open: "\\begin{align*}", close: "\\end{align*}", align: true },
      { open: "\\begin{align}", close: "\\end{align}", align: true },
      { open: "\\begin{aligned}", close: "\\end{aligned}", align: true },
      { open: "\\begin{gather*}", close: "\\end{gather*}", align: true },
      { open: "\\begin{gather}", close: "\\end{gather}", align: true },
      { open: "\\begin{equation*}", close: "\\end{equation*}" },
      { open: "\\begin{equation}", close: "\\end{equation}" },
      { open: "$$", close: "$$" },
      { open: "\\[", close: "\\]" }
    ];

    return candidates
      .map((candidate) => ({ ...candidate, index: text.indexOf(candidate.open, fromIndex) }))
      .filter((candidate) => candidate.index >= 0)
      .sort((a, b) => a.index - b.index)[0] || null;
  }

  function renderLatexTextBlock(text) {
    return text
      .trim()
      .split(/\n{2,}/)
      .map((paragraph) => renderLatexParagraph(paragraph))
      .join("");
  }

  function renderLatexParagraph(paragraph) {
    const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return "";

    const listItems = lines.map((line) => {
      const item = line.match(/^(?:[-*]\s+|\\item\s+)(.+)$/);
      return item ? item[1] : null;
    });
    if (listItems.every(Boolean)) {
      return `<ul class="latex-list">${listItems.map((item) => `<li>${renderInlineLatexText(item)}</li>`).join("")}</ul>`;
    }

    return `<p>${lines.map((line) => renderInlineLatexText(line)).join("<br>")}</p>`;
  }

  function renderInlineLatexText(text) {
    const parts = [];
    let buffer = "";
    let index = 0;

    const flushText = () => {
      if (buffer) {
        parts.push(escapeHtml(buffer));
        buffer = "";
      }
    };

    while (index < text.length) {
      if (text.startsWith("\\(", index)) {
        const close = text.indexOf("\\)", index + 2);
        if (close >= 0) {
          flushText();
          parts.push(renderLatexMath(text.slice(index + 2, close), false));
          index = close + 2;
          continue;
        }
      }

      if (text[index] === "$" && text[index + 1] !== "$") {
        const close = findClosingInlineDollar(text, index + 1);
        if (close >= 0) {
          flushText();
          parts.push(renderLatexMath(text.slice(index + 1, close), false));
          index = close + 1;
          continue;
        }
      }

      buffer += text[index];
      index += 1;
    }

    flushText();
    return parts.join("");
  }

  function findClosingInlineDollar(text, fromIndex) {
    for (let index = fromIndex; index < text.length; index += 1) {
      if (text[index] === "$" && text[index - 1] !== "\\") return index;
    }
    return -1;
  }

  function renderLatexAlign(source) {
    const rows = String(source || "")
      .split(/\\\\/)
      .map((row) => row.replace(/&/g, "").trim())
      .filter(Boolean);

    if (!rows.length) return "";
    return `<div class="latex-align">${rows.map((row) => `<div class="latex-align-row">${renderLatexMath(row, true)}</div>`).join("")}</div>`;
  }

  function renderLatexMath(source, display) {
    const parser = createLatexParser(String(source || ""));
    return `<span class="latex-math ${display ? "latex-display" : "latex-inline"}">${parser.parse()}</span>`;
  }

  function createLatexParser(source) {
    const text = source.replace(/\r\n?/g, "\n");
    let index = 0;

    const symbolMap = {
      alpha: "&alpha;",
      beta: "&beta;",
      gamma: "&gamma;",
      delta: "&delta;",
      epsilon: "&epsilon;",
      varepsilon: "&epsilon;",
      zeta: "&zeta;",
      eta: "&eta;",
      theta: "&theta;",
      vartheta: "&theta;",
      iota: "&iota;",
      kappa: "&kappa;",
      lambda: "&lambda;",
      mu: "&mu;",
      nu: "&nu;",
      xi: "&xi;",
      pi: "&pi;",
      rho: "&rho;",
      sigma: "&sigma;",
      tau: "&tau;",
      upsilon: "&upsilon;",
      phi: "&phi;",
      varphi: "&phi;",
      chi: "&chi;",
      psi: "&psi;",
      omega: "&omega;",
      Gamma: "&Gamma;",
      Delta: "&Delta;",
      Theta: "&Theta;",
      Lambda: "&Lambda;",
      Xi: "&Xi;",
      Pi: "&Pi;",
      Sigma: "&Sigma;",
      Phi: "&Phi;",
      Psi: "&Psi;",
      Omega: "&Omega;",
      cdot: "&middot;",
      times: "&times;",
      div: "&divide;",
      pm: "&plusmn;",
      mp: "&#8723;",
      le: "&le;",
      leq: "&le;",
      ge: "&ge;",
      geq: "&ge;",
      neq: "&ne;",
      ne: "&ne;",
      approx: "&asymp;",
      equiv: "&equiv;",
      propto: "&prop;",
      infty: "&infin;",
      partial: "&part;",
      nabla: "&nabla;",
      degree: "&deg;",
      circ: "&#8728;",
      angle: "&ang;",
      parallel: "&#8741;",
      perp: "&perp;",
      in: "&isin;",
      notin: "&notin;",
      subset: "&sub;",
      subseteq: "&sube;",
      superset: "&sup;",
      superseteq: "&supe;",
      cup: "&cup;",
      cap: "&cap;",
      emptyset: "&empty;",
      forall: "&forall;",
      exists: "&exist;",
      to: "&rarr;",
      rightarrow: "&rarr;",
      leftarrow: "&larr;",
      leftrightarrow: "&harr;",
      implies: "&rArr;",
      therefore: "&there4;",
      int: "&int;",
      sum: "&sum;",
      prod: "&prod;"
    };
    const functionNames = new Set(["sin", "cos", "tan", "sec", "csc", "cot", "log", "ln", "exp", "lim", "min", "max"]);

    function parse(stopChar) {
      const atoms = [];
      while (index < text.length) {
        if (stopChar && text[index] === stopChar) {
          index += 1;
          break;
        }

        if (text[index] === "^" || text[index] === "_") {
          atoms.push(escapeHtml(text[index]));
          index += 1;
          continue;
        }

        const atom = readAtom();
        if (atom) atoms.push(attachScripts(atom));
      }
      return atoms.join("");
    }

    function attachScripts(base) {
      let sup = "";
      let sub = "";
      skipSpaces();
      while (text[index] === "^" || text[index] === "_") {
        const type = text[index];
        index += 1;
        if (type === "^") sup = readScriptArgument();
        if (type === "_") sub = readScriptArgument();
        skipSpaces();
      }

      if (!sup && !sub) return base;
      return `<span class="latex-script"><span class="latex-base">${base}</span>${sub ? `<sub>${sub}</sub>` : ""}${sup ? `<sup>${sup}</sup>` : ""}</span>`;
    }

    function readAtom() {
      const char = text[index];
      if (!char) return "";

      if (/\s/.test(char)) {
        index += 1;
        return " ";
      }

      if (char === "{") {
        index += 1;
        return `<span class="latex-group">${parse("}")}</span>`;
      }

      if (char === "}") {
        index += 1;
        return "";
      }

      if (char === "\\") {
        return readCommand();
      }

      if (/[A-Za-z]+/.test(char)) {
        const word = readWhile(/[A-Za-z]/);
        return `<span class="latex-var">${escapeHtml(word)}</span>`;
      }

      if (/[0-9.]+/.test(char)) {
        const number = readWhile(/[0-9.]/);
        return `<span class="latex-number">${escapeHtml(number)}</span>`;
      }

      index += 1;
      return `<span class="latex-operator">${escapeHtml(char)}</span>`;
    }

    function readCommand() {
      index += 1;
      if (index >= text.length) return "";

      if (!/[A-Za-z]/.test(text[index])) {
        const escaped = text[index];
        index += 1;
        return `<span class="latex-operator">${escapeHtml(escaped)}</span>`;
      }

      const command = readWhile(/[A-Za-z]/);

      if (command === "frac" || command === "dfrac" || command === "tfrac") {
        const numerator = readRequiredGroup();
        const denominator = readRequiredGroup();
        return `<span class="latex-frac"><span class="latex-frac-num">${numerator}</span><span class="latex-frac-den">${denominator}</span></span>`;
      }

      if (command === "sqrt") {
        const degree = readOptionalGroup("[", "]");
        const body = readRequiredGroup();
        return `<span class="latex-root">${degree ? `<sup>${degree}</sup>` : ""}<span class="latex-radical">&radic;</span><span class="latex-root-body">${body}</span></span>`;
      }

      if (command === "text") {
        return `<span class="latex-text">${escapeHtml(readRawGroup())}</span>`;
      }

      if (command === "mathrm" || command === "operatorname") {
        return `<span class="latex-text">${readRequiredGroup()}</span>`;
      }

      if (command === "mathbf") {
        return `<span class="latex-bold">${readRequiredGroup()}</span>`;
      }

      if (command === "mathit") {
        return `<span class="latex-italic">${readRequiredGroup()}</span>`;
      }

      if (command === "hat" || command === "bar" || command === "vec" || command === "overline") {
        return `<span class="latex-accent latex-accent-${escapeAttr(command)}">${readRequiredGroup()}</span>`;
      }

      if (command === "left" || command === "right") {
        skipSpaces();
        if (text[index] === ".") {
          index += 1;
          return "";
        }
        return readAtom();
      }

      if (command === "quad") return `<span class="latex-quad"></span>`;
      if (command === "qquad") return `<span class="latex-qquad"></span>`;
      if (command === "," || command === ";" || command === ":" || command === "!") return " ";

      if (symbolMap[command]) {
        return `<span class="latex-symbol">${symbolMap[command]}</span>`;
      }

      if (functionNames.has(command)) {
        return `<span class="latex-fn">${escapeHtml(command)}</span>`;
      }

      return `<span class="latex-command">${escapeHtml(command)}</span>`;
    }

    function readScriptArgument() {
      skipSpaces();
      if (text[index] === "{") {
        index += 1;
        return parse("}");
      }
      return readAtom();
    }

    function readRequiredGroup() {
      skipSpaces();
      if (text[index] !== "{") return readAtom();
      index += 1;
      return parse("}");
    }

    function readRawGroup() {
      skipSpaces();
      if (text[index] !== "{") return "";
      index += 1;
      let depth = 1;
      const start = index;
      while (index < text.length && depth > 0) {
        if (text[index] === "{") depth += 1;
        if (text[index] === "}") depth -= 1;
        index += 1;
      }
      return text.slice(start, Math.max(start, index - 1));
    }

    function readOptionalGroup(open, close) {
      skipSpaces();
      if (text[index] !== open) return "";
      index += 1;
      const start = index;
      while (index < text.length && text[index] !== close) index += 1;
      const value = text.slice(start, index);
      if (text[index] === close) index += 1;
      return createLatexParser(value).parse();
    }

    function readWhile(pattern) {
      const start = index;
      while (index < text.length && pattern.test(text[index])) index += 1;
      return text.slice(start, index);
    }

    function skipSpaces() {
      while (index < text.length && /\s/.test(text[index])) index += 1;
    }

    return { parse: () => parse("") };
  }

  function imageTag(image, alt) {
    if (!image || !image.dataUrl) {
      return `<div class="empty-state">No image</div>`;
    }
    return `<div class="slide-image-frame"><img class="slide-image-fit" src="${escapeAttr(image.dataUrl)}" alt="${escapeAttr(alt || image.name || "Image")}" draggable="false"></div>`;
  }

  function presentationReveals(slide) {
    const presentationState = slide && slide.presentationState;
    if (!presentationState || presentationState.version !== 1) return null;
    if (!presentationState.reveals || typeof presentationState.reveals !== "object" || Array.isArray(presentationState.reveals)) {
      return null;
    }
    return presentationState.reveals;
  }

  function hasPresentationState(slide) {
    return presentationReveals(slide) !== null;
  }

  function revealIsShown(slide, revealKey) {
    const reveals = presentationReveals(slide);
    return !!(reveals && reveals[revealKey] === true);
  }

  function toggleableImageTag(questionImage, answerImage, alt, mode, revealKey, initiallyShown) {
    if (!answerImage || !answerImage.dataUrl) return imageTag(questionImage, alt);
    const showingAnswer = !!initiallyShown;
    return `
      <button class="qa-toggle qa-toggle-${escapeAttr(mode || "replace")}${showingAnswer ? " is-showing-answer" : ""}" type="button" data-qa-toggle="${escapeAttr(mode || "replace")}" data-reveal-key="${escapeAttr(revealKey || "")}" aria-pressed="${showingAnswer ? "true" : "false"}">
        <span class="qa-toggle-label" data-qa-toggle-label>${showingAnswer ? "Answer" : "Question"}</span>
        <span class="qa-image-layer qa-question-layer">${imageTag(questionImage, alt)}</span>
        <span class="qa-image-layer qa-answer-layer">${imageTag(answerImage, `${alt || "Image"} answer`)}</span>
      </button>
    `;
  }

  function normalizeSlideAspect(value) {
    const aspect = Number(value);
    if (!Number.isFinite(aspect) || aspect <= 0) return 16 / 10;
    return Math.max(0.45, Math.min(2.4, Math.round(aspect * 10000) / 10000));
  }

  function exportJson() {
    const payload = {
      lessonBuilder: state,
      exportedAt: new Date().toISOString()
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `${sanitizeFilePart(state.title)}.lesson.json`,
      "application/json"
    );
    setStatus("Exported lesson JSON.", "success");
  }

  function importJson(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        state = normalizeImportedState(JSON.parse(String(reader.result || "{}")));
        clearActiveLessonTracking();
        await persistNow(SYNC_ALL);
        syncStateFields();
        renderAll();
        renderSavedLessons();
        setStatus("Imported lesson JSON.", "success");
      } catch (err) {
        setStatus("Could not import that JSON file.", "error");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function importHtml(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        state = importStateFromStandaloneHtml(String(reader.result || ""), state);
        clearActiveLessonTracking();
        await persistNow(SYNC_ALL);
        syncStateFields();
        renderAll();
        renderSavedLessons();
        setStatus(`Imported ${state.slides.length} slide${state.slides.length === 1 ? "" : "s"} from HTML.`, "success");
      } catch (err) {
        console.error(err);
        setStatus("Could not import that HTML lesson.", "error");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function exportFullBackup() {
    const payload = {
      lessonBuilder: state,
      exportedAt: new Date().toISOString(),
      backupKind: "full-local-lesson-builder-backup"
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `${sanitizeFilePart(state.title)}.lesson-builder-backup.json`,
      "application/json"
    );
    setStatus("Exported a full local backup.", "success");
  }

  function handleLegacyTrackerChoice(event) {
    legacyImport.trackerFile = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    renderLegacyImportSummary();
    event.target.value = "";
  }

  function handleLegacyImagesChoice(event) {
    legacyImport.imageFiles = Array.from(event.target.files || [])
      .filter((file) => file && (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name)));
    renderLegacyImportSummary();
    event.target.value = "";
  }

  function renderLegacyImportSummary(summary) {
    const el = $("legacy-import-summary");
    if (!el) return;
    if (summary) {
      el.innerHTML = summary;
      return;
    }
    const tracker = legacyImport.trackerFile ? legacyImport.trackerFile.name : "No tracker selected";
    const images = legacyImport.imageFiles.length
      ? `${legacyImport.imageFiles.length} image file${legacyImport.imageFiles.length === 1 ? "" : "s"} selected`
      : "No image folder selected";
    el.innerHTML = `<strong>${escapeHtml(tracker)}</strong><br>${escapeHtml(images)}`;
  }

  async function importLegacyGoogleTracker() {
    if (!legacyImport.trackerFile) {
      setStatus("Choose the exported Google tracker spreadsheet first.", "error");
      return;
    }
    if (!legacyImport.imageFiles.length) {
      setStatus("Choose the LO Images folder before importing.", "error");
      return;
    }
    if (!window.JSZip) {
      setStatus("The local XLSX reader did not load. Check vendor/jszip.min.js is present.", "error");
      return;
    }
    if (state.retrievalItems.length && !confirm("Importing the Google tracker will replace the current retrieval bank. Lesson slides will be kept. Continue?")) {
      return;
    }

    const importButton = $("legacy-import-run");
    importButton.disabled = true;
    setStatus("Reading Google tracker locally...", "warn");
    renderLegacyImportSummary(`<strong>Reading ${escapeHtml(legacyImport.trackerFile.name)}</strong><br>Preparing local import...`);

    try {
      const workbook = await readXlsxWorkbook(legacyImport.trackerFile);
      const result = await buildLegacyRetrievalImport(workbook, legacyImport.imageFiles);
      if (!result.items.length) {
        setStatus("No retrieval rows were found in that workbook.", "error");
        renderLegacyImportSummary();
        return;
      }

      state.retrievalItems = result.items;
      state.classNames = uniqueStrings([...result.classes, ...state.classNames, ...DEFAULT_CLASSES]);
      if (!state.className && result.classes.length) state.className = result.classes[0];
      renderLegacyImportSummary(`<strong>Saving local retrieval bank...</strong><br>${escapeHtml(result.items.length)} rows and ${escapeHtml(result.stats.matchedImageSlots)} images are being stored in this browser.`);
      await persistNow(SYNC_ALL);
      syncStateFields();
      renderAll();
      renderLegacyImportSummary(formatLegacyImportSummary(result.stats));
      setStatus(`Imported ${result.items.length} retrieval rows and ${result.stats.matchedImageSlots} images locally.`, "success");
    } catch (err) {
      console.error(err);
      setStatus("Could not import the Google tracker. Check the .xlsx and image folder match the export.", "error");
      renderLegacyImportSummary();
    } finally {
      importButton.disabled = false;
    }
  }

  async function readXlsxWorkbook(file) {
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const workbookXml = await readZipText(zip, "xl/workbook.xml");
    const relsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels");
    const workbookDoc = parseXml(workbookXml);
    const relsDoc = parseXml(relsXml);
    const rels = new Map(elementsByLocalName(relsDoc, "Relationship")
      .map((rel) => [rel.getAttribute("Id"), rel.getAttribute("Target")]));
    const sharedStrings = await readSharedStrings(zip);
    const sheets = [];

    for (const sheetEl of elementsByLocalName(workbookDoc, "sheet")) {
      const name = sheetEl.getAttribute("name") || "Sheet";
      const relId = sheetEl.getAttribute("r:id") || sheetEl.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      const target = rels.get(relId);
      if (!target) continue;
      const path = normalizeZipPath("xl", target);
      sheets.push({
        name,
        rows: await readWorksheetRows(zip, path, sharedStrings)
      });
    }

    return { sheets };
  }

  async function readSharedStrings(zip) {
    const file = zip.file("xl/sharedStrings.xml");
    if (!file) return [];
    const doc = parseXml(await file.async("text"));
    return elementsByLocalName(doc, "si").map((si) => elementsByLocalName(si, "t").map((t) => t.textContent || "").join(""));
  }

  async function readWorksheetRows(zip, path, sharedStrings) {
    const doc = parseXml(await readZipText(zip, path));
    const rows = [];
    elementsByLocalName(doc, "row").forEach((rowEl) => {
      const rowIndex = Math.max(0, Number(rowEl.getAttribute("r")) - 1);
      const row = rows[rowIndex] || [];
      elementsByLocalName(rowEl, "c").forEach((cellEl) => {
        const ref = cellEl.getAttribute("r") || "";
        const colIndex = columnIndexFromCellRef(ref);
        if (colIndex < 0) return;
        row[colIndex] = readCellValue(cellEl, sharedStrings);
      });
      rows[rowIndex] = row;
    });
    return rows.filter((row) => row && row.some((cell) => String(cell ?? "").trim() !== ""));
  }

  function readCellValue(cellEl, sharedStrings) {
    const type = cellEl.getAttribute("t") || "";
    if (type === "inlineStr") {
      const inline = firstElementByLocalName(cellEl, "is");
      return inline ? inline.textContent || "" : "";
    }
    const valueEl = firstElementByLocalName(cellEl, "v");
    const raw = valueEl ? valueEl.textContent || "" : "";
    if (type === "s") return sharedStrings[Number(raw)] || "";
    if (type === "str") return raw;
    if (type === "b") return raw === "1";
    const num = Number(raw);
    return raw !== "" && Number.isFinite(num) ? num : raw;
  }

  function parseXml(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) {
      throw new Error("Could not parse workbook XML.");
    }
    return doc;
  }

  function elementsByLocalName(root, localName) {
    return Array.from(root.getElementsByTagNameNS("*", localName));
  }

  function firstElementByLocalName(root, localName) {
    return elementsByLocalName(root, localName)[0] || null;
  }

  async function readZipText(zip, path) {
    const file = zip.file(path);
    if (!file) throw new Error(`Missing XLSX part: ${path}`);
    return file.async("text");
  }

  function normalizeZipPath(base, target) {
    const raw = String(target || "");
    const combined = raw.startsWith("/") ? raw.slice(1) : `${base}/${raw}`;
    const parts = [];
    combined.split("/").forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") parts.pop();
      else parts.push(part);
    });
    return parts.join("/");
  }

  function columnIndexFromCellRef(ref) {
    const match = String(ref || "").match(/^[A-Z]+/i);
    if (!match) return -1;
    return match[0].toUpperCase().split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
  }

  async function buildLegacyRetrievalImport(workbook, imageFiles) {
    const filesByName = new Map(imageFiles.map((file) => [file.name.toLowerCase(), file]));
    const trackerRefs = parseLegacyImageReferences(workbook);
    const imagesByLoId = buildLegacyImageReferenceMap(trackerRefs, filesByName);
    const filenameOnlySlots = addFilenameOnlyImageReferences(filesByName, imagesByLoId);
    const classes = [];
    const items = [];
    const imageCache = new Map();
    const stats = {
      classes: 0,
      items: 0,
      matchedImageSlots: 0,
      missingImageFiles: 0,
      filenameOnlySlots,
      trackerReferenceRows: trackerRefs.length
    };

    for (const sheet of workbook.sheets) {
      if (LEGACY_IGNORED_SHEETS.has(normalizeClassName(sheet.name))) continue;
      const rows = sheet.rows || [];
      if (rows.length < 2) continue;
      const header = rows[0] || [];
      const loIndex = findHeaderIndex(header, ["lo", "learning objective"]);
      const spacingIndex = findHeaderIndex(header, ["spacing factor", "spacing"]);
      const lastSeenIndex = findHeaderIndex(header, ["last seen", "last taught"]);
      const seenCountIndex = findHeaderIndex(header, ["seen count", "seen"]);
      if (loIndex < 0) continue;

      classes.push(sheet.name);
      for (const row of rows.slice(1)) {
        const lo = cleanCell(row[loIndex]);
        if (!lo) continue;
        const loId = extractLegacyLoId(lo);
        const refs = loId ? imagesByLoId.get(normalizeLegacyLoId(loId)) : null;
        const images = emptyRetrievalImages();
        if (refs) {
          for (let index = 0; index < 8; index += 1) {
            const ref = refs[index];
            if (!ref) continue;
            const file = filesByName.get(String(ref.fileName || "").toLowerCase());
            if (!file) {
              stats.missingImageFiles += 1;
              continue;
            }
            images[index] = await imageFromLegacyFile(file, imageCache);
            stats.matchedImageSlots += 1;
            if (stats.matchedImageSlots % 100 === 0) {
              renderLegacyImportSummary(`<strong>Reading local images...</strong><br>${stats.matchedImageSlots} images matched so far.`);
              await waitForUi();
            }
          }
        }
        items.push(normalizeRetrievalItem({
          id: uid("lo"),
          className: sheet.name,
          legacyLoId: loId,
          lo,
          spacingFactor: spacingIndex >= 0 ? parseLegacyNumber(row[spacingIndex], 1) : 1,
          lastTaught: lastSeenIndex >= 0 ? parseLegacyDate(row[lastSeenIndex]) : todayIso(),
          seenCount: seenCountIndex >= 0 ? Math.max(0, Math.round(parseLegacyNumber(row[seenCountIndex], 0))) : 0,
          images,
          selected: false
        }, sheet.name));
      }
    }

    stats.classes = uniqueStrings(classes).length;
    stats.items = items.length;
    return { items, classes: uniqueStrings(classes), stats };
  }

  function parseLegacyImageReferences(workbook) {
    const sheet = workbook.sheets.find((entry) => normalizeClassName(entry.name) === "image references");
    if (!sheet || !sheet.rows || sheet.rows.length < 2) return [];
    const header = sheet.rows[0] || [];
    const loIdIndex = findHeaderIndex(header, ["lo id"]);
    const loTextIndex = findHeaderIndex(header, ["lo text", "lo"]);
    const seenIndex = findHeaderIndex(header, ["seen count", "seen"]);
    const fileNameIndex = findHeaderIndex(header, ["file name", "filename"]);
    const classIndex = findHeaderIndex(header, ["class name", "class"]);
    return sheet.rows.slice(1).map((row) => {
      const loText = cleanCell(row[loTextIndex]);
      return {
        loId: cleanCell(row[loIdIndex]) || extractLegacyLoId(loText),
        loText,
        seenCount: Math.round(parseLegacyNumber(row[seenIndex], 0)),
        fileName: cleanCell(row[fileNameIndex]),
        className: cleanCell(row[classIndex])
      };
    }).filter((ref) => ref.loId && ref.seenCount >= 1 && ref.seenCount <= 8 && ref.fileName);
  }

  function buildLegacyImageReferenceMap(refs, filesByName) {
    const imagesByLoId = new Map();
    refs.forEach((ref) => {
      const key = normalizeLegacyLoId(ref.loId);
      if (!key) return;
      if (!imagesByLoId.has(key)) imagesByLoId.set(key, Array.from({ length: 8 }, () => null));
      const slots = imagesByLoId.get(key);
      const index = ref.seenCount - 1;
      const fileName = String(ref.fileName || "");
      slots[index] = {
        fileName,
        source: filesByName.has(fileName.toLowerCase()) ? "tracker" : "missing"
      };
    });
    return imagesByLoId;
  }

  function addFilenameOnlyImageReferences(filesByName, imagesByLoId) {
    let added = 0;
    filesByName.forEach((file) => {
      const parsed = parseLegacyImageFileName(file.name);
      if (!parsed) return;
      if (!imagesByLoId.has(parsed.loId)) imagesByLoId.set(parsed.loId, Array.from({ length: 8 }, () => null));
      const slots = imagesByLoId.get(parsed.loId);
      const index = parsed.seenCount - 1;
      if (!slots[index]) {
        slots[index] = { fileName: file.name, source: "filename" };
        added += 1;
      }
    });
    return added;
  }

  function parseLegacyImageFileName(fileName) {
    const match = String(fileName || "").match(/^([^_]+)_seen([1-8])_/i);
    if (!match) return null;
    return {
      loId: normalizeLegacyLoId(match[1]),
      seenCount: Number(match[2])
    };
  }

  async function imageFromLegacyFile(file, cache) {
    const key = file.name.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const image = await readFileAsDataUrl(file);
    cache.set(key, image);
    return image;
  }

  function findHeaderIndex(header, names) {
    const normalized = header.map((cell) => normalizeClassName(cell));
    return normalized.findIndex((name) => names.some((target) => name === normalizeClassName(target)));
  }

  function cleanCell(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function parseLegacyNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function parseLegacyDate(value) {
    if (isIsoDate(value)) return String(value);
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) return excelSerialToIso(numeric);
    const parsed = new Date(String(value || ""));
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return state.teachingDate || todayIso();
  }

  function excelSerialToIso(serial) {
    const millis = Date.UTC(1899, 11, 30) + Math.round(Number(serial) * 86400000);
    const date = new Date(millis);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function extractLegacyLoId(lo) {
    const firstToken = String(lo || "").trim().split(/[\s:]+/)[0] || "";
    return /\d/.test(firstToken) ? firstToken.replace(/[^a-z0-9]/gi, "") : "";
  }

  function normalizeLegacyLoId(loId) {
    return String(loId || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  }

  function formatLegacyImportSummary(stats) {
    return [
      `<strong>Imported ${escapeHtml(stats.items)} retrieval rows across ${escapeHtml(stats.classes)} class tabs.</strong>`,
      `${escapeHtml(stats.matchedImageSlots)} local image slots matched.`,
      `${escapeHtml(stats.filenameOnlySlots)} image slots recovered from file names outside the tracker references.`,
      stats.missingImageFiles ? `${escapeHtml(stats.missingImageFiles)} referenced image file${stats.missingImageFiles === 1 ? "" : "s"} missing from the selected folder.` : "No referenced image files were missing."
    ].join("<br>");
  }

  function waitForUi() {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  function importStateFromStandaloneHtml(html, currentStateForMerge) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const embeddedState = readEmbeddedBuilderState(doc);
    const imported = embeddedState ? normalizeImportedState(embeddedState) : createInitialState();
    const shouldPreserveRetrievalBank = !!(embeddedState && embeddedState.retrievalBankOmitted && currentStateForMerge);
    const title = doc.querySelector(".lesson-header h1")?.textContent?.trim() || doc.querySelector("title")?.textContent?.trim();
    const className = doc.querySelector(".lesson-header span")?.textContent?.trim();
    const teachingDate = doc.querySelector(".lesson-header > div:last-child")?.textContent?.trim();

    imported.title = title || imported.title || "Imported lesson";
    imported.className = className && className !== "Class" ? className : imported.className;
    imported.teachingDate = isIsoDate(teachingDate) ? teachingDate : imported.teachingDate;
    imported.classNames = uniqueStrings([imported.className, ...(imported.classNames || []), ...DEFAULT_CLASSES]);
    imported.slides = rebuildSlidesFromHtml(doc, imported.slides);
    if (shouldPreserveRetrievalBank) {
      const current = normalizeImportedState(currentStateForMerge);
      imported.retrievalItems = current.retrievalItems;
      imported.classNames = uniqueStrings([imported.className, ...(imported.classNames || []), ...(current.classNames || []), ...DEFAULT_CLASSES]);
    }
    imported.updatedAt = new Date().toISOString();
    return imported;
  }

  function readEmbeddedBuilderState(doc) {
    const el = doc.getElementById("lesson-builder-state");
    if (!el || !el.textContent.trim()) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (err) {
      return null;
    }
  }

  function readEmbeddedAnnotations(doc) {
    const el = doc.getElementById("lesson-annotations-data");
    if (!el || !el.textContent.trim()) return {};
    try {
      const parsed = JSON.parse(el.textContent);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function rebuildSlidesFromHtml(doc, baseSlides) {
    const slideEls = Array.from(doc.querySelectorAll(".lesson-deck > .lesson-slide"));
    const annotationsByIndex = readEmbeddedAnnotations(doc);
    const baseById = new Map((Array.isArray(baseSlides) ? baseSlides : []).map((slide) => [String(slide.id || ""), slide]));
    const usedIds = new Set();

    if (!slideEls.length) {
      return (Array.isArray(baseSlides) ? baseSlides : []).map((slide, index) => ({
        ...clonePlain(slide),
        annotations: normalizeAnnotationStrokes(annotationsByIndex[String(index)] || slide.annotations)
      }));
    }

    return slideEls.map((el, index) => {
      const id = el.getAttribute("data-builder-slide-id") || "";
      let slide = null;
      if (id && baseById.has(id) && !usedIds.has(id)) {
        slide = clonePlain(baseById.get(id));
        usedIds.add(id);
      } else {
        slide = inferSlideFromHtmlElement(el, index);
      }
      slide.id = slide.id || id || uid("html");
      slide.annotations = normalizeAnnotationStrokes(annotationsByIndex[String(index)] || slide.annotations);
      return slide;
    });
  }

  function inferSlideFromHtmlElement(el, index) {
    if (el.classList.contains("blank-slide") || el.dataset.generatedBlank === "true") {
      return { id: uid("blank"), type: "blank", title: "Blank" };
    }

    if (el.classList.contains("starter-slide")) {
      return {
        id: uid("starter"),
        type: "starter",
        title: "Starter",
        slots: Array.from(el.querySelectorAll(".starter-cell")).slice(0, 4).map((cell) => ({
          lo: cell.querySelector("p")?.textContent?.trim() || "",
          ...imagePairFromElement(cell)
        }))
      };
    }

    if (el.classList.contains("retrieval-slide")) {
      return {
        id: uid("retrieval"),
        type: "retrieval",
        title: "Retrieval",
        los: Array.from(el.querySelectorAll("li")).map((li) => li.textContent.trim()).filter(Boolean)
      };
    }

    if (el.classList.contains("revision-slide")) {
      return {
        id: uid("revision"),
        type: "revision",
        title: "Revision",
        items: Array.from(el.querySelectorAll(".revision-question-cell")).slice(0, 2).map((cell) => ({
          lo: cell.getAttribute("data-lo") || cell.querySelector("img")?.getAttribute("alt") || "",
          ...imagePairFromElement(cell),
          seenCount: 1
        }))
      };
    }

    if (el.classList.contains("example-slide")) {
      const panes = Array.from(el.querySelectorAll(".example-image-pane, .single-image"))
        .map(imagePairFromElement)
        .filter((pair) => pair.image || pair.answerImage);
      return {
        id: uid("example"),
        type: "example",
        title: "Example",
        lo: el.querySelector(".lo-bar-text")?.textContent?.trim() || el.querySelector(".lo-bar")?.textContent?.trim() || "",
        image1: panes[0] ? panes[0].image : null,
        image2: panes[1] ? panes[1].image : null,
        answerImage1: panes[0] ? panes[0].answerImage : null,
        answerImage2: panes[1] ? panes[1].answerImage : null
      };
    }

    if (el.classList.contains("worksheet-slide")) {
      const links = Array.from(el.querySelectorAll(".worksheet-links a")).map(fileFromAnchor).filter(Boolean);
      return {
        id: uid("worksheet"),
        type: "worksheet",
        title: el.querySelector("h4")?.textContent?.trim() || "Worksheet",
        worksheet: links[0] || null,
        answers: links[1] || null
      };
    }

    if (el.classList.contains("pdf-page-slide")) {
      const image = imageFromElement(el.querySelector("img"));
      const aspect = normalizeSlideAspect(el.getAttribute("data-slide-aspect") || (image ? 1 : 16 / 10));
      return {
        id: uid("pdf"),
        type: "pdf-page",
        title: `PDF page ${index + 1}`,
        sourceName: "Imported PDF",
        pageNumber: index + 1,
        pageCount: "",
        orientation: aspect >= 1 ? "landscape" : "portrait",
        width: image ? "" : "",
        height: image ? "" : "",
        aspect,
        image
      };
    }

    if (el.classList.contains("cfu-slide")) {
      return {
        id: uid("cfu"),
        type: "cfu",
        title: "CFU",
        placement: inferCfuPlacement(el),
        image: imageFromElement(el.querySelector("img"))
      };
    }

    if (el.classList.contains("drawing-slide")) {
      return {
        id: uid("drawing"),
        type: "drawing",
        title: "Drawing",
        image: imageFromElement(el.querySelector("img")),
        width: "",
        height: ""
      };
    }

    if (el.classList.contains("template-slide")) {
      return {
        id: uid("template"),
        type: "template",
        title: el.querySelector("h4")?.textContent?.trim() || "Template",
        bullets: Array.from(el.querySelectorAll("li")).map((li) => li.textContent.trim()).filter(Boolean)
      };
    }

    if (el.classList.contains("placeholder-slide")) {
      return {
        id: uid("placeholder"),
        type: "placeholder",
        title: "Placeholder",
        text: el.querySelector("p")?.textContent || ""
      };
    }

    if (el.classList.contains("math-slide")) {
      return {
        id: uid("math"),
        type: "math",
        title: el.querySelector("h4")?.textContent?.trim() || "LaTeX",
        mode: el.querySelector("h4")?.textContent?.trim() || "LaTeX",
        latex: el.textContent.replace(/\s*LaTeX\s*$/, "").trim()
      };
    }

    return {
      id: uid("imported"),
      type: "imported-html",
      title: `Imported slide ${index + 1}`,
      className: el.className,
      html: cleanedImportedSlideHtml(el)
    };
  }

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function cleanedImportedSlideHtml(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script, style, .annotation-svg").forEach((node) => node.remove());
    clone.removeAttribute("data-builder-slide-id");
    clone.removeAttribute("data-builder-slide-type");
    return clone.innerHTML.trim();
  }

  function inferCfuPlacement(el) {
    return ["top-left", "top-center", "full"].find((placement) => el.classList.contains(placement)) || "full";
  }

  function imageFromElement(img) {
    if (!img) return null;
    const dataUrl = img.getAttribute("src") || "";
    if (!dataUrl.startsWith("data:")) return null;
    return {
      name: img.getAttribute("alt") || "Imported image",
      type: mimeFromDataUrl(dataUrl) || "image/png",
      size: Math.round((dataUrl.length * 3) / 4),
      dataUrl
    };
  }

  function imagePairFromElement(el) {
    const questionImg = el.querySelector(".qa-question-layer img")
      || el.querySelector(".qa-question-button img")
      || el.querySelector("img");
    const answerImg = el.querySelector(".qa-answer-layer img")
      || el.querySelector("[data-qa-answer-region] img");
    return {
      image: imageFromElement(questionImg),
      answerImage: imageFromElement(answerImg)
    };
  }

  function fileFromAnchor(anchor) {
    const dataUrl = anchor.getAttribute("href") || "";
    if (!dataUrl.startsWith("data:")) return null;
    return {
      name: anchor.textContent.trim() || anchor.getAttribute("download") || "Imported file",
      type: mimeFromDataUrl(dataUrl) || "application/octet-stream",
      size: Math.round((dataUrl.length * 3) / 4),
      dataUrl
    };
  }

  function mimeFromDataUrl(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;,]+)/);
    return match ? match[1] : "";
  }

  function standaloneBuilderState(sourceState) {
    const lessonState = sourceState || state;
    return {
      schemaVersion: 2,
      title: lessonState.title,
      className: lessonState.className,
      teachingDate: lessonState.teachingDate,
      classNames: lessonState.classNames || [],
      slides: clonePlain(lessonState.slides || []),
      retrievalItems: [],
      retrievalBankOmitted: true,
      slideTemplates: clonePlain(lessonState.slideTemplates || []),
      exportScope: "lesson-only",
      updatedAt: lessonState.updatedAt || new Date().toISOString()
    };
  }

  async function exportHtml() {
    try {
      setStatus("Preparing standalone lesson HTML...", "warn");
      const exportState = await prepareStandaloneLessonDownloadState(standaloneBuilderState(state));
      downloadBlob(
        buildStandaloneHtml(exportState),
        `${sanitizeFilePart(exportState.title)}.html`,
        "text/html"
      );
      setStatus("Exported standalone lesson HTML.", "success");
    } catch (err) {
      console.warn("Could not export standalone lesson HTML", err);
      setStatus(err.message || "Could not export standalone lesson HTML.", "error");
    }
  }

  async function exportPdf() {
    if (!state.slides.length) {
      setStatus("Add at least one slide before exporting a PDF.", "warn");
      return;
    }

    const button = $("export-pdf");
    if (button) button.disabled = true;
    const host = createPdfExportHost(state.slides.map((slide) => renderLessonSlide(slide)).join(""));
    document.body.appendChild(host);

    try {
      setStatus("Rendering lesson PDF...", "warn");
      await nextAnimationFrame();
      await downloadSlidesPdf(
        Array.from(host.querySelectorAll(".lesson-slide")),
        `${sanitizeFilePart(state.title)}.pdf`,
        state.title || "Lesson"
      );
      setStatus("Exported lesson PDF.", "success");
    } catch (error) {
      console.error(error);
      setStatus("Could not export the PDF on this device. Try fewer slides, or use the HTML lesson download.", "error");
    } finally {
      host.remove();
      if (button) button.disabled = false;
    }
  }

  async function buildPowerPointBundleZip(lessonState) {
    if (!window.JSZip) {
      throw new Error("The ZIP library is not available. Refresh the page and try again.");
    }
    if (!window.PptxGenJS) {
      throw new Error("The PowerPoint export library is not available. Refresh the page and try again.");
    }

    const renderedSlides = await renderStaticExportSlides(lessonState);
    const baseName = sanitizeFilePart(lessonState && lessonState.title);
    const zip = new window.JSZip();

    zip.file(`${baseName}.pptx`, await buildPowerPointBlob(renderedSlides, lessonState && lessonState.title));
    zip.file(`${baseName}.pdf`, buildPdfFromRenderedSlides(renderedSlides));

    const worksheetFiles = collectWorksheetFilesForBundle(lessonState);
    for (const entry of worksheetFiles) {
      const blob = await fileDescriptorToBlob(entry.file);
      if (blob) zip.file(entry.path, blob);
    }

    zip.file(
      "README.txt",
      [
        `${lessonState && lessonState.title ? lessonState.title : "Lesson"} export bundle`,
        "",
        "This bundle was exported from Lesson Builder.",
        "The PowerPoint and PDF are static image-based versions of the lesson slides.",
        ...describeStaticExportBehavior(lessonState),
        "Worksheet files are included in the worksheets/ folder."
      ].join("\n")
    );

    return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  }

  function describeStaticExportBehavior(lessonState) {
    const slides = lessonState && Array.isArray(lessonState.slides) ? lessonState.slides : [];
    const hasSavedClassroomState = slides.some((slide) => hasPresentationState(slide));
    const hasGeneratedAnswerVariants = slides.some(
      (slide) => !hasPresentationState(slide) && slideHasAnswerImages(slide)
    );
    const lines = [];
    if (hasSavedClassroomState) {
      lines.push("Presenter-saved slides preserve their saved classroom visibility state.");
    }
    if (hasGeneratedAnswerVariants) {
      lines.push("Other slides with answer images appear twice: first with answers hidden, then with answers shown.");
    }
    if (!lines.length) {
      lines.push("Each lesson slide appears once in its saved state.");
    }
    return lines;
  }

  async function renderStaticExportSlides(lessonState) {
    const variants = expandSlidesForStaticExport(lessonState && lessonState.slides);
    if (!variants.length) throw new Error("This saved lesson has no slides to export.");

    const host = createPdfExportHost(variants.map((variant) => renderLessonSlide(variant.slide)).join(""));
    document.body.appendChild(host);

    try {
      await nextAnimationFrame();
      const slideElements = Array.from(host.querySelectorAll(".lesson-slide"));
      return renderSlidesToJpegPages(slideElements, {
        revealHiddenContent: false,
        prepareSlide: (slideElement, index) => {
          prepareStaticBundleSlideLayout(slideElement);
          if (variants[index].answerMode === "saved") {
            prepareSavedPresentationStateForStaticExport(slideElement);
          } else {
            revealHiddenQuestionContent(slideElement);
            applyAnswerVisibilityForStaticExport(slideElement, variants[index].answerMode === "shown");
          }
        }
      });
    } finally {
      host.remove();
    }
  }

  function expandSlidesForStaticExport(slides) {
    return (Array.isArray(slides) ? slides : []).flatMap((slide, index) => {
      if (hasPresentationState(slide)) {
        return [{ slide, sourceIndex: index, answerMode: "saved" }];
      }
      if (!slideHasAnswerImages(slide)) {
        return [{ slide, sourceIndex: index, answerMode: "none" }];
      }
      return [
        { slide, sourceIndex: index, answerMode: "hidden" },
        { slide, sourceIndex: index, answerMode: "shown" }
      ];
    });
  }

  function slideHasAnswerImages(slide) {
    if (!slide || typeof slide !== "object") return false;
    return Object.keys(slide).some((key) => {
      const lowerKey = key.toLowerCase();
      const value = slide[key];
      if (lowerKey === "answerimage" || lowerKey === "answerimages" || /^answerimage\d+$/.test(lowerKey)) {
        return valueHasImagePayload(value);
      }
      if (Array.isArray(value)) return value.some((item) => slideHasAnswerImages(item));
      if (value && typeof value === "object" && !isImagePayload(value)) return slideHasAnswerImages(value);
      return false;
    });
  }

  function valueHasImagePayload(value) {
    if (!value) return false;
    if (Array.isArray(value)) return value.some(valueHasImagePayload);
    if (isImagePayload(value)) return true;
    if (typeof value === "object") return Object.values(value).some(valueHasImagePayload);
    return false;
  }

  function prepareStaticBundleSlideLayout(slideElement) {
    if (!slideElement || !slideElement.classList) return;
    slideElement.classList.add("static-bundle-export-slide");
  }

  function prepareSavedPresentationStateForStaticExport(root) {
    root.querySelectorAll(".qa-toggle").forEach((node) => {
      const showAnswer = node.classList.contains("is-showing-answer");
      const label = node.querySelector("[data-qa-toggle-label]");
      if (label) label.textContent = showAnswer ? "Answer" : "Question";
      node.querySelectorAll(".qa-question-layer").forEach((layer) => {
        setStaticExportVisibility(layer, !showAnswer, "");
      });
      node.querySelectorAll(".qa-answer-layer").forEach((layer) => {
        setStaticExportVisibility(layer, showAnswer, "");
      });
    });
    root.querySelectorAll(".example-answer-region").forEach((node) => {
      const showAnswer = !node.classList.contains("is-hidden");
      setStaticExportVisibility(node, showAnswer, showAnswer ? "" : "none");
    });
    root.querySelectorAll("[data-example-reveal-region]").forEach((node) => {
      const showSecondImage = !node.classList.contains("is-hidden");
      setStaticExportVisibility(node, showSecondImage, showSecondImage ? "" : "none");
    });
    root.querySelectorAll(".example-reveal-button").forEach((node) => node.remove());
  }

  function revealHiddenQuestionContent(root) {
    root.querySelectorAll("[data-example-reveal-region]").forEach((node) => {
      node.classList.remove("is-hidden");
      node.removeAttribute("aria-hidden");
      node.removeAttribute("hidden");
      forcePdfVisible(node, true);
      node.querySelectorAll("*").forEach((child) => forcePdfVisible(child, false));
    });
    root.querySelectorAll(".example-reveal-button").forEach((node) => node.remove());
  }

  function applyAnswerVisibilityForStaticExport(root, showAnswers) {
    root.querySelectorAll(".qa-toggle").forEach((node) => {
      node.classList.toggle("is-showing-answer", showAnswers);
      node.setAttribute("aria-pressed", showAnswers ? "true" : "false");
      node.setAttribute("aria-expanded", showAnswers ? "true" : "false");
      const label = node.querySelector("[data-qa-toggle-label]");
      if (label) label.textContent = showAnswers ? "Answer" : "Question";
    });

    root.querySelectorAll(".qa-question-layer").forEach((node) => {
      setStaticExportVisibility(node, !showAnswers, "");
    });
    root.querySelectorAll(".qa-answer-layer").forEach((node) => {
      setStaticExportVisibility(node, showAnswers, "");
    });
    root.querySelectorAll(".example-answer-region").forEach((node) => {
      node.classList.toggle("is-hidden", !showAnswers);
      node.setAttribute("aria-hidden", showAnswers ? "false" : "true");
      setStaticExportVisibility(node, showAnswers, showAnswers ? "" : "none");
    });
  }

  function setStaticExportVisibility(node, isVisible, hiddenDisplay) {
    if (!node || !node.style) return;
    node.style.visibility = isVisible ? "visible" : "hidden";
    node.style.opacity = isVisible ? "1" : "0";
    if (!isVisible && hiddenDisplay) node.style.display = hiddenDisplay;
    if (isVisible) node.style.display = "";
  }

  async function buildPowerPointBlob(renderedSlides, title) {
    const PowerPoint = window.PptxGenJS;
    if (!PowerPoint) throw new Error("The PowerPoint export library is not available.");

    const pptx = new PowerPoint();
    pptx.layout = "LAYOUT_16x10";
    pptx.author = "Lesson Builder";
    pptx.company = "Lesson Builder";
    pptx.subject = "Static Lesson Builder export";
    pptx.title = title || "Lesson";

    renderedSlides.forEach((rendered) => {
      const slide = pptx.addSlide();
      slide.background = { color: "FFFFFF" };
      const fit = fitRenderedSlideToPowerPoint(rendered);
      slide.addImage({
        data: rendered.dataUrl,
        x: fit.x,
        y: fit.y,
        w: fit.w,
        h: fit.h
      });
    });

    const output = await pptx.write({ outputType: "blob", compression: true });
    return output instanceof Blob
      ? output
      : new Blob([output], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  }

  function fitRenderedSlideToPowerPoint(rendered) {
    const slideWidth = 10;
    const slideHeight = 6.25;
    const imageAspect = Number(rendered && rendered.width) > 0 && Number(rendered && rendered.height) > 0
      ? rendered.width / rendered.height
      : 16 / 10;
    const slideAspect = slideWidth / slideHeight;
    if (imageAspect > slideAspect) {
      const height = slideWidth / imageAspect;
      return { x: 0, y: (slideHeight - height) / 2, w: slideWidth, h: height };
    }
    const width = slideHeight * imageAspect;
    return { x: (slideWidth - width) / 2, y: 0, w: width, h: slideHeight };
  }

  function buildPdfFromRenderedSlides(renderedSlides) {
    return buildPdfFromJpegPages(renderedSlides.map((rendered) => ({
      width: rendered.width,
      height: rendered.height,
      imageWidth: rendered.imageWidth,
      imageHeight: rendered.imageHeight,
      imageBytes: rendered.imageBytes
    })));
  }

  function collectWorksheetFilesForBundle(lessonState) {
    const usedPaths = new Set();
    const files = [];
    (Array.isArray(lessonState && lessonState.slides) ? lessonState.slides : []).forEach((slide, slideIndex) => {
      if (!slide || slide.type !== "worksheet") return;
      [
        { file: slide.worksheet, fallback: `worksheet-${slideIndex + 1}` },
        { file: slide.answers, fallback: `answers-${slideIndex + 1}` }
      ].forEach((entry) => {
        if (!entry.file) return;
        const path = uniqueWorksheetBundlePath(entry.file, entry.fallback, usedPaths);
        files.push({ path, file: entry.file });
      });
    });
    return files;
  }

  function uniqueWorksheetBundlePath(file, fallback, usedPaths) {
    const fileName = safeZipFileName(file && file.name, fallback);
    let path = `worksheets/${fileName}`;
    let counter = 2;
    while (usedPaths.has(path)) {
      const extension = fileName.match(/(\.[a-z0-9]{1,10})$/i);
      const suffix = `-${counter}`;
      path = extension
        ? `worksheets/${fileName.slice(0, -extension[1].length)}${suffix}${extension[1]}`
        : `worksheets/${fileName}${suffix}`;
      counter += 1;
    }
    usedPaths.add(path);
    return path;
  }

  function safeZipFileName(name, fallback) {
    const raw = String(name || fallback || "file").trim();
    const extensionMatch = raw.match(/(\.[a-z0-9]{1,10})$/i);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";
    const base = extension ? raw.slice(0, -extension.length) : raw;
    return `${sanitizeFilePart(base || fallback || "file")}${extension}`;
  }

  async function fileDescriptorToBlob(file) {
    const source = file && (file.dataUrl || file.path || file.url);
    if (!source) return null;
    if (String(source).startsWith("data:")) {
      return dataUrlToBlob(source, file.type || file.mimeType);
    }
    if (isRemoteImageUrl(source)) {
      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not fetch worksheet file (${response.status}).`);
      return response.blob();
    }
    return null;
  }

  function dataUrlToBlob(dataUrl, mimeType) {
    return new Blob([dataUrlToBytes(dataUrl)], {
      type: mimeType || mimeFromDataUrl(dataUrl) || "application/octet-stream"
    });
  }

  function previewLesson() {
    const blob = new Blob([buildStandaloneHtml()], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function buildStandaloneHtml(sourceState, options) {
    const lessonState = sourceState || state;
    const htmlOptions = options || {};
    const liveRetrieval = htmlOptions.liveRetrieval && htmlOptions.liveRetrieval.enabled
      ? {
          enabled: true,
          endpoint: String(htmlOptions.liveRetrieval.endpoint || PRESENTER_RETRIEVAL_LOG_URL),
          nextEndpoint: String(htmlOptions.liveRetrieval.nextEndpoint || PRESENTER_RETRIEVAL_NEXT_URL),
          lessonId: String(htmlOptions.liveRetrieval.lessonId || ""),
          className: String(htmlOptions.liveRetrieval.className || lessonState.className || ""),
          teachingDate: String(htmlOptions.liveRetrieval.teachingDate || lessonState.teachingDate || todayIso())
        }
      : null;
    const presenterConfig = htmlOptions.presenterConfig && htmlOptions.presenterConfig.enabled
      ? {
          enabled: true,
          sourceLessonId: String(htmlOptions.presenterConfig.sourceLessonId || ""),
          originalTitle: String(htmlOptions.presenterConfig.originalTitle || lessonState.title || "Lesson"),
          className: String(htmlOptions.presenterConfig.className || lessonState.className || ""),
          teachingDate: String(htmlOptions.presenterConfig.teachingDate || lessonState.teachingDate || ""),
          uploadEndpoint: String(htmlOptions.presenterConfig.uploadEndpoint || SAVED_LESSON_UPLOAD_URL),
          completeEndpoint: String(htmlOptions.presenterConfig.completeEndpoint || SAVED_LESSON_COMPLETE_URL),
          taughtEndpoint: String(htmlOptions.presenterConfig.taughtEndpoint || SAVED_LESSON_TAUGHT_URL),
          pdfSnapshotUploadEndpoint: String(htmlOptions.presenterConfig.pdfSnapshotUploadEndpoint || PRESENTER_PDF_SNAPSHOT_UPLOAD_URL),
          pdfEndpoint: String(htmlOptions.presenterConfig.pdfEndpoint || PRESENTER_PDF_URL)
        }
      : null;
    const lessonSlides = Array.isArray(lessonState.slides) ? lessonState.slides : [];
    const title = escapeHtml(lessonState.title || "Lesson");
    const slides = lessonSlides
      .map((slide, index) => renderLessonSlide(slide, { liveRetrieval, slideIndex: index }))
      .join("");
    const empty = lessonSlides.length ? "" : `<div class="empty-state">No slides exported.</div>`;
    const annotations = collectSlideAnnotations(lessonSlides);
    const builderStateJson = escapeJsonForHtml(JSON.stringify(standaloneBuilderState(lessonState)));
    const liveRetrievalJson = escapeJsonForHtml(JSON.stringify(liveRetrieval));
    const presenterConfigJson = escapeJsonForHtml(JSON.stringify(presenterConfig));
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
${standaloneCss()}
</style>
</head>
<body>
<header class="lesson-header">
  <div>
    <span>${escapeHtml(lessonState.className || "Class")}</span>
    <h1>${title}</h1>
  </div>
  <div>${escapeHtml(lessonState.teachingDate || "")}</div>
</header>
<main class="lesson-deck">
  ${slides || empty}
</main>
<script type="application/json" id="lesson-builder-state">${builderStateJson}</script>
<script type="application/json" id="lesson-live-retrieval">${liveRetrievalJson}</script>
<script type="application/json" id="lesson-presenter-config">${presenterConfigJson}</script>
${standalonePresenterHtml(annotations)}
<script>
window.addEventListener("keydown", function(event) {
  if (event.key === "p" && (event.ctrlKey || event.metaKey)) return;
  if (event.key === "f") {
    document.body.classList.toggle("focus-mode");
    document.dispatchEvent(new Event("lessonfocuschange"));
  }
});
${standaloneExampleRevealScript()}
${liveRetrieval ? standaloneLiveRetrievalScript() : ""}
${standalonePresenterScript()}
</script>
</body>
</html>`;
  }

  function collectSlideAnnotations(slides) {
    return (Array.isArray(slides) ? slides : []).reduce((result, slide, index) => {
      const annotations = normalizeAnnotationStrokes(slide.annotations);
      if (annotations.length) result[String(index)] = annotations;
      return result;
    }, {});
  }

  function escapeJsonForHtml(value) {
    return String(value || "")
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");
  }

function standalonePresenterHtml(initialAnnotations) {
  const annotationsJson = escapeJsonForHtml(JSON.stringify(initialAnnotations || {}));
  return `<div class="presenter-tools" aria-label="Presenter drawing tools">
  <button id="presenter-pan" class="presenter-tool is-active" type="button" aria-pressed="true">Pan</button>
  <button id="presenter-pen" class="presenter-tool" type="button" aria-pressed="false">Pen</button>
  <button id="presenter-eraser" class="presenter-tool" type="button" aria-pressed="false">Erase</button>
  <button id="presenter-blank-slide" class="presenter-tool" type="button" aria-label="Add blank slide">+</button>
  <button id="presenter-camera" class="presenter-tool" type="button" aria-label="Take a photo and add it as a slide">Camera</button>
  <input id="presenter-camera-input" class="presenter-camera-input" type="file" accept="image/*" capture="environment" aria-label="Take a photo">
  <button id="presenter-zoom" class="presenter-tool" type="button" aria-label="Zoom in 60 percent" aria-pressed="false">60%</button>
  <button id="presenter-fullscreen" class="presenter-tool" type="button" aria-label="Toggle full screen" aria-pressed="false">Full</button>
  <div class="presenter-colors" aria-label="Pen colours">
    <button id="presenter-color-black" class="presenter-color" type="button" value="#111827" aria-label="Black pen colour" data-presenter-color data-color="#111827" style="--swatch-color:#111827"></button>
    <button id="presenter-color-blue" class="presenter-color is-active" type="button" value="#2563eb" aria-label="Blue pen colour" data-presenter-color data-color="#2563eb" style="--swatch-color:#2563eb"></button>
    <button id="presenter-color-red" class="presenter-color" type="button" value="#dc2626" aria-label="Red pen colour" data-presenter-color data-color="#dc2626" style="--swatch-color:#dc2626"></button>
    <button id="presenter-color-green" class="presenter-color" type="button" value="#16a34a" aria-label="Green pen colour" data-presenter-color data-color="#16a34a" style="--swatch-color:#16a34a"></button>
  </div>
  <button id="presenter-color-picker" class="presenter-tool presenter-color-picker" type="button" aria-label="Choose a custom pen colour">Pick</button>
  <input id="presenter-custom-color" class="presenter-custom-color" type="color" value="#2563eb" aria-label="Custom pen colour" tabindex="-1">
  <input id="presenter-color" type="hidden" value="#2563eb">
  <input id="presenter-size" class="presenter-size" type="range" min="0" max="4" step="0.5" value="2" aria-label="Stroke size">
  <button id="presenter-undo" class="presenter-tool" type="button">Undo</button>
  <button id="presenter-clear" class="presenter-tool" type="button">Clear</button>
  <button id="presenter-save-builder" class="presenter-tool primary" type="button" hidden>Save to Builder</button>
  <button id="presenter-download" class="presenter-tool primary" type="button" aria-label="Download annotated HTML" title="Download annotated HTML">&#x2B07;</button>
  <button id="presenter-pdf" class="presenter-tool primary" type="button" aria-label="Open print view" title="Open print view"><span class="presenter-tool-icon presenter-print-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/><path d="M17 12h.01"/></svg></span></button>
</div>
<script type="application/json" id="lesson-annotations-data">${annotationsJson}</script>`;
  }

  function standalonePresenterScript() {
    return `
(function() {
  var dataEl = document.getElementById("lesson-annotations-data");
  var builderStateEl = document.getElementById("lesson-builder-state");
  var presenterConfigElement = document.getElementById("lesson-presenter-config");
  var presenterConfig = null;
  var panBtn = document.getElementById("presenter-pan");
  var penBtn = document.getElementById("presenter-pen");
  var eraserBtn = document.getElementById("presenter-eraser");
  var blankSlideBtn = document.getElementById("presenter-blank-slide");
  var cameraBtn = document.getElementById("presenter-camera");
  var cameraInput = document.getElementById("presenter-camera-input");
  var zoomBtn = document.getElementById("presenter-zoom");
  var fullscreenBtn = document.getElementById("presenter-fullscreen");
  var colorInput = document.getElementById("presenter-color");
  var colorPickerBtn = document.getElementById("presenter-color-picker");
  var customColorInput = document.getElementById("presenter-custom-color");
  var colorPickers = Array.prototype.slice.call(document.querySelectorAll("[data-presenter-color]"));
  var sizeInput = document.getElementById("presenter-size");
  var undoBtn = document.getElementById("presenter-undo");
  var clearBtn = document.getElementById("presenter-clear");
  var saveBuilderBtn = document.getElementById("presenter-save-builder");
  var downloadBtn = document.getElementById("presenter-download");
  var pdfBtn = document.getElementById("presenter-pdf");
  var slides = Array.prototype.slice.call(document.querySelectorAll(".lesson-slide"));
  var VIEWBOX_W = ${SLIDE_VIEWBOX_WIDTH};
  var VIEWBOX_H = ${SLIDE_VIEWBOX_HEIGHT};
  var SLIDE_RATIO = 16 / 10;
  var ZOOM_SCALE = 1.6;
  var PDF_EXPORT_WIDTHS = [1280,1024,800];
  var PDF_EXPORT_WIDTH = PDF_EXPORT_WIDTHS[0] || ${PDF_EXPORT_WIDTH};
  var PDF_JPEG_QUALITY = ${PDF_JPEG_QUALITY};

  var mode = "pen";
  var zoomEnabled = false;
  var strokesBySlide = {};
  var history = [];
  var activeStroke = null;
  var activePath = null;
  var activeSlideIndex = null;
  var activePointerInput = null;
  var activeTouchPan = null;
  var presentationLayoutFrame = 0;
  var suppressRevealClickUntil = 0;
  var presentedLessonId = "";
  var presentedLessonTitle = "";
  var presentedAt = new Date().toISOString();

  try {
    presenterConfig = JSON.parse(presenterConfigElement ? presenterConfigElement.textContent || "null" : "null");
    if (!presenterConfig || typeof presenterConfig !== "object") presenterConfig = null;
  } catch (error) {
    presenterConfig = null;
  }

  if (presenterConfig && presenterConfig.enabled && saveBuilderBtn) {
    saveBuilderBtn.hidden = false;
  }

  try {
    strokesBySlide = JSON.parse(dataEl.textContent || "{}");
    if (!strokesBySlide || Array.isArray(strokesBySlide) || typeof strokesBySlide !== "object") strokesBySlide = {};
  } catch (error) {
    strokesBySlide = {};
  }

  function ensureSlideOverlays() {
    refreshSlides();
    slides.forEach(function(slide, index) {
      slide.setAttribute("data-annotation-slide", String(index));
      var svg = getSlideSvg(slide);
      if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "annotation-svg");
        svg.setAttribute("viewBox", "0 0 " + VIEWBOX_W + " " + VIEWBOX_H);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.setAttribute("aria-label", "Slide annotation layer");
        slide.appendChild(svg);
      }
      bindSvg(svg);
      bindSlidePointerInput(slide);
      renderSlide(index);
    });
    rebuildHistory();
  }

  function refreshSlides() {
    slides = Array.prototype.slice.call(document.querySelectorAll(".lesson-slide"));
  }

  function getSlideSvg(slide) {
    for (var index = 0; index < slide.children.length; index += 1) {
      var child = slide.children[index];
      if (child.classList && child.classList.contains("annotation-svg")) return child;
    }
    return null;
  }

  function bindSvg(svg) {
    if (svg.dataset.bound === "true") return;
    svg.dataset.bound = "true";

    svg.addEventListener("pointerdown", function(event) {
      if (event.pointerType === "touch" || activePointerInput) return;
      if (mode === "pan") return;
      event.preventDefault();
      svg.setPointerCapture(event.pointerId);
      var slideIndex = getSvgSlideIndex(svg);
      var point = pointFromEvent(event, svg);

      if (mode === "eraser") {
        eraseAt(slideIndex, point, svg);
        return;
      }

      activeStroke = {
        id: "stroke_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
        color: colorInput.value || "#2563eb",
        width: strokeWidthFromInput(svg),
        createdAt: Date.now(),
        points: [point]
      };
      activeSlideIndex = slideIndex;
      activePath = createPath(activeStroke);
      svg.appendChild(activePath);
    });

    svg.addEventListener("pointermove", function(event) {
      if (event.pointerType === "touch" || activePointerInput) return;
      if (mode === "eraser") {
        if (event.buttons) {
          event.preventDefault();
          var slideIndex = getSvgSlideIndex(svg);
          pointsFromEvent(event, svg).forEach(function(point) {
            eraseAt(slideIndex, point, svg);
          });
        }
        return;
      }

      if (!activeStroke || !activePath) return;
      event.preventDefault();
      pointsFromEvent(event, svg).forEach(function(point) {
        appendStrokePoint(activeStroke, point);
      });
      activePath.setAttribute("d", pathFromPoints(activeStroke.points));
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach(function(eventName) {
      svg.addEventListener(eventName, function(event) {
        if (!activeStroke) return;
        event.preventDefault();
        if (activeStroke.points.length) {
          var slideIndex = activeSlideIndex == null ? getSvgSlideIndex(svg) : activeSlideIndex;
          getSlideStrokes(slideIndex).push(activeStroke);
          history.push({ type: "add", slideIndex: slideIndex, stroke: activeStroke });
        }
        activeStroke = null;
        activePath = null;
        activeSlideIndex = null;
      });
    });
  }

  function bindSlidePointerInput(slide) {
    if (slide.dataset.pointerInputBound === "true") return;
    slide.dataset.pointerInputBound = "true";

    slide.addEventListener("pointerdown", function(event) {
      if (event.pointerType === "touch") {
        beginTouchPan(event, slide);
        return;
      }
      beginPointerAnnotation(event, slide);
    }, true);
    slide.addEventListener("pointermove", function(event) {
      if (activeTouchPan && activeTouchPan.pointerId === event.pointerId) {
        continueTouchPan(event);
        return;
      }
      continuePointerAnnotation(event);
    }, true);
    ["pointerup", "pointercancel"].forEach(function(eventName) {
      slide.addEventListener(eventName, function(event) {
        if (activeTouchPan && activeTouchPan.pointerId === event.pointerId) {
          finishTouchPan(event);
          return;
        }
        finishPointerAnnotation(event);
      }, true);
    });
    slide.addEventListener("lostpointercapture", function(event) {
      if (activeTouchPan && activeTouchPan.pointerId === event.pointerId) {
        cancelTouchPan();
      }
    }, true);
  }

  function handleDocumentPointerMove(event) {
    if (activeTouchPan && activeTouchPan.pointerId === event.pointerId) {
      continueTouchPan(event);
      return;
    }
    continuePointerAnnotation(event);
  }

  function handleDocumentPointerEnd(event) {
    if (activeTouchPan && activeTouchPan.pointerId === event.pointerId) {
      finishTouchPan(event);
      return;
    }
    finishPointerAnnotation(event);
  }

  function isInteractivePointerTarget(target) {
    if (!target || typeof target.closest !== "function") return false;
    return !!target.closest("button,input,select,textarea,a,label,summary,[role='button'],[contenteditable='true'],.presenter-tools,[data-ignore-annotation]");
  }

  function isAnswerRevealTarget(target) {
    if (!target || typeof target.closest !== "function") return false;
    return !!target.closest("[data-qa-toggle],[data-example-reveal]");
  }

  function suppressRevealClickAfterAnnotation(event) {
    if (Date.now() > suppressRevealClickUntil) return;
    if (!isAnswerRevealTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  }

  function suppressAnnotationDragStart(event) {
    if (!event.target || typeof event.target.closest !== "function") return;
    if (!event.target.closest(".lesson-slide")) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  }

  function annotationModeForPointer(event) {
    var pointerType = event.pointerType || "mouse";
    if (pointerType === "touch") return null;
    if (event.button != null && event.button !== 0) return null;
    if (pointerType === "pen") return mode === "eraser" ? "eraser" : "pen";
    if (mode === "pan") return null;
    return mode === "eraser" ? "eraser" : "pen";
  }

  function beginTouchPan(event, slide) {
    if (activePointerInput) return;
    if (activeTouchPan && activeTouchPan.pointerId !== event.pointerId) cancelTouchPan();
    if (activeTouchPan) return;
    var allowTap = isAnswerRevealTarget(event.target);
    if (isInteractivePointerTarget(event.target) && !isAnswerRevealTarget(event.target)) return;

    if (!allowTap) {
      event.preventDefault();
      event.stopPropagation();
    }

    try {
      if (slide.setPointerCapture) slide.setPointerCapture(event.pointerId);
    } catch (error) {}

    activeTouchPan = {
      pointerId: event.pointerId,
      slide: slide,
      target: getTouchPanTarget(),
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      travel: 0,
      allowTap: allowTap
    };
  }

  function continueTouchPan(event) {
    if (!activeTouchPan || activeTouchPan.pointerId !== event.pointerId) return;

    var dx = event.clientX - activeTouchPan.lastX;
    var dy = event.clientY - activeTouchPan.lastY;
    if (dx || dy) {
      activeTouchPan.travel += Math.sqrt(dx * dx + dy * dy);
      if (!activeTouchPan.moved && activeTouchPan.travel >= 6) {
        activeTouchPan.moved = true;
        suppressRevealClickUntil = Date.now() + 900;
      }
      if (activeTouchPan.moved) {
        event.preventDefault();
        event.stopPropagation();
        activeTouchPan.target.scrollLeft -= dx;
        activeTouchPan.target.scrollTop -= dy;
      }
      activeTouchPan.lastX = event.clientX;
      activeTouchPan.lastY = event.clientY;
    }
  }

  function finishTouchPan(event) {
    if (!activeTouchPan || activeTouchPan.pointerId !== event.pointerId) return;

    var touchPan = activeTouchPan;
    activeTouchPan = null;
    if (touchPan.moved || !touchPan.allowTap) {
      event.preventDefault();
      event.stopPropagation();
    }

    try {
      if (touchPan.slide && touchPan.slide.releasePointerCapture) {
        touchPan.slide.releasePointerCapture(event.pointerId);
      }
    } catch (error) {}
  }

  function cancelTouchPan() {
    var touchPan = activeTouchPan;
    activeTouchPan = null;
    if (!touchPan) return;
    try {
      if (touchPan.slide && touchPan.slide.releasePointerCapture) {
        touchPan.slide.releasePointerCapture(touchPan.pointerId);
      }
    } catch (error) {}
  }

  function getTouchPanTarget() {
    var deck = document.querySelector(".lesson-deck");
    if (deck && isPresentationMode()) return deck;
    return document.scrollingElement || document.documentElement || document.body;
  }

  function beginPointerAnnotation(event, slide) {
    if (activePointerInput) return;
    var inputMode = annotationModeForPointer(event);
    if (!inputMode) return;
    if (isInteractivePointerTarget(event.target) && !isAnswerRevealTarget(event.target)) return;

    var svg = getSlideSvg(slide);
    if (!svg) return;

    event.preventDefault();
    event.stopPropagation();
    if (isAnswerRevealTarget(event.target)) suppressRevealClickUntil = Date.now() + 900;

    try {
      if (slide.setPointerCapture) slide.setPointerCapture(event.pointerId);
    } catch (error) {}

    var slideIndex = Math.max(0, Number(slide.getAttribute("data-annotation-slide")) || 0);
    var point = pointFromEvent(event, svg);
    activePointerInput = {
      pointerId: event.pointerId,
      mode: inputMode,
      slide: slide,
      svg: svg,
      slideIndex: slideIndex
    };

    if (inputMode === "eraser") {
      eraseAt(slideIndex, point, svg);
      return;
    }

    activeStroke = {
      id: "stroke_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
      color: colorInput.value || "#2563eb",
      width: strokeWidthFromInput(svg),
      createdAt: Date.now(),
      points: [point]
    };
    activeSlideIndex = slideIndex;
    activePath = createPath(activeStroke);
    svg.appendChild(activePath);
  }

  function continuePointerAnnotation(event) {
    if (!activePointerInput || activePointerInput.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    if (activePointerInput.mode === "eraser") {
      pointsFromEvent(event, activePointerInput.svg).forEach(function(point) {
        eraseAt(activePointerInput.slideIndex, point, activePointerInput.svg);
      });
      return;
    }

    if (!activeStroke || !activePath) return;
    pointsFromEvent(event, activePointerInput.svg).forEach(function(point) {
      appendStrokePoint(activeStroke, point);
    });
    activePath.setAttribute("d", pathFromPoints(activeStroke.points));
  }

  function finishPointerAnnotation(event) {
    if (!activePointerInput || activePointerInput.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    var pointerInput = activePointerInput;

    if (pointerInput.mode === "pen" && activeStroke) {
      if (activeStroke.points.length) {
        getSlideStrokes(pointerInput.slideIndex).push(activeStroke);
        history.push({ type: "add", slideIndex: pointerInput.slideIndex, stroke: activeStroke });
      }
    }
    if (isAnswerRevealTarget(event.target)) suppressRevealClickUntil = Date.now() + 900;

    activeStroke = null;
    activePath = null;
    activeSlideIndex = null;
    activePointerInput = null;

    try {
      if (pointerInput.slide && pointerInput.slide.releasePointerCapture) {
        pointerInput.slide.releasePointerCapture(event.pointerId);
      }
    } catch (error) {}
  }

  function getSvgSlideIndex(svg) {
    var slide = svg.closest ? svg.closest(".lesson-slide") : svg.parentElement;
    return Math.max(0, Number(slide && slide.getAttribute("data-annotation-slide")) || 0);
  }

  function pointFromEvent(event, target) {
    var points = pointsFromEvent(event, target);
    return points[points.length - 1];
  }

  function pointsFromEvent(event, target) {
    var sourceEvents = [];
    if (typeof event.getCoalescedEvents === "function") {
      sourceEvents = event.getCoalescedEvents();
    }
    if (!sourceEvents || !sourceEvents.length) sourceEvents = [event];
    return sourceEvents.map(function(sourceEvent) {
      return pointFromClient(sourceEvent.clientX, sourceEvent.clientY, target);
    });
  }

  function pointFromClient(clientX, clientY, target) {
    var rect = target.getBoundingClientRect();
    return {
      x: Math.min(VIEWBOX_W, Math.max(0, ((clientX - rect.left) / Math.max(1, rect.width)) * VIEWBOX_W)),
      y: Math.min(VIEWBOX_H, Math.max(0, ((clientY - rect.top) / Math.max(1, rect.height)) * VIEWBOX_H))
    };
  }

  function setMode(nextMode) {
    mode = nextMode === "eraser" ? "eraser" : (nextMode === "pan" ? "pan" : "pen");
    panBtn.classList.toggle("is-active", mode === "pan");
    penBtn.classList.toggle("is-active", mode === "pen");
    eraserBtn.classList.toggle("is-active", mode === "eraser");
    panBtn.setAttribute("aria-pressed", mode === "pan" ? "true" : "false");
    penBtn.setAttribute("aria-pressed", mode === "pen" ? "true" : "false");
    eraserBtn.setAttribute("aria-pressed", mode === "eraser" ? "true" : "false");
    document.body.classList.toggle("annotation-pan", mode === "pan");
    document.body.classList.toggle("annotation-eraser", mode === "eraser");
  }

  function strokeWidthFromInput(svg) {
    var inputSize = Number(sizeInput.value);
    if (!Number.isFinite(inputSize)) inputSize = 2;
    var rect = svg.getBoundingClientRect();
    return Math.max(0.5, inputSize / Math.max(1, rect.width) * VIEWBOX_W);
  }

  function eraserThresholdFromInput(svg) {
    return strokeWidthFromInput(svg) * 1.8;
  }

  function setPresenterColor(color, activeInput) {
    colorInput.value = color || "#2563eb";
    colorPickers.forEach(function(input) {
      input.classList.toggle("is-active", input === activeInput);
    });
    if (customColorInput) customColorInput.value = colorInput.value;
  }

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  }

  function requestFullscreen() {
    var root = document.documentElement;
    var request = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
    return request ? request.call(root) : null;
  }

  function exitFullscreen() {
    var exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    return exit ? exit.call(document) : null;
  }

  function toggleFullscreen() {
    if (getFullscreenElement()) {
      var exitResult = exitFullscreen();
      if (exitResult && typeof exitResult.catch === "function") exitResult.catch(toggleFocusModeFallback);
      return;
    }
    if (document.body.classList.contains("focus-mode")) {
      toggleFocusModeFallback();
      return;
    }

    var requestResult = requestFullscreen();
    if (requestResult && typeof requestResult.catch === "function") {
      requestResult.catch(toggleFocusModeFallback);
      return;
    }
    if (!requestResult) toggleFocusModeFallback();
  }

  function toggleFocusModeFallback() {
    document.body.classList.toggle("focus-mode");
    updateFullscreenUi();
  }

  function isPresentationMode() {
    return !!getFullscreenElement() || document.body.classList.contains("focus-mode");
  }

  function toggleZoom() {
    setZoomEnabled(!zoomEnabled);
  }

  function setZoomEnabled(nextZoomEnabled) {
    var targetSlideIndex = getCurrentSlideIndex();
    zoomEnabled = !!nextZoomEnabled;
    if (zoomEnabled && !isPresentationMode()) {
      document.body.classList.add("focus-mode");
    }
    if (zoomEnabled) setMode("pan");
    updateZoomUi();
    updateFullscreenUi();
    scheduleSlidePositionRestore(targetSlideIndex);
  }

  function updateZoomUi() {
    document.body.classList.toggle("presenter-zoom-mode", zoomEnabled);
    zoomBtn.classList.toggle("is-active", zoomEnabled);
    zoomBtn.setAttribute("aria-pressed", zoomEnabled ? "true" : "false");
    zoomBtn.setAttribute("aria-label", zoomEnabled ? "Fit slide to screen" : "Zoom in 60 percent");
    zoomBtn.textContent = zoomEnabled ? "Fit" : "60%";
  }

  function updateFullscreenUi() {
    var isFullscreen = !!getFullscreenElement();
    if (zoomEnabled && !isFullscreen && !document.body.classList.contains("focus-mode")) {
      document.body.classList.add("focus-mode");
    }
    var isPresentationMode = isFullscreen || document.body.classList.contains("focus-mode");
    document.body.classList.toggle("fullscreen-mode", isFullscreen);
    fullscreenBtn.classList.toggle("is-active", isPresentationMode);
    fullscreenBtn.setAttribute("aria-pressed", isPresentationMode ? "true" : "false");
    fullscreenBtn.setAttribute("aria-label", isPresentationMode ? "Exit full screen" : "Enter full screen");
    fullscreenBtn.textContent = isPresentationMode ? "Exit" : "Full";
    updatePresentationLayout();
    window.setTimeout(updatePresentationLayout, 80);
  }

  function updatePresentationLayout() {
    refreshSlides();
    var viewport = window.visualViewport || {};
    var viewportWidth = Math.max(1, viewport.width || window.innerWidth || document.documentElement.clientWidth || 1);
    var viewportHeight = Math.max(1, viewport.height || window.innerHeight || document.documentElement.clientHeight || 1);
    var toolbar = document.querySelector(".presenter-tools");
    var toolbarRect = toolbar ? toolbar.getBoundingClientRect() : { height: 0, top: 0 };
    var topGap = Math.max(0, toolbarRect.top || 0);
    var edgeSpace = 6;
    var toolbarSpace = Math.ceil((toolbarRect.height || 0) + topGap + edgeSpace);
    var availableWidth = Math.max(160, viewportWidth - edgeSpace * 2);
    var availableHeight = Math.max(120, viewportHeight - toolbarSpace - edgeSpace);
    var defaultFitWidth = Math.floor(Math.min(availableWidth, availableHeight * SLIDE_RATIO));
    var defaultFitHeight = Math.floor(defaultFitWidth / SLIDE_RATIO);
    var rootStyle = document.documentElement.style;
    rootStyle.setProperty("--presenter-edge-space", edgeSpace + "px");
    rootStyle.setProperty("--presenter-toolbar-space", toolbarSpace + "px");
    rootStyle.setProperty("--presenter-slide-width", defaultFitWidth + "px");
    rootStyle.setProperty("--presenter-slide-height", defaultFitHeight + "px");
    slides.forEach(function(slide) {
      var aspect = slideAspect(slide);
      var fitWidth = usesDefaultPresenterWidth(slide) ? defaultFitWidth : Math.floor(Math.min(availableWidth, availableHeight * aspect));
      var fitHeight = Math.floor(fitWidth / aspect);
      slide.style.setProperty("--presenter-slide-width", fitWidth + "px");
      slide.style.setProperty("--presenter-slide-height", fitHeight + "px");
      slide.style.zoom = zoomEnabled ? String(ZOOM_SCALE) : "";
    });
  }

  function schedulePresentationLayout() {
    if (presentationLayoutFrame) return;
    var requestFrame = window.requestAnimationFrame || function(callback) {
      return window.setTimeout(callback, 16);
    };
    presentationLayoutFrame = requestFrame(function() {
      presentationLayoutFrame = 0;
      updatePresentationLayout();
    });
  }

  function scheduleSlidePositionRestore(slideIndex) {
    var restore = function() {
      updatePresentationLayout();
      centerCurrentSlideInDeck(slideIndex);
    };
    restore();
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function() {
        restore();
        window.requestAnimationFrame(restore);
      });
    }
    window.setTimeout(restore, 120);
  }

  function centerCurrentSlideInDeck(slideIndex) {
    var deck = document.querySelector(".lesson-deck");
    if (!deck) return;
    refreshSlides();
    var numericSlideIndex = Number(slideIndex);
    var targetIndex = Number.isFinite(numericSlideIndex) ? Math.round(numericSlideIndex) : getCurrentSlideIndex();
    targetIndex = Math.max(0, Math.min(slides.length - 1, targetIndex));
    var slide = slides[targetIndex] || slides[0];
    if (!slide) return;
    if (!zoomEnabled) {
      slide.scrollIntoView({ block: "center", inline: "center" });
      return;
    }
    var slideRect = slide.getBoundingClientRect();
    var deckRect = deck.getBoundingClientRect();
    var left = deck.scrollLeft + (slideRect.left - deckRect.left) + slideRect.width / 2 - deck.clientWidth / 2;
    var top = deck.scrollTop + (slideRect.top - deckRect.top) + slideRect.height / 2 - deck.clientHeight / 2;
    deck.scrollLeft = Math.max(0, left);
    deck.scrollTop = Math.max(0, top);
  }

  function slideAspect(slide) {
    var aspect = Number(slide && slide.getAttribute("data-slide-aspect"));
    if (!Number.isFinite(aspect) || aspect <= 0) aspect = SLIDE_RATIO;
    return Math.max(0.45, Math.min(2.4, aspect));
  }

  function usesDefaultPresenterWidth(slide) {
    return !!(slide && slide.classList && slide.classList.contains("pdf-page-slide"));
  }

  function addBlankSlide() {
    refreshSlides();
    var deck = document.querySelector(".lesson-deck");
    if (!deck) return;
    var emptyState = deck.querySelector(".empty-state");
    if (emptyState) emptyState.remove();

    var afterIndex = slides.length ? getCurrentSlideIndex() : -1;
    var insertIndex = afterIndex + 1;
    shiftStrokesForInsert(insertIndex);

    var slide = document.createElement("section");
    slide.className = "lesson-slide blank-slide";
    slide.setAttribute("data-generated-blank", "true");
    slide.setAttribute("data-builder-slide-id", "blank_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8));
    slide.setAttribute("data-builder-slide-type", "blank");
    var label = document.createElement("span");
    label.className = "slide-label";
    label.textContent = "Blank";
    slide.appendChild(label);

    if (afterIndex >= 0 && slides[afterIndex] && slides[afterIndex].parentNode === deck) {
      deck.insertBefore(slide, slides[afterIndex].nextSibling);
    } else {
      deck.appendChild(slide);
    }

    refreshSlides();
    ensureSlideOverlays();
    setMode("pan");
    slide.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function requestCameraCapture() {
    if (!cameraInput) {
      alert("Camera capture is not available in this browser.");
      return;
    }
    cameraInput.value = "";
    cameraInput.click();
  }

  function handleCameraCapture(event) {
    var file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    if (!/^image\\//i.test(file.type || "") && !/\\.(png|jpe?g|webp|gif)$/i.test(file.name || "")) {
      alert("Choose an image from the camera.");
      return;
    }
    if (cameraBtn) cameraBtn.disabled = true;
    downscaleCameraImage(file)
      .then(function(dataUrl) {
        addCameraSlide(dataUrl, file.name || "camera-photo.jpg");
      })
      .catch(function(error) {
        console.error(error);
        alert("Could not add the camera photo. Try taking the photo again.");
      })
      .finally(function() {
        if (cameraBtn) cameraBtn.disabled = false;
      });
  }

  function downscaleCameraImage(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function() {
        reject(reader.error || new Error("Could not read camera image."));
      };
      reader.onload = function() {
        var source = new Image();
        source.onload = function() {
          try {
            var canvas = document.createElement("canvas");
            canvas.width = 1600;
            canvas.height = 1000;
            var ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas is not available.");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            var naturalWidth = source.naturalWidth || source.width || canvas.width;
            var naturalHeight = source.naturalHeight || source.height || canvas.height;
            var scale = Math.min(canvas.width / naturalWidth, canvas.height / naturalHeight);
            var drawWidth = Math.max(1, Math.round(naturalWidth * scale));
            var drawHeight = Math.max(1, Math.round(naturalHeight * scale));
            var drawX = Math.round((canvas.width - drawWidth) / 2);
            var drawY = Math.round((canvas.height - drawHeight) / 2);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
            resolve(canvas.toDataURL("image/jpeg", 0.88));
          } catch (error) {
            reject(error);
          }
        };
        source.onerror = function() {
          reject(new Error("Could not decode camera image."));
        };
        source.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  function addCameraSlide(dataUrl, fileName) {
    refreshSlides();
    var deck = document.querySelector(".lesson-deck");
    if (!deck) return;
    var emptyState = deck.querySelector(".empty-state");
    if (emptyState) emptyState.remove();

    var afterIndex = slides.length ? getCurrentSlideIndex() : -1;
    var insertIndex = afterIndex + 1;
    shiftStrokesForInsert(insertIndex);

    var slide = document.createElement("section");
    slide.className = "lesson-slide camera-slide";
    slide.setAttribute("data-generated-camera", "true");
    slide.setAttribute("data-builder-slide-id", "camera_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8));
    slide.setAttribute("data-builder-slide-type", "camera");
    slide.setAttribute("data-slide-aspect", "1.6");
    var image = document.createElement("img");
    image.className = "camera-slide-image";
    image.src = dataUrl;
    image.alt = fileName || "Camera photo";
    slide.appendChild(image);

    if (afterIndex >= 0 && slides[afterIndex] && slides[afterIndex].parentNode === deck) {
      deck.insertBefore(slide, slides[afterIndex].nextSibling);
    } else {
      deck.appendChild(slide);
    }

    refreshSlides();
    ensureSlideOverlays();
    setMode("pan");
    slide.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function getCurrentSlideIndex() {
    var viewportCenter = window.innerHeight / 2;
    var bestIndex = 0;
    var bestDistance = Infinity;
    slides.forEach(function(slide, index) {
      var rect = slide.getBoundingClientRect();
      var center = rect.top + rect.height / 2;
      var distanceFromCenter = Math.abs(center - viewportCenter);
      if (distanceFromCenter < bestDistance) {
        bestDistance = distanceFromCenter;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function shiftStrokesForInsert(insertIndex) {
    var shifted = {};
    Object.keys(strokesBySlide).forEach(function(key) {
      var numericKey = Number(key);
      var nextKey = numericKey >= insertIndex ? String(numericKey + 1) : String(numericKey);
      shifted[nextKey] = strokesBySlide[key];
    });
    strokesBySlide = shifted;
    history.forEach(function(action) {
      if (Number(action.slideIndex) >= insertIndex) action.slideIndex += 1;
    });
  }

  function syncBuilderStateForSave() {
    if (!builderStateEl) return {};
    var builderState = {};
    try {
      builderState = JSON.parse(builderStateEl.textContent || "{}") || {};
    } catch (error) {
      builderState = {};
    }

    refreshSlides();
    var baseSlides = Array.isArray(builderState.slides) ? builderState.slides : [];
    var baseById = {};
    baseSlides.forEach(function(slide) {
      if (slide && slide.id) baseById[String(slide.id)] = slide;
    });

    builderState.slides = slides.map(function(slide, index) {
      var id = slide.getAttribute("data-builder-slide-id") || "";
      var nextSlide = id && baseById[id] ? clonePlain(baseById[id]) : stateFromSlideElement(slide, index);
      nextSlide.id = nextSlide.id || id || ("html_" + Date.now().toString(36) + "_" + index);
      nextSlide = captureLiveDomStateForSlide(nextSlide, slide, index);
      nextSlide.annotations = getSlideStrokes(index);
      return nextSlide;
    });
    builderState.updatedAt = new Date().toISOString();
    builderStateEl.textContent = JSON.stringify(builderState).replace(/</g, "\\\\u003c");
    return builderState;
  }

  function captureLiveDomStateForSlide(slideState, slide, index) {
    if (!slideState || !slide) return slideState;
    var reveals = {};
    Array.prototype.forEach.call(slide.querySelectorAll("[data-reveal-key]"), function(control) {
      var revealKey = control.getAttribute("data-reveal-key") || "";
      if (!revealKey) return;
      if (control.matches("[data-qa-toggle]")) {
        reveals[revealKey] = control.classList.contains("is-showing-answer");
      } else if (control.matches("[data-example-reveal-region]")) {
        reveals[revealKey] = !control.classList.contains("is-hidden");
      }
    });
    slideState.presentationState = {
      version: 1,
      reveals: reveals
    };

    var isStarterSlide = slideState && slideState.type === "starter";
    if (!isStarterSlide || !Array.isArray(slideState.slots)) return slideState;
    var cells = Array.prototype.slice.call(slide.querySelectorAll(".starter-cell")).slice(0, 4);
    cells.forEach(function(cell, slotIndex) {
      var slot = slideState.slots[slotIndex];
      if (!slot) return;
      var controls = cell.querySelector(".live-retrieval-controls");
      var control = cell.querySelector("[data-live-current-image-slot]");
      if (control) {
        var currentImageSlot = Number(control.getAttribute("data-live-current-image-slot") || slot.currentImageSlot || 1);
        if (Number.isFinite(currentImageSlot) && currentImageSlot > 0) {
          slot.currentImageSlot = Math.max(1, Math.min(8, Math.round(currentImageSlot)));
        }
        var itemId = control.getAttribute("data-live-item-id") || "";
        if (itemId) slot.retrievalItemId = itemId;
        slot.lockImageSlot = true;
      }
      if (controls) {
        var loControl = controls.querySelector("[data-live-lo]");
        var lo = loControl ? loControl.getAttribute("data-live-lo") || "" : "";
        if (lo) slot.lo = lo;
      }
      var questionImage = cell.querySelector(".qa-question-layer img") || cell.querySelector(".slide-image-frame img");
      var answerImage = cell.querySelector(".qa-answer-layer img");
      var nextQuestion = imagePayloadFromLiveImage(questionImage, slot.image, "Starter image");
      var nextAnswer = imagePayloadFromLiveImage(answerImage, slot.answerImage, "Starter image answer");
      if (nextQuestion) slot.image = nextQuestion;
      if (nextAnswer) slot.answerImage = nextAnswer;
    });
    return slideState;
  }

  function imagePayloadFromLiveImage(image, fallback, fallbackName) {
    if (!image || !image.getAttribute) return fallback || null;
    var src = image.getAttribute("src") || "";
    if (!src) return fallback || null;
    var next = fallback && typeof fallback === "object" ? clonePlain(fallback) : {};
    next.name = next.name || image.getAttribute("alt") || fallbackName || "Image";
    next.type = next.type || mimeFromPresenterDataUrl(src) || "image/png";
    next.size = next.size || Math.max(0, Math.round(src.length * 0.75));
    next.dataUrl = src;
    return next;
  }

  function mimeFromPresenterDataUrl(value) {
    var match = String(value || "").match(/^data:([^;,]+)/);
    return match ? match[1] : "";
  }

  function stateFromSlideElement(slide, index) {
    if (slide.classList.contains("camera-slide") || slide.dataset.generatedCamera === "true") {
      return {
        id: slide.getAttribute("data-builder-slide-id") || "",
        type: "imported-html",
        title: "Camera photo " + (index + 1),
        className: slide.className,
        html: cleanedSlideHtml(slide)
      };
    }
    if (slide.classList.contains("blank-slide") || slide.dataset.generatedBlank === "true") {
      return {
        id: slide.getAttribute("data-builder-slide-id") || "",
        type: "blank",
        title: "Blank"
      };
    }
    return {
      id: slide.getAttribute("data-builder-slide-id") || "",
      type: "imported-html",
      title: "Imported slide " + (index + 1),
      className: slide.className,
      html: cleanedSlideHtml(slide)
    };
  }

  function cleanedSlideHtml(slide) {
    var clone = slide.cloneNode(true);
    Array.prototype.slice.call(clone.querySelectorAll("script, style, .annotation-svg")).forEach(function(node) {
      node.remove();
    });
    clone.removeAttribute("data-builder-slide-id");
    clone.removeAttribute("data-builder-slide-type");
    return clone.innerHTML.trim();
  }

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function getSlideStrokes(slideIndex) {
    var key = String(slideIndex);
    if (!Array.isArray(strokesBySlide[key])) strokesBySlide[key] = [];
    return strokesBySlide[key];
  }

  function appendStrokePoint(stroke, point) {
    var points = stroke.points || [];
    var previous = points[points.length - 1];
    if (!previous || distance(previous, point) >= 0.35) {
      points.push(point);
      stroke.points = points;
    }
  }

  function pathFromPoints(points) {
    if (!points || !points.length) return "";
    if (points.length === 1) {
      return "M" + round(points[0].x) + " " + round(points[0].y) + " l0.1 0";
    }
    if (points.length === 2) {
      return "M" + round(points[0].x) + " " + round(points[0].y) + " L" + round(points[1].x) + " " + round(points[1].y);
    }

    var d = "M" + round(points[0].x) + " " + round(points[0].y);
    for (var index = 1; index < points.length - 1; index += 1) {
      var mid = midpoint(points[index], points[index + 1]);
      d += " Q" + round(points[index].x) + " " + round(points[index].y) + " " + round(mid.x) + " " + round(mid.y);
    }
    var last = points[points.length - 1];
    d += " L" + round(last.x) + " " + round(last.y);
    return d;
  }

  function midpoint(a, b) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2
    };
  }

  function round(value) {
    return Math.round(Number(value || 0) * 10) / 10;
  }

  function createPath(stroke) {
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathFromPoints(stroke.points));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", stroke.color || "#111827");
    path.setAttribute("stroke-width", String(stroke.width || 6));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    return path;
  }

  function renderSlide(slideIndex) {
    var slide = slides[slideIndex];
    if (!slide) return;
    var svg = getSlideSvg(slide);
    if (!svg) return;
    svg.replaceChildren();
    getSlideStrokes(slideIndex).forEach(function(stroke) {
      svg.appendChild(createPath(stroke));
    });
  }

  function eraseAt(slideIndex, point, svg) {
    var threshold = eraserThresholdFromInput(svg);
    var strokes = getSlideStrokes(slideIndex);
    var removed = [];
    strokesBySlide[String(slideIndex)] = strokes.filter(function(stroke) {
      var hit = strokeHitTest(stroke, point, threshold);
      if (hit) removed.push(stroke);
      return !hit;
    });
    if (removed.length) {
      history.push({ type: "delete", slideIndex: slideIndex, strokes: removed });
      renderSlide(slideIndex);
    }
  }

  function strokeHitTest(stroke, point, threshold) {
    var points = stroke.points || [];
    if (!points.length) return false;
    for (var index = 0; index < points.length; index += 1) {
      if (distance(points[index], point) <= threshold) return true;
      if (index > 0 && distanceToSegment(point, points[index - 1], points[index]) <= threshold) return true;
    }
    return false;
  }

  function distance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function distanceToSegment(point, a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSq = dx * dx + dy * dy;
    if (!lengthSq) return distance(point, a);
    var t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
    return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
  }

  function rebuildHistory() {
    history = [];
    Object.keys(strokesBySlide).forEach(function(key) {
      getSlideStrokes(key).forEach(function(stroke) {
        history.push({ type: "add", slideIndex: Number(key), stroke: stroke });
      });
    });
    history.sort(function(a, b) {
      return Number(a.stroke && a.stroke.createdAt || 0) - Number(b.stroke && b.stroke.createdAt || 0);
    });
  }

  function hasHostedPresenterConfig() {
    return !!(
      presenterConfig &&
      presenterConfig.enabled &&
      presenterConfig.sourceLessonId &&
      presenterConfig.uploadEndpoint &&
      presenterConfig.completeEndpoint &&
      presenterConfig.taughtEndpoint
    );
  }

  function downloadAnnotatedHtml() {
    syncBuilderStateForSave();
    dataEl.textContent = JSON.stringify(strokesBySlide).replace(/</g, "\\\\u003c");
    var clone = document.documentElement.cloneNode(true);
    Array.prototype.slice.call(clone.querySelectorAll("[data-bound],[data-pointer-input-bound]")).forEach(function(node) {
      node.removeAttribute("data-bound");
      node.removeAttribute("data-pointer-input-bound");
    });
    var html = "<!doctype html>\\n" + clone.outerHTML;
    var blob = new Blob([html], { type: "text/html" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    var baseName = pdfBaseName();
    link.href = url;
    link.download = baseName + "-annotated.html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }

  function presentedLessonDocument() {
    var builderState = syncBuilderStateForSave();
    var now = new Date().toISOString();
    var sourceTitle = String(
      builderState.title ||
      (presenterConfig && presenterConfig.originalTitle) ||
      document.title ||
      "Lesson"
    ).trim() || "Lesson";
    if (!presentedLessonTitle) {
      presentedLessonTitle = sourceTitle + " - taught " + formatPresentedTimestamp(new Date(presentedAt));
    }
    return {
      schemaVersion: 1,
      lessonKind: "presented-builder-lesson",
      sourceLessonId: presenterConfig.sourceLessonId,
      title: presentedLessonTitle,
      className: builderState.className || (presenterConfig && presenterConfig.className) || "",
      teachingDate: builderState.teachingDate || (presenterConfig && presenterConfig.teachingDate) || "",
      slides: Array.isArray(builderState.slides) ? clonePlain(builderState.slides) : [],
      presentedAt: presentedAt,
      savedAt: now,
      metadata: {
        sourceLessonId: presenterConfig.sourceLessonId,
        presentedAt: presentedAt
      }
    };
  }

  function formatPresentedTimestamp(date) {
    var value = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    var year = value.getFullYear();
    var month = String(value.getMonth() + 1).padStart(2, "0");
    var day = String(value.getDate()).padStart(2, "0");
    var hours = String(value.getHours()).padStart(2, "0");
    var minutes = String(value.getMinutes()).padStart(2, "0");
    return year + "-" + month + "-" + day + " " + hours + minutes;
  }

  async function savePresentedLessonToBuilder(options) {
    var settings = options && options.silent ? options : {};
    if (!hasHostedPresenterConfig()) {
      if (!settings.silent) alert("This downloaded lesson cannot save back to Lesson Builder.");
      return null;
    }
    if (saveBuilderBtn && !settings.silent) {
      saveBuilderBtn.disabled = true;
      saveBuilderBtn.textContent = "Saving...";
    }
    try {
      var doc = presentedLessonDocument();
      var completed = await uploadPresentedLessonDocument(doc);
      if (!completed || !completed.lesson || !completed.lesson.id) {
        throw new Error("Lesson Builder did not confirm the taught lesson save.");
      }
      presentedLessonId = completed.lesson.id;
      await markPresentedLessonTaught(presentedLessonId);
      if (!settings.silent) alert("Saved taught lesson to Lesson Builder.");
      return completed.lesson;
    } catch (error) {
      console.error(error);
      if (!settings.silent) alert(error.message || "Could not save this taught lesson to Lesson Builder.");
      throw error;
    } finally {
      if (saveBuilderBtn && !settings.silent) {
        saveBuilderBtn.disabled = false;
        saveBuilderBtn.textContent = "Save to Builder";
      }
    }
  }

  async function uploadPresentedLessonDocument(doc) {
    var blob = new Blob([JSON.stringify(doc)], { type: "application/json" });
    var uploadResponse = await fetch(presenterConfig.uploadEndpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: presentedLessonId,
        byteSize: blob.size
      })
    });
    var upload = await readPresenterApiJson(uploadResponse, "Could not create a taught lesson upload URL.");
    await uploadBlobToSignedUrl(upload.signedUrl, blob, "lesson.json");

    var completeResponse = await fetch(presenterConfig.completeEndpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: upload.id,
        path: upload.path,
        title: doc.title,
        className: doc.className,
        teachingDate: doc.teachingDate,
        byteSize: blob.size
      })
    });
    return readPresenterApiJson(completeResponse, "Could not complete taught lesson save.");
  }

  async function uploadBlobToSignedUrl(signedUrl, blob, fileName) {
    if (!signedUrl) throw new Error("Missing signed upload URL.");
    var formData = new FormData();
    formData.append("cacheControl", "3600");
    formData.append("", blob, fileName || "upload.bin");
    var response = await fetch(signedUrl, {
      method: "PUT",
      headers: { "x-upsert": "true" },
      body: formData
    });
    if (!response.ok) throw new Error("Could not upload file (" + response.status + ").");
  }

  async function markPresentedLessonTaught(id) {
    var response = await fetch(presenterConfig.taughtEndpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, taught: true })
    });
    return readPresenterApiJson(response, "Could not mark the taught lesson as taught.");
  }

  async function readPresenterApiJson(response, fallbackMessage) {
    var data = await response.json().catch(function() { return {}; });
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || fallbackMessage || "Lesson Builder request failed.");
    }
    return data;
  }

  function openPrintView() {
    if (!pdfBtn) return;
    refreshSlides();
    if (!slides.length) return;
    pdfBtn.disabled = true;
    pdfBtn.setAttribute("aria-busy", "true");
    try {
      syncBuilderStateForSave();
      dataEl.textContent = JSON.stringify(strokesBySlide).replace(/</g, "\\\\u003c");
      var html = buildPresenterPrintHtml();
      var printWindow = window.open("", "_blank");
      if (!printWindow) {
        alert("The browser blocked the print view. Allow pop-ups for this site and try again.");
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (error) {
      console.error(error);
      alert(error.message || "Could not open the print view.");
    } finally {
      pdfBtn.disabled = false;
      pdfBtn.removeAttribute("aria-busy");
    }
  }

  function buildPresenterPrintHtml() {
    var snapshot = document.implementation.createHTMLDocument(document.title || "Lesson");
    var meta = snapshot.createElement("meta");
    meta.setAttribute("charset", "utf-8");
    snapshot.head.appendChild(meta);

    var viewport = snapshot.createElement("meta");
    viewport.setAttribute("name", "viewport");
    viewport.setAttribute("content", "width=device-width, initial-scale=1");
    snapshot.head.appendChild(viewport);

    var title = snapshot.createElement("title");
    title.textContent = (document.title || "Lesson") + " print";
    snapshot.head.appendChild(title);

    Array.prototype.slice.call(document.querySelectorAll("style")).forEach(function(sourceStyle) {
      var style = snapshot.createElement("style");
      style.textContent = sourceStyle.textContent || "";
      snapshot.head.appendChild(style);
    });

    var printStyle = snapshot.createElement("style");
    printStyle.textContent = printViewCss();
    snapshot.head.appendChild(printStyle);

    var printBar = snapshot.createElement("div");
    printBar.className = "print-window-bar";
    printBar.innerHTML = '<button type="button" onclick="window.print()">Print / Save PDF</button><button type="button" onclick="window.close()">Close</button>';
    snapshot.body.appendChild(printBar);

    var header = document.querySelector(".lesson-header");
    var deck = document.querySelector(".lesson-deck");
    if (header) snapshot.body.appendChild(header.cloneNode(true));
    if (deck) snapshot.body.appendChild(deck.cloneNode(true));

    Array.prototype.slice.call(snapshot.querySelectorAll(".presenter-tools,script,input,.live-retrieval-controls,[data-ignore-annotation]")).forEach(function(node) {
      node.remove();
    });

    var autoPrint = snapshot.createElement("script");
    autoPrint.textContent = printViewAutoPrintScript();
    snapshot.body.appendChild(autoPrint);
    snapshot.body.className = "presenter-print-view";
    return "<!doctype html>\\n" + snapshot.documentElement.outerHTML;
  }

  function printViewCss() {
    return [
      "html,body{margin:0;padding:0;background:#f4f7f6;color:#111827;}",
      ".print-window-bar{position:sticky;top:0;z-index:1000;display:flex;justify-content:center;gap:10px;padding:10px;background:#ffffff;border-bottom:1px solid #cad7d7;box-shadow:0 2px 10px rgba(19,37,42,.12);}",
      ".print-window-bar button{border:1px solid #0f766e;border-radius:7px;background:#0f766e;color:#fff;padding:9px 13px;font:700 15px system-ui,sans-serif;}",
      ".print-window-bar button+button{background:#fff;color:#172124;border-color:#cad7d7;}",
      "body.presenter-print-view .lesson-header{max-width:1120px;margin:14px auto 0;padding:8px 12px;box-sizing:border-box;}",
      "body.presenter-print-view .lesson-deck{display:grid;gap:14px;place-items:center;max-width:none;margin:0;padding:14px;box-sizing:border-box;}",
      "body.presenter-print-view .lesson-slide{width:min(1120px,calc(100vw - 28px));height:auto;aspect-ratio:16/10;margin:0;box-shadow:0 8px 22px rgba(19,37,42,.12);zoom:1!important;}",
      "@media print{.print-window-bar{display:none!important;}html,body{background:#fff!important;}body.presenter-print-view .lesson-header{display:none!important;}body.presenter-print-view .lesson-deck{display:block!important;margin:0!important;padding:0!important;}body.presenter-print-view .lesson-slide{width:16in!important;height:10in!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;box-shadow:none!important;break-after:page;page-break-after:always;overflow:hidden!important;}body.presenter-print-view .lesson-slide:last-child{break-after:auto;page-break-after:auto;}.annotation-svg{pointer-events:none!important;}}"
    ].join("\\n");
  }

  function printViewAutoPrintScript() {
    return [
      "(function(){",
      "function waitForImages(){",
      "var images=Array.prototype.slice.call(document.querySelectorAll('img'));",
      "return Promise.all(images.map(function(image){",
      "if(image.complete&&image.naturalWidth>0)return Promise.resolve();",
      "if(typeof image.decode==='function')return image.decode().catch(function(){});",
      "return new Promise(function(resolve){image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});});",
      "}));",
      "}",
      "function openPrintDialog(){waitForImages().then(function(){setTimeout(function(){window.print();},350);});}",
      "if(document.readyState==='complete')openPrintDialog();else window.addEventListener('load',openPrintDialog,{once:true});",
      "})();"
    ].join("");
  }

  async function saveBrowserPdfCopy() {
    if (!pdfBtn) return;
    refreshSlides();
    if (!slides.length) return;
    pdfBtn.disabled = true;
    var originalText = pdfBtn.textContent;
    pdfBtn.textContent = "...";
    var host = createPdfHostFromDocument();
    document.body.appendChild(host);
    try {
      await nextPdfFrame();
      await downloadPdfFromSlides(
        Array.prototype.slice.call(host.querySelectorAll(".lesson-slide")),
        pdfBaseName() + ".pdf"
      );
    } catch (error) {
      console.error(error);
      alert("Could not save the PDF on this device. Try fewer slides, or use the HTML lesson download.");
    } finally {
      host.remove();
      pdfBtn.disabled = false;
      pdfBtn.textContent = originalText;
    }
  }

  function createPdfHostFromDocument() {
    var host = document.createElement("div");
    host.className = "pdf-export-host";
    host.setAttribute("aria-hidden", "true");
    host.style.position = "fixed";
    host.style.left = "-100000px";
    host.style.top = "0";
    host.style.width = PDF_EXPORT_WIDTH + "px";
    host.style.pointerEvents = "none";
    host.style.zIndex = "-1";
    host.style.background = "#fff";
    refreshSlides();
    slides.forEach(function(slide) {
      host.appendChild(slide.cloneNode(true));
    });
    Array.prototype.slice.call(host.querySelectorAll(".lesson-slide")).forEach(function(slide) {
      preparePdfSlideElement(slide, PDF_EXPORT_WIDTH);
    });
    return host;
  }

  async function downloadPdfFromSlides(pdfSlides, fileName) {
    if (!pdfSlides.length) throw new Error("No slides to export.");
    var cssText = collectPdfCss();
    var lastError = null;
    for (var exportIndex = 0; exportIndex < PDF_EXPORT_WIDTHS.length; exportIndex += 1) {
      var exportWidth = PDF_EXPORT_WIDTHS[exportIndex];
      var pages = [];
      try {
        for (var index = 0; index < pdfSlides.length; index += 1) {
          var slide = pdfSlides[index];
          var aspect = getPdfSlideAspect(slide);
          var width = exportWidth;
          var height = Math.max(1, Math.round(width / aspect));
          preparePdfSlideElement(slide, width);
          await waitForSlideImages(slide);
          await nextPdfFrame();
          pages.push({
            width: width,
            height: height,
            imageWidth: width,
            imageHeight: height,
            imageBytes: await renderSlideToJpegBytes(slide, width, height, cssText)
          });
        }
        downloadPdfBlob(buildPdfFromJpegPages(pages), fileName, "application/pdf");
        return;
      } catch (error) {
        lastError = error;
        pages = [];
        await nextPdfFrame();
      }
    }
    throw lastError || new Error("Could not render the PDF.");
  }

  function preparePdfSlideElement(slide, width) {
    var aspect = getPdfSlideAspect(slide);
    var height = Math.max(1, Math.round(width / aspect));
    slide.style.width = width + "px";
    slide.style.height = height + "px";
    slide.style.maxWidth = "none";
    slide.style.maxHeight = "none";
    slide.style.margin = "0";
    slide.style.boxSizing = "border-box";
    slide.style.boxShadow = "none";
    slide.style.border = "none";
    slide.style.transform = "none";
    slide.style.zoom = "";
  }

  function getPdfSlideAspect(slide) {
    var candidates = [
      slide && slide.getAttribute("data-slide-aspect"),
      slide && slide.style && slide.style.getPropertyValue("--slide-aspect"),
      slide && slide.style && slide.style.aspectRatio
    ];
    for (var index = 0; index < candidates.length; index += 1) {
      var aspect = parsePdfAspect(candidates[index]);
      if (aspect) return normalizePdfAspect(aspect);
    }
    var rect = slide && slide.getBoundingClientRect ? slide.getBoundingClientRect() : null;
    if (rect && rect.width > 0 && rect.height > 0) return normalizePdfAspect(rect.width / rect.height);
    return 16 / 10;
  }

  function parsePdfAspect(value) {
    var text = String(value || "").trim();
    if (!text) return 0;
    if (text.indexOf("/") >= 0) {
      var parts = text.split("/");
      var numerator = Number(parts[0].trim());
      var denominator = Number(parts[1].trim());
      if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) return numerator / denominator;
    }
    var numeric = Number(text);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  function normalizePdfAspect(value) {
    var aspect = Number(value);
    if (!Number.isFinite(aspect) || aspect <= 0) return 16 / 10;
    return Math.max(0.45, Math.min(2.4, Math.round(aspect * 10000) / 10000));
  }

  async function renderSlideToJpegBytes(slide, width, height, cssText) {
    var clone = slide.cloneNode(true);
    inlineComputedStyles(slide, clone);
    revealHiddenPdfContent(clone);
    Array.prototype.slice.call(clone.querySelectorAll(".example-reveal-button")).forEach(function(node) { node.remove(); });
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    clone.style.width = width + "px";
    clone.style.height = height + "px";
    clone.style.maxWidth = "none";
    clone.style.maxHeight = "none";
    clone.style.margin = "0";
    clone.style.boxSizing = "border-box";
    clone.style.boxShadow = "none";
    clone.style.border = "none";
    clone.style.transform = "none";

    var wrapper = document.createElement("div");
    wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    wrapper.setAttribute("class", "pdf-export-page");
    wrapper.style.width = width + "px";
    wrapper.style.height = height + "px";
    wrapper.style.margin = "0";
    wrapper.style.overflow = "hidden";
    wrapper.style.background = "#fff";

    var style = document.createElement("style");
    style.textContent = cssText + "\\n" +
      ".pdf-export-page .lesson-slide{width:" + width + "px!important;height:" + height + "px!important;max-width:none!important;max-height:none!important;box-shadow:none!important;border:none!important;margin:0!important;transform:none!important;}\\n" +
      ".pdf-export-page .example-reveal-button,.pdf-export-page .presenter-tools{display:none!important;}";
    wrapper.appendChild(style);
    wrapper.appendChild(clone);

    var serialized = new XMLSerializer().serializeToString(wrapper);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><foreignObject x="0" y="0" width="' + width + '" height="' + height + '">' + serialized + '</foreignObject></svg>';
    var url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      var image = await loadPdfImage(url);
      var canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      var context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      var bytes = dataUrlToBytes(canvas.toDataURL("image/jpeg", PDF_JPEG_QUALITY));
      canvas.width = 1;
      canvas.height = 1;
      return bytes;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function inlineComputedStyles(source, clone) {
    if (!(source instanceof Element) || !(clone instanceof Element)) return;
    var computed = window.getComputedStyle(source);
    var cssText = "";
    for (var index = 0; index < computed.length; index += 1) {
      var property = computed[index];
      cssText += property + ":" + computed.getPropertyValue(property) + ";";
    }
    clone.setAttribute("style", cssText);
    var sourceChildren = Array.prototype.slice.call(source.children);
    var cloneChildren = Array.prototype.slice.call(clone.children);
    sourceChildren.forEach(function(child, index) {
      if (cloneChildren[index]) inlineComputedStyles(child, cloneChildren[index]);
    });
  }

  function revealHiddenPdfContent(root) {
    Array.prototype.slice.call(root.querySelectorAll(".is-hidden,[aria-hidden='true'],[hidden]")).forEach(function(node) {
      if (node.classList) node.classList.remove("is-hidden");
      node.removeAttribute("aria-hidden");
      node.removeAttribute("hidden");
      forcePdfVisible(node, true);
      Array.prototype.slice.call(node.querySelectorAll("*")).forEach(function(child) {
        forcePdfVisible(child, false);
      });
    });
  }

  function forcePdfVisible(node, allowDisplayReset) {
    if (!node || !node.style) return;
    node.style.visibility = "visible";
    node.style.opacity = "1";
    if (allowDisplayReset) node.style.display = "";
  }

  function collectPdfCss() {
    var chunks = [];
    Array.prototype.slice.call(document.styleSheets || []).forEach(function(sheet) {
      try {
        Array.prototype.slice.call(sheet.cssRules || []).forEach(function(rule) {
          chunks.push(rule.cssText);
        });
      } catch (error) {
        // Computed inline styles still carry the layout when a stylesheet cannot be read.
      }
    });
    return chunks.join("\\n");
  }

  function waitForSlideImages(root) {
    var images = Array.prototype.slice.call(root.querySelectorAll("img"));
    return Promise.all(images.map(function(image) {
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      if (typeof image.decode === "function") return image.decode().catch(function() {});
      return new Promise(function(resolve) {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }));
  }

  function nextPdfFrame() {
    return new Promise(function(resolve) {
      requestAnimationFrame(function() { resolve(); });
    });
  }

  function loadPdfImage(src) {
    return new Promise(function(resolve, reject) {
      var image = new Image();
      image.onload = function() { resolve(image); };
      image.onerror = function() { reject(new Error("Could not render a slide image for the PDF.")); };
      image.src = src;
    });
  }

  function dataUrlToBytes(dataUrl) {
    var base64 = String(dataUrl || "").split(",")[1] || "";
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function buildPdfFromJpegPages(pages) {
    var encoder = new TextEncoder();
    var chunks = [];
    var offsets = [];
    var length = 0;
    var objectCount = 2 + pages.length * 3;

    function appendBytes(bytes) {
      chunks.push(bytes);
      length += bytes.byteLength;
    }
    function appendString(text) {
      appendBytes(encoder.encode(text));
    }
    function beginObject(id) {
      offsets[id] = length;
      appendString(id + " 0 obj\\n");
    }

    appendString("%PDF-1.4\\n%\\u00e2\\u00e3\\u00cf\\u00d3\\n");
    beginObject(1);
    appendString("<< /Type /Catalog /Pages 2 0 R >>\\nendobj\\n");
    beginObject(2);
    appendString("<< /Type /Pages /Count " + pages.length + " /Kids [" + pages.map(function(_, index) { return (3 + index * 3) + " 0 R"; }).join(" ") + "] >>\\nendobj\\n");

    pages.forEach(function(page, index) {
      var pageId = 3 + index * 3;
      var contentId = pageId + 1;
      var imageId = pageId + 2;
      var imageName = "Im" + (index + 1);
      var pageWidth = formatPdfNumber(page.width);
      var pageHeight = formatPdfNumber(page.height);
      var content = "q\\n" + pageWidth + " 0 0 " + pageHeight + " 0 0 cm\\n/" + imageName + " Do\\nQ\\n";

      beginObject(pageId);
      appendString("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pageWidth + " " + pageHeight + "] /Resources << /XObject << /" + imageName + " " + imageId + " 0 R >> >> /Contents " + contentId + " 0 R >>\\nendobj\\n");
      beginObject(contentId);
      appendString("<< /Length " + encoder.encode(content).byteLength + " >>\\nstream\\n" + content + "endstream\\nendobj\\n");
      beginObject(imageId);
      appendString("<< /Type /XObject /Subtype /Image /Width " + page.imageWidth + " /Height " + page.imageHeight + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + page.imageBytes.byteLength + " >>\\nstream\\n");
      appendBytes(page.imageBytes);
      appendString("\\nendstream\\nendobj\\n");
    });

    var xrefStart = length;
    appendString("xref\\n0 " + (objectCount + 1) + "\\n0000000000 65535 f \\n");
    for (var id = 1; id <= objectCount; id += 1) {
      appendString(String(offsets[id] || 0).padStart(10, "0") + " 00000 n \\n");
    }
    appendString("trailer\\n<< /Size " + (objectCount + 1) + " /Root 1 0 R >>\\nstartxref\\n" + xrefStart + "\\n%%EOF");

    return new Blob(chunks, { type: "application/pdf" });
  }

  function formatPdfNumber(value) {
    return Number(value || 0).toFixed(2).replace(/\\.?0+$/, "") || "0";
  }

  function downloadPdfBlob(content, fileName, mimeType) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mimeType || "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }

  function pdfBaseName() {
    return (document.title || "lesson").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "lesson";
  }

  panBtn.addEventListener("click", function() { setMode("pan"); });
  penBtn.addEventListener("click", function() { setMode("pen"); });
  eraserBtn.addEventListener("click", function() { setMode("eraser"); });
  blankSlideBtn.addEventListener("click", addBlankSlide);
  if (cameraBtn) cameraBtn.addEventListener("click", requestCameraCapture);
  if (cameraInput) cameraInput.addEventListener("change", handleCameraCapture);
  zoomBtn.addEventListener("click", toggleZoom);
  fullscreenBtn.addEventListener("click", toggleFullscreen);
  window.addEventListener("resize", schedulePresentationLayout);
  window.addEventListener("orientationchange", schedulePresentationLayout);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", schedulePresentationLayout);
  }
  document.addEventListener("fullscreenchange", updateFullscreenUi);
  document.addEventListener("webkitfullscreenchange", updateFullscreenUi);
  document.addEventListener("msfullscreenchange", updateFullscreenUi);
  document.addEventListener("lessonfocuschange", updateFullscreenUi);
  document.addEventListener("pointermove", handleDocumentPointerMove, true);
  document.addEventListener("pointerup", handleDocumentPointerEnd, true);
  document.addEventListener("pointercancel", handleDocumentPointerEnd, true);
  document.addEventListener("dragstart", suppressAnnotationDragStart, true);
  document.addEventListener("click", suppressRevealClickAfterAnnotation, true);
  colorPickers.forEach(function(input) {
    input.addEventListener("click", function() { setPresenterColor(input.getAttribute("data-color") || input.value, input); });
  });
  if (colorPickerBtn && customColorInput) {
    colorPickerBtn.addEventListener("click", function() {
      customColorInput.click();
    });
    customColorInput.addEventListener("input", function() {
      setPresenterColor(customColorInput.value, null);
    });
  }
  undoBtn.addEventListener("click", function() {
    var action = history.pop();
    if (!action) return;
    if (action.type === "add") {
      strokesBySlide[String(action.slideIndex)] = getSlideStrokes(action.slideIndex).filter(function(stroke) {
        return stroke.id !== action.stroke.id;
      });
    } else if (action.type === "delete") {
      strokesBySlide[String(action.slideIndex)] = getSlideStrokes(action.slideIndex).concat(action.strokes || []);
    }
    renderSlide(action.slideIndex);
  });
  clearBtn.addEventListener("click", function() {
    if (Object.keys(strokesBySlide).some(function(key) { return getSlideStrokes(key).length > 0; }) && !confirm("Clear all presenter annotations?")) return;
    strokesBySlide = {};
    history = [];
    slides.forEach(function(_, index) { renderSlide(index); });
  });
  if (saveBuilderBtn) saveBuilderBtn.addEventListener("click", savePresentedLessonToBuilder);
  if (downloadBtn) downloadBtn.addEventListener("click", downloadAnnotatedHtml);
  if (pdfBtn) pdfBtn.addEventListener("click", openPrintView);

  setMode("pan");
  setPresenterColor("#2563eb", document.getElementById("presenter-color-blue"));
  updateFullscreenUi();
  ensureSlideOverlays();
})();`;
  }

  function standaloneExampleRevealScript() {
    return `document.addEventListener("click", function(event) {
  var qaToggle = event.target && event.target.closest ? event.target.closest("[data-qa-toggle]") : null;
  if (qaToggle) {
    var showingAnswer = qaToggle.classList.toggle("is-showing-answer");
    var mode = qaToggle.getAttribute("data-qa-toggle") || "replace";
    if (mode === "below") {
      qaToggle.setAttribute("aria-expanded", showingAnswer ? "true" : "false");
      var answerRegion = qaToggle.querySelector("[data-qa-answer-region]");
      if (answerRegion) {
        answerRegion.classList.toggle("is-hidden", !showingAnswer);
        answerRegion.setAttribute("aria-hidden", showingAnswer ? "false" : "true");
      }
    } else {
      qaToggle.setAttribute("aria-pressed", showingAnswer ? "true" : "false");
      var label = qaToggle.querySelector("[data-qa-toggle-label]");
      if (label) label.textContent = showingAnswer ? "Answer" : "Question";
    }
    return;
  }
  var button = event.target && event.target.closest ? event.target.closest("[data-example-reveal]") : null;
  if (!button) return;
  var slide = button.closest(".example-slide");
  var region = slide ? slide.querySelector("[data-example-reveal-region]") : null;
  if (!region) return;
  var shouldReveal = region.classList.contains("is-hidden");
  region.classList.toggle("is-hidden", !shouldReveal);
  region.setAttribute("aria-hidden", shouldReveal ? "false" : "true");
  button.setAttribute("aria-expanded", shouldReveal ? "true" : "false");
  button.textContent = shouldReveal ? "Hide second image" : "Show second image";
});`;
  }

  function standaloneLiveRetrievalScript() {
    return `(function() {
  var configElement = document.getElementById("lesson-live-retrieval");
  var config = null;
  try {
    config = JSON.parse(configElement ? configElement.textContent || "null" : "null");
  } catch (error) {
    config = null;
  }
  if (!config || !config.endpoint || !config.lessonId) return;

  document.addEventListener("click", function(event) {
    var nextButton = event.target && event.target.closest ? event.target.closest("[data-live-retrieval-next]") : null;
    if (nextButton) {
      event.preventDefault();
      event.stopPropagation();
      handleNextQuestion(nextButton);
      return;
    }

    var button = event.target && event.target.closest ? event.target.closest("[data-live-retrieval]") : null;
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) return;

    var originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Saving...";

    fetch(config.endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lessonId: config.lessonId,
        lo: button.getAttribute("data-live-lo") || "",
        className: config.className || "",
        teachingDate: config.teachingDate || "",
        slideIndex: Number(button.getAttribute("data-live-slide-index") || 0),
        slotIndex: Number(button.getAttribute("data-live-slot-index") || 0),
        deltaSeen: Number(button.getAttribute("data-live-delta") || 1)
      })
    })
      .then(function(response) {
        return response.json().catch(function() { return {}; }).then(function(data) {
          if (!response.ok || data.ok === false) {
            throw new Error(data.error || "Could not update retrieval tracker.");
          }
          return data;
        });
      })
      .then(function(data) {
        var count = data && data.result ? Number(data.result.seenCount) || 0 : 0;
        button.textContent = "Seen " + count;
        button.classList.add("is-saved");
        window.setTimeout(function() {
          button.textContent = originalText;
          button.classList.remove("is-saved");
          button.disabled = false;
        }, 1600);
      })
      .catch(function(error) {
        console.error(error);
        button.textContent = "Failed";
        button.classList.add("is-error");
        window.setTimeout(function() {
          button.textContent = originalText;
          button.classList.remove("is-error");
          button.disabled = false;
        }, 2200);
      });
  });

  function handleNextQuestion(button) {
    if (button.disabled || !config.nextEndpoint) return;
    var originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Loading...";

    fetch(config.nextEndpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lessonId: config.lessonId,
        retrievalItemId: button.getAttribute("data-live-item-id") || "",
        lo: button.getAttribute("data-live-lo") || "",
        className: config.className || "",
        slideIndex: Number(button.getAttribute("data-live-slide-index") || 0),
        slotIndex: Number(button.getAttribute("data-live-slot-index") || 0),
        advance: true
      })
    })
      .then(function(response) {
        return response.json().catch(function() { return {}; }).then(function(data) {
          if (!response.ok || data.ok === false) {
            throw new Error(data.error || "Could not load the next retrieval question.");
          }
          return data;
        });
      })
      .then(function(data) {
        var result = data && data.result ? data.result : {};
        replaceLiveStarterImage(button, result);
        updateLiveRetrievalButtons(button, result);
        button.textContent = "Loaded";
        button.classList.add("is-saved");
        window.setTimeout(function() {
          button.textContent = originalText;
          button.classList.remove("is-saved");
          button.disabled = false;
        }, 1200);
      })
      .catch(function(error) {
        console.error(error);
        button.textContent = "Failed";
        button.classList.add("is-error");
        window.setTimeout(function() {
          button.textContent = originalText;
          button.classList.remove("is-error");
          button.disabled = false;
        }, 2200);
      });
  }

  function replaceLiveStarterImage(button, result) {
    var cell = button.closest ? button.closest(".starter-cell") : null;
    var host = cell ? cell.querySelector("[data-live-image-host]") : null;
    if (!host) return;
    var slotIndex = Number(button.getAttribute("data-live-slot-index") || 0);
    var revealKey = "starter-answer-" + Math.max(0, Math.min(3, Math.round(slotIndex)));
    host.innerHTML = "";
    host.appendChild(createLiveImageNode(result.questionImage, result.answerImage, revealKey));
  }

  function updateLiveRetrievalButtons(button, result) {
    var controls = button.closest ? button.closest(".live-retrieval-controls") : null;
    if (!controls) return;
    Array.prototype.forEach.call(controls.querySelectorAll("[data-live-item-id]"), function(control) {
      if (result.itemId) control.setAttribute("data-live-item-id", result.itemId);
      if (result.currentImageSlot) control.setAttribute("data-live-current-image-slot", String(result.currentImageSlot));
    });
  }

  function createLiveImageNode(questionImage, answerImage, revealKey) {
    if (!answerImage || !answerImage.dataUrl) return createImageFrame(questionImage, "Starter image");

    var button = document.createElement("button");
    button.type = "button";
    button.className = "qa-toggle qa-toggle-replace";
    button.setAttribute("data-qa-toggle", "replace");
    button.setAttribute("data-reveal-key", revealKey || "");
    button.setAttribute("aria-pressed", "false");

    var label = document.createElement("span");
    label.className = "qa-toggle-label";
    label.setAttribute("data-qa-toggle-label", "");
    label.textContent = "Question";
    button.appendChild(label);

    var questionLayer = document.createElement("span");
    questionLayer.className = "qa-image-layer qa-question-layer";
    questionLayer.appendChild(createImageFrame(questionImage, "Starter image"));
    button.appendChild(questionLayer);

    var answerLayer = document.createElement("span");
    answerLayer.className = "qa-image-layer qa-answer-layer";
    answerLayer.appendChild(createImageFrame(answerImage, "Starter image answer"));
    button.appendChild(answerLayer);

    return button;
  }

  function createImageFrame(image, alt) {
    var frame = document.createElement("span");
    frame.className = "slide-image-frame";
    if (!image || !image.dataUrl) return frame;
    var img = document.createElement("img");
    img.className = "slide-image-fit";
    img.src = image.dataUrl;
    img.alt = alt || image.name || "Image";
    frame.appendChild(img);
    return frame;
  }
})();`;
  }

  function standaloneCss() {
    return `
body{margin:0;background:#f4f7f8;color:#111827;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
:root{--presenter-edge-space:6px;--presenter-toolbar-space:64px;--presenter-slide-width:100vw;--presenter-slide-height:62.5vw;}
.lesson-header{position:sticky;top:0;z-index:4;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 20px;background:#fff;border-bottom:1px solid #cad7d7;}
.lesson-header h1{font-size:22px;margin:0;}
.lesson-header span,.lesson-header div:last-child{color:#5b6a70;font-size:13px;}
.lesson-deck{display:grid;gap:20px;padding:20px;max-width:1180px;margin:0 auto;}
.lesson-slide{box-sizing:border-box;aspect-ratio:var(--slide-aspect,16/10);background:#fffefb;color:#111827;position:relative;overflow:hidden;padding:24px;border:1px solid #cad7d7;box-shadow:0 16px 34px rgba(19,37,42,.12);page-break-after:always;touch-action:none;}
.lesson-slide h4{margin:0 0 14px;font-size:28px;line-height:1.2;}
.slide-label{position:absolute;right:12px;bottom:10px;font-size:11px;color:#6b7280;}
.blank-slide{padding:0;background:#fff;}
.camera-slide{padding:0;background:#fff;display:grid;place-items:center;overflow:hidden;}
.camera-slide-image{display:block;width:100%;height:100%;object-fit:contain;object-position:center;background:#fff;}
.starter-slide-grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;height:100%;min-height:0;}
.starter-cell{border:1px solid #111827;display:grid;grid-template-rows:1fr;min-width:0;min-height:0;overflow:hidden;padding:0;position:relative;}
.live-starter-image-host{display:grid;min-width:0;min-height:0;width:100%;height:100%;}
.live-retrieval-controls{position:absolute;z-index:9;display:grid;grid-template-columns:repeat(3,28px);gap:5px;align-items:center;}
.starter-cell:nth-child(1) .live-retrieval-controls{left:8px;top:8px;right:auto;bottom:auto;}
.starter-cell:nth-child(2) .live-retrieval-controls{right:8px;top:8px;left:auto;bottom:auto;}
.starter-cell:nth-child(3) .live-retrieval-controls{left:8px;bottom:8px;right:auto;top:auto;}
.starter-cell:nth-child(4) .live-retrieval-controls{right:8px;bottom:8px;left:auto;top:auto;}
.live-retrieval-button{width:28px;height:28px;border:1px solid #0f766e;border-radius:7px;background:rgba(255,255,255,.92);color:#0f766e;cursor:pointer;font:inherit;font-size:12px;font-weight:800;line-height:1;padding:0;box-shadow:0 6px 16px rgba(15,118,110,.18);touch-action:manipulation;}
.live-retrieval-button:hover{background:#ecfdf5;}
.live-retrieval-button:disabled{cursor:wait;opacity:.78;}
.live-retrieval-button.is-saved{background:#0f766e;color:#fff;}
.live-retrieval-button.is-error{border-color:#b91c1c;color:#b91c1c;}
.slide-image-frame{display:grid;place-items:center;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;}
.slide-image-fit{display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;min-width:0;min-height:0;}
.qa-toggle{position:relative;display:block;width:100%;height:100%;min-height:0;border:0;background:transparent;color:inherit;padding:0;cursor:pointer;}
.qa-toggle-label{position:absolute;right:8px;top:8px;z-index:4;border-radius:7px;background:rgba(255,255,255,.86);color:#111827;font-size:10px;font-weight:750;padding:4px 7px;}
.qa-image-layer{position:absolute;inset:0;display:grid;min-width:0;min-height:0;}
.qa-answer-layer{visibility:hidden;}
.qa-toggle.is-showing-answer .qa-question-layer{visibility:hidden;}
.qa-toggle.is-showing-answer .qa-answer-layer{visibility:visible;}
.qa-toggle,.qa-question-button,.example-qa-block,.example-reveal-button{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-user-drag:none;}
.qa-toggle img,.qa-question-button img,.example-qa-block img{pointer-events:none;-webkit-user-drag:none;user-select:none;}
.example-slide .lo-bar{border-bottom:2px solid #111827;padding-bottom:4px;margin-bottom:10px;font-size:10px;line-height:1.2;display:flex;align-items:center;gap:10px;}
.lo-bar-text{flex:1;min-width:0;}
.example-slide .slide-image-fit{object-position:top center;}
.example-reveal-button{border:1px solid #9ca3af;border-radius:6px;background:#fff;color:#111827;cursor:pointer;font:inherit;font-size:10px;line-height:1;padding:4px 7px;white-space:nowrap;}
.example-reveal-button:hover{border-color:#111827;}
.example-reveal-region.is-hidden{visibility:hidden;}
.example-images{display:grid;grid-template-columns:1fr 1fr;gap:18px;height:calc(100% - 28px);min-height:0;}
.example-qa-block{display:grid;grid-template-rows:minmax(0,1fr) auto;gap:10px;height:100%;min-height:0;overflow:auto;}
.qa-question-button{display:grid;height:100%;min-height:0;border:0;background:transparent;padding:0;cursor:pointer;}
.example-answer-region{min-height:42%;border-top:2px solid #111827;padding-top:8px;}
.example-answer-region.is-hidden{display:none;}
.single-image{height:calc(100% - 24px);display:grid;place-items:center;min-height:0;overflow:hidden;}
.cfu-slide.full .cfu-image-wrap{inset:18px;}
.cfu-image-wrap{position:absolute;display:grid;place-items:center;min-width:0;min-height:0;overflow:hidden;}
.cfu-slide.top-left .cfu-image-wrap{left:20px;top:20px;width:48%;height:48%;}
.cfu-slide.top-center .cfu-image-wrap{left:26%;top:20px;width:48%;height:48%;}
.revision-slide{padding:0;background:#fff;}
.revision-slide::before{content:"";position:absolute;inset:0 auto 0 50%;z-index:3;width:2px;background:#111827;transform:translateX(-1px);pointer-events:none;}
.revision-slide-grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;height:100%;min-height:0;}
.revision-question-cell,.revision-working-area{min-width:0;min-height:0;overflow:hidden;}
.revision-question-cell{display:grid;place-items:center;}
.revision-working-area{grid-column:1/-1;}
.drawing-slide{padding:0;background:#fff;}
.drawing-slide img{display:block;width:100%;height:100%;object-fit:contain;background:#fff;}
.pdf-page-slide{padding:0;background:#fff;}
.pdf-page-slide .slide-image-fit{object-position:top center;}
.placeholder-slide,.math-slide,.retrieval-slide,.worksheet-slide{display:grid;place-items:center;text-align:center;}
.template-slide{display:grid;place-items:center;text-align:center;}
.template-slide-inner{width:min(76%,940px);text-align:left;}
.template-slide-inner h4{font-size:34px;margin-bottom:26px;}
.template-slide-inner ul{display:grid;gap:14px;margin:0;padding-left:1.3em;font-size:29px;line-height:1.25;}
.placeholder-slide p{max-width:84%;font-size:36px;line-height:1.25;white-space:pre-wrap;}
.math-slide-inner{max-height:82%;width:86%;min-width:0;overflow:auto;text-align:left;}
.math-slide-inner h4{text-align:center;}
.latex-rendered{display:grid;gap:12px;color:#111827;font-size:20px;line-height:1.45;}
.latex-rendered p,.latex-list{margin:0;}
.latex-list{padding-left:1.2em;}
.latex-math{font-family:Georgia,"Times New Roman",serif;line-height:1.25;}
.latex-inline{display:inline-flex;align-items:baseline;gap:.05em;vertical-align:baseline;}
.latex-display{display:flex;justify-content:center;align-items:center;gap:.08em;width:100%;padding:8px 0;font-size:1.25em;text-align:center;}
.latex-align{display:grid;gap:8px;}
.latex-align-row{display:flex;justify-content:center;}
.latex-frac{display:inline-grid;grid-template-rows:auto auto;align-items:center;justify-items:center;margin:0 .1em;vertical-align:middle;}
.latex-frac-num,.latex-frac-den{display:block;padding:0 .18em;}
.latex-frac-num{border-bottom:1.5px solid currentColor;}
.latex-root{display:inline-flex;align-items:flex-start;gap:.02em;vertical-align:middle;}
.latex-root>sup{margin-right:-.18em;font-size:.55em;}
.latex-radical{font-size:1.25em;line-height:1;}
.latex-root-body{display:inline-block;padding:.05em .12em 0;border-top:1.5px solid currentColor;}
.latex-script{display:inline-flex;align-items:baseline;vertical-align:baseline;}
.latex-script sup,.latex-script sub{font-size:.65em;line-height:1;}
.latex-script sup{align-self:flex-start;margin-left:.04em;}
.latex-script sub{align-self:flex-end;margin-left:.04em;}
.latex-text,.latex-fn{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-style:normal;}
.latex-var,.latex-italic{font-style:italic;}
.latex-bold{font-weight:800;}
.latex-accent{display:inline-block;text-decoration-thickness:1.5px;}
.latex-accent-hat{position:relative;}
.latex-accent-hat::before{content:"^";position:absolute;left:50%;top:-.7em;transform:translateX(-50%);font-size:.75em;}
.latex-accent-bar,.latex-accent-overline{text-decoration-line:overline;}
.latex-accent-vec{text-decoration-line:overline;}
.latex-quad{display:inline-block;width:1em;}
.latex-qquad{display:inline-block;width:2em;}
.retrieval-slide ul{width:82%;text-align:left;font-size:28px;line-height:1.35;}
.worksheet-links{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:18px;}
.worksheet-links a{color:#fff;background:#0f766e;border-radius:8px;padding:10px 14px;text-decoration:none;font-weight:750;}
.empty-state{border:1px dashed #8ba3a0;border-radius:8px;background:rgba(255,255,255,.7);color:#5b6a70;padding:18px;text-align:center;}
.presenter-tools{position:fixed;left:50%;top:4px;top:max(4px,env(safe-area-inset-top));transform:translateX(-50%);z-index:20;display:flex;align-items:center;justify-content:flex-start;flex-wrap:nowrap;gap:5px;max-width:calc(100vw - 8px);overflow-x:auto;overflow-y:hidden;white-space:nowrap;scrollbar-width:none;touch-action:pan-x;padding:5px;border:1px solid #cad7d7;border-radius:8px;background:rgba(255,255,255,.94);box-shadow:0 6px 16px rgba(19,37,42,.16);}
.presenter-tools::-webkit-scrollbar{display:none;}
.presenter-tool{min-height:36px;border:1px solid #cad7d7;border-radius:7px;background:#fff;color:#172124;padding:5px 8px;font:inherit;font-size:15px;font-weight:750;cursor:pointer;white-space:nowrap;flex:0 0 auto;}
.presenter-tool:hover{border-color:#8ba3a0;}
.presenter-tool.is-active,.presenter-tool.primary{background:#0f766e;border-color:#0f766e;color:#fff;}
.presenter-tool-icon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;vertical-align:middle;}
.presenter-tool-icon svg{display:block;width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
.presenter-colors{display:flex;align-items:center;gap:3px;flex:0 0 auto;}
.presenter-color{width:36px;height:36px;border:1px solid #cad7d7;border-radius:7px;background:var(--swatch-color,#2563eb);padding:0;cursor:pointer;flex:0 0 auto;}
.presenter-color.is-active{border-color:#0f766e;box-shadow:0 0 0 2px rgba(15,118,110,.22);}
.presenter-custom-color{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}
.presenter-camera-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}
.presenter-size{width:96px;height:33px;flex:0 0 auto;}
.annotation-svg{position:absolute;inset:0;z-index:8;width:100%;height:100%;pointer-events:none;touch-action:none;cursor:crosshair;}
.annotation-svg path{pointer-events:none;}
body:not(.annotation-pan) .lesson-slide{cursor:crosshair;}
body.annotation-eraser .lesson-slide{cursor:cell;}
body.annotation-pan .annotation-svg{pointer-events:none;}
body.annotation-eraser .annotation-svg{cursor:cell;}
body.focus-mode .lesson-header,body.fullscreen-mode .lesson-header{display:none;}
body.focus-mode,body.fullscreen-mode{overflow:hidden;}
body.focus-mode .lesson-deck,body.fullscreen-mode .lesson-deck{max-width:none;box-sizing:border-box;height:100vh;height:100dvh;min-height:0;padding:var(--presenter-toolbar-space) var(--presenter-edge-space) var(--presenter-edge-space);gap:0;place-items:center;overflow:auto;scroll-padding-top:var(--presenter-toolbar-space);}
body.focus-mode .lesson-slide,body.fullscreen-mode .lesson-slide{box-sizing:border-box;border:none;box-shadow:none;width:var(--presenter-slide-width);height:var(--presenter-slide-height);max-width:calc(100vw - 12px);max-height:calc(100vh - var(--presenter-toolbar-space) - var(--presenter-edge-space));max-height:calc(100dvh - var(--presenter-toolbar-space) - var(--presenter-edge-space));scroll-snap-align:center;}
body.focus-mode .lesson-slide.pdf-page-slide,body.fullscreen-mode .lesson-slide.pdf-page-slide{max-height:none;align-self:start;scroll-snap-align:start center;}
body.presenter-zoom-mode.focus-mode .lesson-deck,body.presenter-zoom-mode.fullscreen-mode .lesson-deck{place-items:start;justify-items:start;align-items:start;overflow:auto;overscroll-behavior:contain;scroll-padding-left:var(--presenter-edge-space);}
body.presenter-zoom-mode.focus-mode .lesson-slide,body.presenter-zoom-mode.fullscreen-mode .lesson-slide{max-width:none;max-height:none;scroll-snap-align:start;}
@media (max-width:760px){.presenter-tools{left:4px;right:4px;top:4px;top:max(4px,env(safe-area-inset-top));transform:none}.presenter-tool{padding:5px 6px;font-size:14px}.presenter-size{width:84px}}
@page{size:16in 10in;margin:0}
@media print{.lesson-header,.example-reveal-button{display:none}.lesson-deck{display:block;padding:0}.lesson-slide{box-shadow:none;border:none;width:16in;height:10in;page-break-after:always;}}
`;
  }

  function createPdfExportHost(slidesHtml) {
    const host = document.createElement("div");
    host.className = "pdf-export-host";
    host.setAttribute("aria-hidden", "true");
    Object.assign(host.style, {
      position: "fixed",
      left: "-100000px",
      top: "0",
      width: `${PDF_EXPORT_WIDTH}px`,
      pointerEvents: "none",
      zIndex: "-1",
      background: "#fff"
    });
    host.innerHTML = slidesHtml || "";
    Array.from(host.querySelectorAll(".lesson-slide")).forEach((slide) => {
      preparePdfSlideElement(slide, PDF_EXPORT_WIDTH);
    });
    return host;
  }

  async function downloadSlidesPdf(slides, fileName, title) {
    if (!slides.length) throw new Error("No slides to export.");
    const pages = await renderSlidesToJpegPages(slides);
    downloadBlob(buildPdfFromJpegPages(pages, title), fileName, "application/pdf");
  }

  async function renderSlidesToJpegPages(slides, renderOptions) {
    if (!slides.length) throw new Error("No slides to export.");
    const options = renderOptions || {};
    const cssText = collectPdfCss();
    let lastError = null;

    for (const exportWidth of PDF_EXPORT_WIDTHS) {
      let pages = [];
      try {
        for (let index = 0; index < slides.length; index += 1) {
          const slide = slides[index];
          const aspect = getPdfSlideAspect(slide);
          const width = exportWidth;
          const height = Math.max(1, Math.round(width / aspect));
          preparePdfSlideElement(slide, width);
          if (typeof options.prepareSlide === "function") options.prepareSlide(slide, index);
          await waitForSlideImages(slide);
          await nextAnimationFrame();
          pages.push(await renderSlideToJpegPage(slide, width, height, cssText, {
            revealHiddenContent: options.revealHiddenContent !== false
          }));
        }

        return pages;
      } catch (error) {
        lastError = error;
        pages = [];
        await nextAnimationFrame();
      }
    }

    throw lastError || new Error("Could not render the slides.");
  }

  function preparePdfSlideElement(slide, width) {
    const aspect = getPdfSlideAspect(slide);
    const height = Math.max(1, Math.round(width / aspect));
    Object.assign(slide.style, {
      width: `${width}px`,
      height: `${height}px`,
      maxWidth: "none",
      maxHeight: "none",
      margin: "0",
      boxSizing: "border-box",
      boxShadow: "none",
      border: "none",
      transform: "none"
    });
  }

  function getPdfSlideAspect(slide) {
    const candidates = [
      slide && slide.getAttribute("data-slide-aspect"),
      slide && slide.style && slide.style.getPropertyValue("--slide-aspect"),
      slide && slide.style && slide.style.aspectRatio
    ];
    for (const candidate of candidates) {
      const aspect = parsePdfAspect(candidate);
      if (aspect) return normalizeSlideAspect(aspect);
    }
    const rect = slide && slide.getBoundingClientRect ? slide.getBoundingClientRect() : null;
    if (rect && rect.width > 0 && rect.height > 0) return normalizeSlideAspect(rect.width / rect.height);
    return 16 / 10;
  }

  function parsePdfAspect(value) {
    const text = String(value || "").trim();
    if (!text) return 0;
    if (text.includes("/")) {
      const parts = text.split("/");
      const numerator = Number(parts[0].trim());
      const denominator = Number(parts[1].trim());
      if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
        return numerator / denominator;
      }
    }
    const numeric = Number(text);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  async function renderSlideToJpegBytes(slide, width, height, cssText) {
    const page = await renderSlideToJpegPage(slide, width, height, cssText);
    return page.imageBytes;
  }

  async function renderSlideToJpegPage(slide, width, height, cssText, renderOptions) {
    const options = renderOptions || {};
    const clone = slide.cloneNode(true);
    inlineComputedStyles(slide, clone);
    if (options.revealHiddenContent !== false) revealHiddenPdfContent(clone);
    clone.querySelectorAll(".example-reveal-button").forEach((node) => node.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    Object.assign(clone.style, {
      width: `${width}px`,
      height: `${height}px`,
      maxWidth: "none",
      maxHeight: "none",
      margin: "0",
      boxSizing: "border-box",
      boxShadow: "none",
      border: "none",
      transform: "none"
    });

    const wrapper = document.createElement("div");
    wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    wrapper.setAttribute("class", "pdf-export-page");
    Object.assign(wrapper.style, {
      width: `${width}px`,
      height: `${height}px`,
      margin: "0",
      overflow: "hidden",
      background: "#fff"
    });

    const style = document.createElement("style");
    style.textContent = `${cssText}
.pdf-export-page .lesson-slide{width:${width}px!important;height:${height}px!important;max-width:none!important;max-height:none!important;box-shadow:none!important;border:none!important;margin:0!important;transform:none!important;}
.pdf-export-page .example-reveal-button,.pdf-export-page .presenter-tools{display:none!important;}`;
    wrapper.appendChild(style);
    wrapper.appendChild(clone);

    const serialized = new XMLSerializer().serializeToString(wrapper);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${serialized}</foreignObject></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const image = await loadPdfImage(url);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", PDF_JPEG_QUALITY);
      const bytes = dataUrlToBytes(dataUrl);
      canvas.width = 1;
      canvas.height = 1;
      return {
        width,
        height,
        imageWidth: width,
        imageHeight: height,
        imageBytes: bytes,
        dataUrl
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function inlineComputedStyles(source, clone) {
    if (!(source instanceof Element) || !(clone instanceof Element)) return;
    const computed = window.getComputedStyle(source);
    let cssText = "";
    for (let index = 0; index < computed.length; index += 1) {
      const property = computed[index];
      cssText += `${property}:${computed.getPropertyValue(property)};`;
    }
    clone.setAttribute("style", cssText);

    const sourceChildren = Array.from(source.children);
    const cloneChildren = Array.from(clone.children);
    sourceChildren.forEach((child, index) => {
      if (cloneChildren[index]) inlineComputedStyles(child, cloneChildren[index]);
    });
  }

  function revealHiddenPdfContent(root) {
    Array.from(root.querySelectorAll(".is-hidden,[aria-hidden='true'],[hidden]")).forEach((node) => {
      if (node.classList) node.classList.remove("is-hidden");
      node.removeAttribute("aria-hidden");
      node.removeAttribute("hidden");
      forcePdfVisible(node, true);
      Array.from(node.querySelectorAll("*")).forEach((child) => {
        forcePdfVisible(child, false);
      });
    });
  }

  function forcePdfVisible(node, allowDisplayReset) {
    if (!node || !node.style) return;
    node.style.visibility = "visible";
    node.style.opacity = "1";
    if (allowDisplayReset) node.style.display = "";
  }

  function collectPdfCss() {
    const chunks = [];
    Array.from(document.styleSheets || []).forEach((sheet) => {
      try {
        Array.from(sheet.cssRules || []).forEach((rule) => chunks.push(rule.cssText));
      } catch (error) {
        // Cross-origin stylesheets cannot be read. The computed inline styles still carry the layout.
      }
    });
    return chunks.join("\n");
  }

  function waitForSlideImages(root) {
    const images = Array.from(root.querySelectorAll("img"));
    return Promise.all(images.map((image) => {
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      if (typeof image.decode === "function") {
        return image.decode().catch(() => undefined);
      }
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }));
  }

  function nextAnimationFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function loadPdfImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not render a slide image for the PDF."));
      image.src = src;
    });
  }

  function dataUrlToBytes(dataUrl) {
    const base64 = String(dataUrl || "").split(",")[1] || "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function buildPdfFromJpegPages(pages) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let length = 0;
    const objectCount = 2 + pages.length * 3;

    const appendBytes = (bytes) => {
      chunks.push(bytes);
      length += bytes.byteLength;
    };
    const appendString = (text) => appendBytes(encoder.encode(text));
    const beginObject = (id) => {
      offsets[id] = length;
      appendString(`${id} 0 obj\n`);
    };

    appendString("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n");
    beginObject(1);
    appendString("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    beginObject(2);
    appendString(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${3 + index * 3} 0 R`).join(" ")}] >>\nendobj\n`);

    pages.forEach((page, index) => {
      const pageId = 3 + index * 3;
      const contentId = pageId + 1;
      const imageId = pageId + 2;
      const imageName = `Im${index + 1}`;
      const pageWidth = formatPdfNumber(page.width);
      const pageHeight = formatPdfNumber(page.height);
      const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/${imageName} Do\nQ\n`;

      beginObject(pageId);
      appendString(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
      beginObject(contentId);
      appendString(`<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}endstream\nendobj\n`);
      beginObject(imageId);
      appendString(`<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.imageBytes.byteLength} >>\nstream\n`);
      appendBytes(page.imageBytes);
      appendString("\nendstream\nendobj\n");
    });

    const xrefStart = length;
    appendString(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
    for (let id = 1; id <= objectCount; id += 1) {
      appendString(`${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`);
    }
    appendString(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

    return new Blob(chunks, { type: "application/pdf" });
  }

  function formatPdfNumber(value) {
    return Number(value || 0).toFixed(2).replace(/\.?0+$/, "") || "0";
  }

  function downloadBlob(content, fileName, mimeType) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function clearPersistedState() {
    window.clearTimeout(persistTimer);
    localStorage.removeItem(STORAGE_KEY);
    return openBuilderDb()
      .then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STATE_STORE, "readwrite");
        tx.objectStore(DB_STATE_STORE).delete(CURRENT_STATE_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("Could not clear IndexedDB state."));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error || new Error("IndexedDB clear was aborted."));
        };
      }))
      .catch((err) => console.warn("Could not clear IndexedDB state", err));
  }

  function resetLessonDrafts() {
    Object.assign(draft, {
      starter: [
        { lo: "", image: null, answerImage: null, retrievalItemId: "", currentImageSlot: 1 },
        { lo: "", image: null, answerImage: null, retrievalItemId: "", currentImageSlot: 1 },
        { lo: "", image: null, answerImage: null, retrievalItemId: "", currentImageSlot: 1 },
        { lo: "", image: null, answerImage: null, retrievalItemId: "", currentImageSlot: 1 }
      ],
      example: {
        lo: "",
        spacing: 1.3,
        image1: null,
        image2: null,
        answerImage1: null,
        answerImage2: null,
        retrievalImages: emptyRetrievalImages(),
        retrievalAnswerImages: emptyRetrievalImages()
      },
      worksheet: { title: "", worksheet: null, answers: null },
      pdf: { file: null, renderWidth: 1800 },
      cfu: { placement: "full", image: null },
      placeholder: { text: "" },
      math: { questions: "", answers: "" }
    });
    drawingState.strokes = [];
    drawingState.activeStroke = null;
    resizeDrawingCanvas(DEFAULT_DRAWING_SIZE.width, DEFAULT_DRAWING_SIZE.height);
    $("drawing-resolution").value = "2560x1600";
    $("drawing-size").value = String(DEFAULT_PEN_SIZE);
    setDrawingMode("pen");
  }

  function resetLesson() {
    if (!confirm("Reset this local lesson? This clears browser state for this app.")) return;
    state = createInitialState();
    resetLessonDrafts();
    clearPersistedState();
    syncStateFields();
    syncDraftFields();
    renderAll();
    renderSavedLessons();
    setStatus("Reset local lesson.", "success");
  }

  function syncStateFields() {
    $("lesson-title").value = state.title || "";
    renderClassOptions();
    $("class-name").value = state.className || "";
    $("teaching-date").value = state.teachingDate || todayIso();
  }

  function syncDraftFields() {
    [0, 1, 2, 3].forEach((index) => {
      $(`starter-lo-${index}`).value = draft.starter[index].lo;
      renderImageZone($(`starter-image-${index}`), draft.starter[index].image);
    });
    $("example-lo").value = draft.example.lo;
    updateExampleRetrievalBankStatus();
    $("example-spacing").value = draft.example.spacing;
    renderImageZone($("example-image-1"), draft.example.image1);
    renderImageZone($("example-image-2"), draft.example.image2);
    renderImageZone($("example-answer-image-1"), draft.example.answerImage1);
    renderImageZone($("example-answer-image-2"), draft.example.answerImage2);
    draft.example.retrievalImages = normalizeRetrievalImages(draft.example.retrievalImages);
    draft.example.retrievalAnswerImages = normalizeRetrievalImages(draft.example.retrievalAnswerImages);
    draft.example.retrievalImages.forEach((image, index) => {
      renderImageZone($(`example-retrieval-image-${index}`), image);
      renderImageZone($(`example-retrieval-answer-image-${index}`), draft.example.retrievalAnswerImages[index]);
    });
    $("worksheet-title").value = draft.worksheet.title;
    renderFileZone($("worksheet-file"), draft.worksheet.worksheet);
    renderFileZone($("answers-file"), draft.worksheet.answers);
    $("pdf-render-width").value = String(draft.pdf.renderWidth || 1800);
    renderFileZone($("pdf-file-drop"), null);
    $("pdf-summary").textContent = draft.pdf.file ? `${draft.pdf.file.name || "PDF"} selected.` : "No PDF selected.";
    $("cfu-placement").value = draft.cfu.placement;
    renderImageZone($("cfu-image"), draft.cfu.image);
    $("placeholder-text").value = draft.placeholder.text;
    $("math-questions").value = draft.math.questions;
    $("math-answers").value = draft.math.answers;
    renderMathLivePreview();
    setDrawingMode("pen");
  }

  function renderClassOptions() {
    const select = $("class-name");
    const classNames = getClassNamesForSelect();
    state.classNames = classNames;
    select.innerHTML = [
      `<option value="">All classes</option>`,
      ...classNames.map((className) => `<option value="${escapeAttr(className)}">${escapeHtml(className)}</option>`)
    ]
      .join("");
    select.value = state.className || "";
  }

  function renderAll() {
    renderClassOptions();
    renderTemplateEditor();
    renderRetrievalRows();
    renderMathLivePreview();
    renderPreview();
    renderSavedLessons();
  }

  async function boot() {
    const currentUserPromise = loadCurrentUser();
    state = await loadState();
    wireInputs();
    syncStateFields();
    syncDraftFields();
    renderAll();
    loadSavedLessons().catch((err) => console.warn("Could not start saved lesson library", err));
    currentUserPromise.catch((err) => console.warn("Could not start current user lookup", err));
    if (state.updatedAt !== cloudLastSyncedAt && !initialCloudRefreshInFlight) scheduleCloudPersist();
  }

  boot().catch((err) => {
    console.error(err);
    state = createInitialState();
    const currentUserPromise = loadCurrentUser();
    wireInputs();
    syncStateFields();
    syncDraftFields();
    renderAll();
    loadSavedLessons().catch((libraryErr) => console.warn("Could not start saved lesson library", libraryErr));
    currentUserPromise.catch((userErr) => console.warn("Could not start current user lookup", userErr));
    scheduleCloudPersist();
    setStatus("Started with a new local lesson because saved state could not be loaded.", "warn");
  });
})();
