/**
 * TEMPORARY: FastAPI expects userId:int; demo-… / non-numeric ids return 422.
 * While flag is true, all API calls use one random integer per device profile
 * (localStorage). Set USE_TEMP_RANDOM_BACKEND_USER_ID to false after backend
 * accepts string ids.
 */
var USE_TEMP_RANDOM_BACKEND_USER_ID = true;
var TEMP_BACKEND_USER_ID_SESSION_KEY = "seeandsayTempBackendUserId";

var inMemoryTempBackendUserId = null;

function readStoredApiKey(key) {
  try {
    var ls = localStorage.getItem(key);
    if (ls != null && ls !== "") {
      return ls;
    }
    if (typeof sessionStorage !== "undefined") {
      var ss = sessionStorage.getItem(key);
      if (ss != null && ss !== "") {
        localStorage.setItem(key, ss);
        sessionStorage.removeItem(key);
        return ss;
      }
    }
  } catch (e) {}
  return null;
}

function writeStoredApiKey(key, value) {
  try {
    localStorage.setItem(key, String(value));
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(key);
    }
  } catch (e) {}
}

function removeStoredApiKey(key) {
  try {
    localStorage.removeItem(key);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(key);
    }
  } catch (e) {}
}

function getApiBaseUrl() {
  var apiBaseOverride =
    (window && (window.MILI_API_BASE_URL || window.SEEANDSAY_API_BASE_URL)) || null;
  if (apiBaseOverride) {
    var configured = String(apiBaseOverride).replace(/\/+$/, "");
    // Guard against pointing API to static file server port by mistake.
    if (/^https?:\/\/(localhost|127\.0\.0\.1):8000$/i.test(configured)) {
      var sameHost = (window && window.location && window.location.hostname) ? window.location.hostname : "127.0.0.1";
      return "http://" + sameHost + ":8001";
    }
    return configured;
  }
  var isLocalHost = window && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  if (isLocalHost) {
    var host = window.location.hostname || "127.0.0.1";
    return "http://" + host + ":8001";
  }
  return "https://seeandsay-backend.onrender.com";
}

function getOrCreateTempBackendUserId() {
  try {
    var s = readStoredApiKey(TEMP_BACKEND_USER_ID_SESSION_KEY);
    if (s != null && s !== "") {
      var parsed = parseInt(s, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    var rnd = 100000000 + Math.floor(Math.random() * 900000000);
    writeStoredApiKey(TEMP_BACKEND_USER_ID_SESSION_KEY, rnd);
    console.warn("[apiToMongo] TEMP random backend userId:", rnd, "(new for this device profile)");
    return rnd;
  } catch (e) {
    console.warn("[apiToMongo] localStorage unavailable for temp user id:", e);
  }
  if (inMemoryTempBackendUserId == null) {
    inMemoryTempBackendUserId = 100000000 + Math.floor(Math.random() * 900000000);
    console.warn("[apiToMongo] TEMP random backend userId (in-memory):", inMemoryTempBackendUserId);
  }
  return inMemoryTempBackendUserId;
}

function clearTempBackendUserId() {
  removeStoredApiKey(TEMP_BACKEND_USER_ID_SESSION_KEY);
  inMemoryTempBackendUserId = null;
}

function resolveBackendUserId(storedUserId) {
  if (USE_TEMP_RANDOM_BACKEND_USER_ID) {
    return getOrCreateTempBackendUserId();
  }
  var t = String(storedUserId || "").trim();
  var n = parseInt(t, 10);
  if (!Number.isNaN(n) && String(n) === t) return n;
  return storedUserId;
}

// create user
async function createUser(userId, userName, parentPhone) {
  const url = getApiBaseUrl() + "/api/createUser";
  var apiUserId = resolveBackendUserId(userId);
  var body = {
    userId: apiUserId,
    userName: userName,
  };
  if (parentPhone != null && String(parentPhone).trim() !== "") {
    body.parentPhone = String(parentPhone).trim();
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const result = await response.json();
    console.log("✅ Successfully Created User:", result);
    return result;
  } catch (err) {
    console.error("❌ Failed to Create User:", err);
    return null;
  }
}


var PENDING_TEST_ID_KEY = "seeandsayPendingTestId";
var PENDING_BLOB_UPLOADED_KEY = "seeandsayPendingBlobUploaded";
/** Keep in sync with `app-version-label` in js/app/app.js */
var MILI_APP_VERSION = "5.3";

/**
 * Debug metadata sent with each finished test (device, browser, upload state).
 * @param {string|number} demoUserId - UI/local idDigits passed to API layer
 * @param {string} [testId] - pending test id at finish
 * @param {{ blobUploadOk?: boolean }} [opts]
 */
function collectClientInfo(demoUserId, testId, opts) {
  opts = opts || {};
  var apiUserId = resolveBackendUserId(demoUserId);
  var pendingTestId = testId || ensurePendingTestId();
  var blobFlag = null;
  try {
    blobFlag = readStoredApiKey(PENDING_BLOB_UPLOADED_KEY);
  } catch (e) {}
  var blobUploadOk =
    typeof opts.blobUploadOk === "boolean" ? opts.blobUploadOk : blobFlag === "1";

  var info = {
    capturedAt: new Date().toISOString(),
    appVersion: MILI_APP_VERSION,
    demoUserId: demoUserId != null ? String(demoUserId) : null,
    apiUserId: apiUserId,
    pendingTestId: pendingTestId,
    blobUploadOk: blobUploadOk,
    recordingInterrupted: false,
    userAgent: "",
    platform: "",
    maxTouchPoints: 0,
    language: "",
    screen: "",
    viewport: "",
    devicePixelRatio: 1,
    origin: "",
    visibilityState: "",
    mediaRecorderMime: null,
    expressionAudioMode: "legacy",
  };

  try {
    if (typeof navigator !== "undefined") {
      info.userAgent = String(navigator.userAgent || "").slice(0, 512);
      info.platform = navigator.platform || "";
      info.maxTouchPoints =
        typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
      info.language = navigator.language || "";
      if (navigator.userAgentData) {
        info.clientHints = {
          mobile: !!navigator.userAgentData.mobile,
          platform: navigator.userAgentData.platform || "",
          brands: (navigator.userAgentData.brands || []).map(function (b) {
            return b.brand + "/" + b.version;
          }),
        };
      }
    }
    if (typeof screen !== "undefined") {
      info.screen = screen.width + "x" + screen.height;
    }
    if (typeof window !== "undefined") {
      info.viewport = window.innerWidth + "x" + window.innerHeight;
      info.devicePixelRatio = window.devicePixelRatio || 1;
      info.origin = window.location && window.location.origin ? window.location.origin : "";
      info.visibilityState = document.visibilityState || "";
      try {
        var mode = JSON.parse(localStorage.getItem("expressionAudioMode") || "\"legacy\"");
        info.expressionAudioMode = mode === "incremental" ? "incremental" : "legacy";
      } catch (modeErr) {}
    }
    if (typeof SessionRecorder !== "undefined") {
      if (SessionRecorder.isRecordingInterrupted) {
        info.recordingInterrupted = !!SessionRecorder.isRecordingInterrupted();
      }
      if (SessionRecorder.getCurrentMimeType) {
        info.mediaRecorderMime = SessionRecorder.getCurrentMimeType() || null;
      }
    }
  } catch (collectErr) {
    info.collectError = collectErr && collectErr.message ? collectErr.message : String(collectErr);
  }

  return info;
}
var COMPLETED_TEST_FEEDBACK_LS_KEYS = ["lastCompletedTestId", "expressionAiResult"];
/** Cleared on each new game so stale answers are not uploaded or scored (child age/login flags kept). */
var IN_PROGRESS_TEST_RUN_LS_KEYS = [
  "currentIndex",
  "questionResults",
  "correctAnswers",
  "partialAnswers",
  "wrongAnswers",
  "sessionCompleted",
  "sessionRecordingStarted",
  "testPaused",
  "audioChunks",
  "audioUrl",
  "recPaused",
  "sessionRecordingActive",
  "sessionRecordingUrl",
  "sessionRecordingFinal",
  "sessionRecordingFinalMeta",
  "sessionRecordingChunks",
  "recordingStartTime",
  "questionTimestamps",
  "recordingPaused",
  "pauseStartTime",
  "totalPausedTime",
  "sessionActiveRecordingMs",
];
/** Blob PUT timeout (slow networks); not tied to max recording length (12:30). Default 2 hours. */
var BLOB_UPLOAD_TIMEOUT_MS = 7200000;

function createNewTestId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

function clearPendingTestUploadKeys() {
  removeStoredApiKey(PENDING_TEST_ID_KEY);
  removeStoredApiKey(PENDING_BLOB_UPLOADED_KEY);
}

function clearCompletedTestFeedbackKeys() {
  COMPLETED_TEST_FEEDBACK_LS_KEYS.forEach(function (key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  });
}

function clearInProgressTestRunProgress() {
  IN_PROGRESS_TEST_RUN_LS_KEYS.forEach(function (key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  });
  try {
    sessionStorage.removeItem("seeandsayWasInTest");
  } catch (e) {}
}

/**
 * New game only (Start game / login / New run / no in-progress start).
 * Clears questionResults, scores, pending testId, and prior summary AI keys.
 * Do NOT call on resume Continue — use ensurePendingTestId() to keep the same run id.
 */
function beginNewTestSessionIdentity() {
  clearInProgressTestRunProgress();
  clearCompletedTestFeedbackKeys();
  clearPendingTestUploadKeys();
  try {
    var id = createNewTestId();
    writeStoredApiKey(PENDING_TEST_ID_KEY, id);
    return id;
  } catch (e) {
    return createNewTestId();
  }
}

function resetPendingTestId() {
  clearPendingTestUploadKeys();
  return ensurePendingTestId();
}

function ensurePendingTestId() {
  try {
    var id = readStoredApiKey(PENDING_TEST_ID_KEY);
    if (id) {
      return id;
    }
    id = createNewTestId();
    writeStoredApiKey(PENDING_TEST_ID_KEY, id);
    return id;
  } catch (e) {
    return createNewTestId();
  }
}

if (typeof window !== "undefined") {
  window.MiliTestSession = {
    beginNewTestSessionIdentity: beginNewTestSessionIdentity,
    resetPendingTestId: resetPendingTestId,
    clearCompletedTestFeedbackKeys: clearCompletedTestFeedbackKeys,
    clearPendingTestUploadKeys: clearPendingTestUploadKeys,
    clearInProgressTestRunProgress: clearInProgressTestRunProgress,
    clearTempBackendUserId: clearTempBackendUserId,
    ensurePendingTestId: ensurePendingTestId,
    collectClientInfo: collectClientInfo,
  };
}

async function prepareAudioUpload(userId, testId) {
  var apiUserId = resolveBackendUserId(userId);
  var url = getApiBaseUrl() + "/api/tests/prepareUpload";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: apiUserId, testId: testId }),
  });
  if (!response.ok) {
    var errText = "";
    try {
      errText = await response.text();
    } catch (readErr) {
      errText = String(readErr);
    }
    return { success: false, status: response.status, error: errText || "prepareUpload failed" };
  }
  var data = await response.json();
  return Object.assign({ success: true }, data);
}

async function prepareSegmentUpload(userId, testId, questionNumber) {
  var apiUserId = resolveBackendUserId(userId);
  var url = getApiBaseUrl() + "/api/tests/prepareSegmentUpload";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: apiUserId, testId: testId, questionNumber: String(questionNumber) }),
  });
  if (!response.ok) {
    var errText = "";
    try { errText = await response.text(); } catch (e) { errText = String(e); }
    return { success: false, status: response.status, error: errText || "prepareSegmentUpload failed" };
  }
  var data = await response.json();
  return Object.assign({ success: true }, data);
}

async function registerExpressionSegment(userId, payload) {
  var apiUserId = resolveBackendUserId(userId);
  var url = getApiBaseUrl() + "/api/tests/expressionSegment";
  var body = Object.assign({}, payload || {}, { userId: apiUserId });
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    var errText = "";
    try { errText = await response.text(); } catch (e) { errText = String(e); }
    return { success: false, status: response.status, error: errText || "expressionSegment failed" };
  }
  return Object.assign({ success: true }, await response.json());
}

async function putSessionAudioToBlob(uploadUrl, audioBlob) {
  var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timeoutId = setTimeout(function () {
    if (controller) controller.abort();
  }, BLOB_UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "audio/mpeg",
        "x-ms-blob-type": "BlockBlob",
      },
      body: audioBlob,
      signal: controller ? controller.signal : undefined,
    });
    if (response.status !== 200 && response.status !== 201) {
      var body = "";
      try {
        body = await response.text();
      } catch (e) {}
      return {
        success: false,
        status: response.status,
        error: body || "Blob PUT failed with HTTP " + response.status,
      };
    }
    return { success: true, status: response.status };
  } catch (err) {
    return {
      success: false,
      status: 0,
      error: err && err.message ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// update user info with test results; audio via Azure blob path or legacy base64
async function updateUserTests(
  userId,
  ageYears,
  ageMonths,
  full_array,
  correct,
  partly,
  wrong,
  audioBase64,
  timestampText,
  childGender,
  audioBlobPath,
  testId
) {
  const url = getApiBaseUrl() + "/api/addTestToUser";
  var apiUserId = resolveBackendUserId(userId);

  try {
    console.log("📤 Uploading test data to MongoDB...");
    console.log("   User ID:", userId, USE_TEMP_RANDOM_BACKEND_USER_ID ? "→ API " + apiUserId : "");
    console.log("   testId:", testId || "(server-generated)");
    console.log("   Array Results:", full_array);
    console.log("   Results:", correct, "correct,", partly, "partial,", wrong, "wrong");
    if (audioBlobPath) {
      console.log("   Audio: Azure blob", audioBlobPath);
    } else {
      console.log(
        "   Audio:",
        audioBase64 ? "Present (" + (audioBase64.length / 1024).toFixed(2) + " KB base64)" : "None"
      );
    }
    console.log("   Timestamps:", timestampText ? "Present" : "None");

    var clientInfo = collectClientInfo(userId, testId);
    console.log(
      "   clientInfo:",
      clientInfo.appVersion,
      "apiUserId=" + clientInfo.apiUserId,
      "testId=" + clientInfo.pendingTestId,
      "blobOk=" + clientInfo.blobUploadOk,
      "recInterrupted=" + clientInfo.recordingInterrupted
    );

    const payload = {
      userId: apiUserId,
      ageYears: ageYears,
      ageMonths: ageMonths,
      full_array: full_array,
      correct: correct,
      partly: partly,
      wrong: wrong,
      timestamps: timestampText,
      childGender: childGender || null,
    };
    if (testId) payload.testId = testId;
    if (audioBlobPath) {
      payload.audioBlobPath = audioBlobPath;
    } else if (audioBase64) {
      payload.audioFile64 = audioBase64;
    }

    payload.clientInfo = clientInfo;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      var errorText = "";
      try {
        errorText = await response.text();
      } catch (readErr) {
        errorText = String(readErr);
      }
      console.error("❌ Test upload failed:", response.status, errorText);
      return {
        success: false,
        status: response.status,
        error: errorText || ("HTTP " + response.status),
      };
    }

    const result = await response.json();
    console.log("✅ Test data uploaded successfully:", result);
    if (result && result.test_id) {
      console.log("   test_id:", result.test_id, "API userId:", apiUserId);
    }
    return Object.assign({ success: true }, result);
  } catch (err) {
    console.error("❌ Failed to upload test data:", err);
    return {
      success: false,
      status: 0,
      error: err && err.message ? err.message : String(err),
    };
  }
}


async function getExpressionAiStatus(userId, testId) {
  if (!testId) return null;
  var apiUserId = resolveBackendUserId(userId);
  var url = getApiBaseUrl() + "/api/expressionAiStatus?userId=" + encodeURIComponent(apiUserId) + "&testId=" + encodeURIComponent(testId);
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) throw new Error("Server responded with status " + response.status);
    return await response.json();
  } catch (err) {
    console.error("❌ Failed to fetch expression AI status:", err);
    return null;
  }
}

async function recoverLatestTest(userId) {
  var apiUserId = resolveBackendUserId(userId);
  var url =
    getApiBaseUrl() +
    "/api/tests/recoverLatest?userId=" +
    encodeURIComponent(apiUserId);
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      return { success: false, status: response.status };
    }
    return await response.json();
  } catch (err) {
    console.error("❌ recoverLatestTest failed:", err);
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
}

async function getResultsByToken(token) {
  var t = String(token || "").trim();
  if (!t) return { success: false, status: 400 };
  var url = getApiBaseUrl() + "/api/results/by-token?t=" + encodeURIComponent(t);
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      var errBody = null;
      try {
        errBody = await response.json();
      } catch (e) {}
      return {
        success: false,
        status: response.status,
        detail: errBody && errBody.detail ? errBody.detail : response.statusText,
      };
    }
    return await response.json();
  } catch (err) {
    console.error("getResultsByToken failed:", err);
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
}

async function getTestStatus(userId, testId) {
  if (!testId) return null;
  var apiUserId = resolveBackendUserId(userId);
  var url =
    getApiBaseUrl() +
    "/api/testStatus?userId=" +
    encodeURIComponent(apiUserId) +
    "&testId=" +
    encodeURIComponent(testId);
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) throw new Error("Server responded with status " + response.status);
    return await response.json();
  } catch (err) {
    console.error("❌ getTestStatus failed:", err);
    return null;
  }
}
