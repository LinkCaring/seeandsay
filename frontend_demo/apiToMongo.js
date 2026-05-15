/**
 * TEMPORARY: FastAPI expects userId:int; demo-… / non-numeric ids return 422.
 * While flag is true, all API calls use one random integer per browser tab session
 * (sessionStorage). Set USE_TEMP_RANDOM_BACKEND_USER_ID to false after backend
 * accepts string ids.
 */
var USE_TEMP_RANDOM_BACKEND_USER_ID = true;
var TEMP_BACKEND_USER_ID_SESSION_KEY = "seeandsayTempBackendUserId";

var inMemoryTempBackendUserId = null;

function getApiBaseUrl() {
  if (window && window.SEEANDSAY_API_BASE_URL) {
    var configured = String(window.SEEANDSAY_API_BASE_URL).replace(/\/+$/, "");
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
    if (typeof sessionStorage !== "undefined") {
      var s = sessionStorage.getItem(TEMP_BACKEND_USER_ID_SESSION_KEY);
      if (s != null && s !== "") {
        var parsed = parseInt(s, 10);
        if (!Number.isNaN(parsed)) return parsed;
      }
      var rnd = 100000000 + Math.floor(Math.random() * 900000000);
      sessionStorage.setItem(TEMP_BACKEND_USER_ID_SESSION_KEY, String(rnd));
      console.warn("[apiToMongo] TEMP random backend userId:", rnd, "(new for this tab session)");
      return rnd;
    }
  } catch (e) {
    console.warn("[apiToMongo] sessionStorage unavailable for temp user id:", e);
  }
  if (inMemoryTempBackendUserId == null) {
    inMemoryTempBackendUserId = 100000000 + Math.floor(Math.random() * 900000000);
    console.warn("[apiToMongo] TEMP random backend userId (in-memory):", inMemoryTempBackendUserId);
  }
  return inMemoryTempBackendUserId;
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
async function createUser(userId, userName) {
  const url = getApiBaseUrl() + "/api/createUser";
  var apiUserId = resolveBackendUserId(userId);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: apiUserId,
        userName: userName
      }),
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


// update user info with test results, audio base64, and timestamps
// full_array --> is the new, full array of right and wrong
async function updateUserTests(userId, ageYears, ageMonths,
                    full_array,correct, partly, wrong,
                    audioBase64, timestampText, childGender) {
  const url = getApiBaseUrl() + "/api/addTestToUser";
  var apiUserId = resolveBackendUserId(userId);

  try {
    console.log("📤 Uploading test data to MongoDB...");
    console.log("   User ID:", userId, USE_TEMP_RANDOM_BACKEND_USER_ID ? "→ API " + apiUserId : "");
    console.log("   Array Results:", full_array);
    console.log("   Results:", correct, "correct,", partly, "partial,", wrong, "wrong");
    console.log("   Audio:", audioBase64 ? "Present (" + (audioBase64.length / 1024).toFixed(2) + " KB base64)" : "None");
    console.log("   Timestamps:", timestampText ? "Present" : "None");

    var audioPayload = audioBase64 != null && audioBase64 !== "" ? audioBase64 : "";
    var tsPayload = timestampText != null && timestampText !== "" ? timestampText : "{}";

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: apiUserId,
        ageYears: ageYears,
        ageMonths: ageMonths,
        full_array: full_array,          // Format: [(1,"correct"),(2,"partly"),(3,"wrong")]
        correct: correct,
        partly: partly,
        wrong: wrong,
        audioFile64: audioPayload,        // Base64 string: "data:audio/mpeg;base64,..." (empty ok)
        timestamps: tsPayload,
        childGender: childGender || null
      }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const result = await response.json();
    console.log("✅ Test data uploaded successfully:", result);
    return result;
  } catch (err) {
    console.error("❌ Failed to upload test data:", err);
    return null;
  }
}

async function createTestDraft(expressionQuestionCount) {
  const url = getApiBaseUrl() + "/api/createTestDraft";
  var apiUserId = resolveBackendUserId(null);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: apiUserId,
        expressionQuestionCount: expressionQuestionCount || 40,
      }),
    });
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error("❌ createTestDraft failed:", err);
    if (err && String(err.message || err).indexOf("Failed to fetch") !== -1) {
      console.warn(
        "[apiToMongo] Is the FastAPI backend running? (e.g. uvicorn on port 8001 for localhost)"
      );
    }
    return null;
  }
}

/** Max parallel in-flight `expressionClip` POSTs (default 2). Override with `window.SEEANDSAY_EXPRESSION_CLIP_MAX_PARALLEL`. */
function getExpressionClipMaxParallel() {
  if (typeof window !== "undefined" && window.SEEANDSAY_EXPRESSION_CLIP_MAX_PARALLEL != null) {
    var n = parseInt(window.SEEANDSAY_EXPRESSION_CLIP_MAX_PARALLEL, 10);
    if (!Number.isNaN(n) && n >= 1) {
      return Math.min(8, n);
    }
  }
  return 2;
}

var expressionClipActive = 0;
var expressionClipWaiters = [];

/**
 * Run an async function under a global cap for expression clip uploads.
 * @param {() => Promise<any>} fn
 */
function runWithExpressionClipConcurrency(fn) {
  return new Promise(function (resolve, reject) {
    function startOrQueue() {
      var max = getExpressionClipMaxParallel();
      if (expressionClipActive < max) {
        expressionClipActive++;
        Promise.resolve()
          .then(function () {
            return fn();
          })
          .then(function (r) {
            expressionClipActive--;
            var next = expressionClipWaiters.shift();
            if (next) {
              next();
            }
            resolve(r);
          })
          .catch(function (e) {
            expressionClipActive--;
            var next2 = expressionClipWaiters.shift();
            if (next2) {
              next2();
            }
            reject(e);
          });
      } else {
        expressionClipWaiters.push(startOrQueue);
      }
    }
    startOrQueue();
  });
}

/**
 * @returns {Promise<{ ok: true } & object | { ok: false; status: number | null; networkError?: boolean }>}
 */
async function postExpressionClip(
  testId,
  userId,
  questionNumber,
  headlightResult,
  audioDataUrl,
  childGender,
  ageYears,
  ageMonths
) {
  return runWithExpressionClipConcurrency(async function () {
  const url =
    getApiBaseUrl() +
    "/api/tests/" +
    encodeURIComponent(testId) +
    "/expressionClip";
  var apiUserId = resolveBackendUserId(userId);
  try {
    console.log(
      "📤 expressionClip →",
      url,
      "q=" + questionNumber,
      "headlight=" + headlightResult,
      "audioChars=" + (audioDataUrl ? String(audioDataUrl).length : 0)
    );
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: apiUserId,
        questionNumber: questionNumber,
        headlightResult: headlightResult,
        audioFile64: audioDataUrl,
        childGender: childGender || null,
        ageYears: ageYears != null ? ageYears : null,
        ageMonths: ageMonths != null ? ageMonths : null,
      }),
    });
    if (!response.ok) {
      var errText = "";
      try {
        errText = await response.text();
      } catch (e) {
        errText = "";
      }
      console.error(
        "❌ postExpressionClip HTTP",
        response.status,
        errText ? errText.slice(0, 280) : ""
      );
      return { ok: false, status: response.status };
    }
    var json = await response.json();
    return Object.assign({ ok: true }, json);
  } catch (err) {
    console.error("❌ postExpressionClip failed:", err);
    var msg = err && err.message ? String(err.message) : String(err);
    if (msg.indexOf("Failed to fetch") !== -1) {
      console.warn(
        "[apiToMongo] expressionClip: network error — is the backend running?"
      );
    }
    return { ok: false, status: null, networkError: true };
  }
  });
}

function _expressionClipRetryDelay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * Same contract as postExpressionClip, with bounded retries for transient failures
 * (network / 408 / 425 / 429 / 500 / 502 / 503 / 504). No retry on 404 or other 4xx.
 */
async function postExpressionClipWithRetry(
  testId,
  userId,
  questionNumber,
  headlightResult,
  audioDataUrl,
  childGender,
  ageYears,
  ageMonths,
  options
) {
  var maxAttempts =
    options && options.maxAttempts != null ? Math.max(1, options.maxAttempts) : 4;
  var baseDelayMs =
    options && options.baseDelayMs != null ? Math.max(100, options.baseDelayMs) : 450;
  var last = null;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await postExpressionClip(
      testId,
      userId,
      questionNumber,
      headlightResult,
      audioDataUrl,
      childGender,
      ageYears,
      ageMonths
    );
    if (last && last.ok) {
      return last;
    }
    var st = last && last.status;
    var net = last && last.networkError;
    var retryable =
      net ||
      st === 408 ||
      st === 425 ||
      st === 429 ||
      st === 500 ||
      st === 502 ||
      st === 503 ||
      st === 504;
    if (!retryable || attempt === maxAttempts) {
      return last;
    }
    var waitMs = Math.min(6000, baseDelayMs * Math.pow(2, attempt - 1));
    console.warn(
      "[apiToMongo] expressionClip attempt " +
        attempt +
        "/" +
        maxAttempts +
        " failed; retry in " +
        waitMs +
        "ms (" +
        (net ? "network" : "HTTP " + st) +
        ")"
    );
    await _expressionClipRetryDelay(waitMs);
  }
  return last;
}

async function finalizeUserTestsCore(
  testId,
  userId,
  ageYears,
  ageMonths,
  full_array,
  correct,
  partly,
  wrong,
  timestampText,
  childGender
) {
  const url =
    getApiBaseUrl() +
    "/api/tests/" +
    encodeURIComponent(testId) +
    "/finalizeTest";
  var apiUserId = resolveBackendUserId(userId);
  try {
    var tsFinalize =
      timestampText != null && String(timestampText).trim() !== ""
        ? String(timestampText)
        : "{}";

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: apiUserId,
        ageYears: ageYears,
        ageMonths: ageMonths,
        full_array: full_array,
        correct: correct,
        partly: partly,
        wrong: wrong,
        timestamps: tsFinalize,
        childGender: childGender || null,
      }),
    });
    if (!response.ok) {
      var errDetail = "";
      try {
        errDetail = await response.text();
      } catch (e) {}
      console.error(
        "❌ finalizeUserTests HTTP",
        response.status,
        errDetail ? errDetail.slice(0, 500) : ""
      );
      return { ok: false, status: response.status };
    }
    var fin = await response.json();
    return { ok: true, fin: fin };
  } catch (err) {
    console.error("❌ finalizeUserTests failed:", err);
    var msg = err && err.message ? String(err.message) : String(err);
    var net = msg.indexOf("Failed to fetch") !== -1;
    if (net) {
      console.warn(
        "[apiToMongo] finalizeTest: network error — is the backend running?"
      );
    }
    return { ok: false, status: null, networkError: net };
  }
}

function logFinalizeExpressionAiResponse(fin) {
  if (fin && fin.expression_ai) {
    console.log(
      "✅ finalizeTest response expression_ai status=",
      fin.expression_ai.status,
      "phase=",
      fin.expression_ai.meta && fin.expression_ai.meta.progress
        ? fin.expression_ai.meta.progress.phase
        : "?"
    );
  }
}

function finalizeTestResultIsRetryable(r) {
  if (!r || r.ok) {
    return false;
  }
  if (r.networkError) {
    return true;
  }
  var st = r.status;
  return (
    st === 408 ||
    st === 425 ||
    st === 429 ||
    st === 500 ||
    st === 502 ||
    st === 503 ||
    st === 504
  );
}

async function finalizeUserTests(
  testId,
  userId,
  ageYears,
  ageMonths,
  full_array,
  correct,
  partly,
  wrong,
  timestampText,
  childGender
) {
  var r = await finalizeUserTestsCore(
    testId,
    userId,
    ageYears,
    ageMonths,
    full_array,
    correct,
    partly,
    wrong,
    timestampText,
    childGender
  );
  if (!r.ok) {
    return null;
  }
  logFinalizeExpressionAiResponse(r.fin);
  return r.fin;
}

/**
 * Same payload as finalizeUserTests, with bounded retries on transient HTTP/network errors.
 * @returns {Promise<object|null>} Parsed finalize JSON or null on failure.
 */
async function finalizeUserTestsWithRetry(
  testId,
  userId,
  ageYears,
  ageMonths,
  full_array,
  correct,
  partly,
  wrong,
  timestampText,
  childGender,
  options
) {
  var maxAttempts =
    options && options.maxAttempts != null ? Math.max(1, options.maxAttempts) : 3;
  var baseDelayMs =
    options && options.baseDelayMs != null ? Math.max(200, options.baseDelayMs) : 600;
  var last = null;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await finalizeUserTestsCore(
      testId,
      userId,
      ageYears,
      ageMonths,
      full_array,
      correct,
      partly,
      wrong,
      timestampText,
      childGender
    );
    if (last && last.ok) {
      logFinalizeExpressionAiResponse(last.fin);
      return last.fin;
    }
    if (!finalizeTestResultIsRetryable(last) || attempt === maxAttempts) {
      return null;
    }
    var waitMs = Math.min(8000, baseDelayMs * Math.pow(2, attempt - 1));
    console.warn(
      "[apiToMongo] finalizeTest attempt " +
        attempt +
        "/" +
        maxAttempts +
        " failed; retry in " +
        waitMs +
        "ms (" +
        (last.networkError ? "network" : "HTTP " + last.status) +
        ")"
    );
    await _expressionClipRetryDelay(waitMs);
  }
  return null;
}


// Speaker Verification API call
async function verifySpeaker(userId, audioFile64) {
  const url = getApiBaseUrl() + "/api/VerifySpeaker";
  var apiUserId = resolveBackendUserId(userId);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: apiUserId,
        audioFile64: audioFile64
      }),
    });

    // Backend returned an error → verification failed
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Verification failed (${response.status}): ${errorText}`);
    }

    // Wait for backend JSON response
    const result = await response.json();

    if (result.success === true) {
      console.log("✅ Speaker verification successful");
      console.log("👤 Parent speaker:", result.parent_speaker);
      return {
        success: true,
        parentSpeaker: result.parent_speaker
      };
    } else {
      console.warn("⚠️ Verification returned success=false");
      return { success: false };
    }

  } catch (err) {
    console.error("❌ Speaker verification error:", err);
    // Return null on network errors to allow testing without backend connection
    return null;
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
