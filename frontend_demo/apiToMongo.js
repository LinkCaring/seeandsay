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
        audioFile64: audioBase64,        // Base64 string: "data:audio/mpeg;base64,..."
        timestamps: timestampText,
        childGender: childGender || null
      }),
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
