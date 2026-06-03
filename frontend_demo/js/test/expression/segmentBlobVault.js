/**
 * IndexedDB + memory cache for incremental expression segment blobs before upload completes.
 * Purged per question when register succeeds; purgeTest at session end.
 */
(function () {
  var DB_NAME = "seeandsaySegmentVault";
  var DB_VERSION = 1;
  var STORE_NAME = "segments";
  var memoryCache = {};
  var idbPromise = null;
  var idbDisabled = false;

  function cacheKey(testId, questionNumber) {
    return String(testId || "").trim() + "|" + String(questionNumber || "").trim();
  }

  function qKey(questionNumber) {
    return String(questionNumber || "").trim();
  }

  function openDb() {
    if (idbDisabled || typeof indexedDB === "undefined") {
      return Promise.resolve(null);
    }
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function (resolve) {
      try {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = function () {
          console.warn("[segmentVault] IndexedDB open failed");
          idbDisabled = true;
          resolve(null);
        };
        req.onupgradeneeded = function (ev) {
          var db = ev.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
        };
        req.onsuccess = function (ev) {
          resolve(ev.target.result);
        };
      } catch (e) {
        console.warn("[segmentVault] IndexedDB unavailable", e);
        idbDisabled = true;
        resolve(null);
      }
    });
    return idbPromise;
  }

  function idbPut(testId, questionNumber, record) {
    return openDb().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE_NAME, "readwrite");
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          resolve();
        };
        tx.objectStore(STORE_NAME).put({
          id: cacheKey(testId, questionNumber),
          testId: String(testId || ""),
          questionNumber: qKey(questionNumber),
          blob: record.blob,
          headlightResult: record.headlightResult || null,
          savedAt: record.savedAt || new Date().toISOString(),
        });
      });
    });
  }

  function idbGet(testId, questionNumber) {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE_NAME, "readonly");
        var req = tx.objectStore(STORE_NAME).get(cacheKey(testId, questionNumber));
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          resolve(null);
        };
      });
    });
  }

  function idbDelete(testId, questionNumber) {
    return openDb().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE_NAME, "readwrite");
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          resolve();
        };
        tx.objectStore(STORE_NAME).delete(cacheKey(testId, questionNumber));
      });
    });
  }

  function idbListForTest(testId) {
    return openDb().then(function (db) {
      if (!db) return [];
      var tid = String(testId || "").trim();
      return new Promise(function (resolve) {
        var out = [];
        var tx = db.transaction(STORE_NAME, "readonly");
        var req = tx.objectStore(STORE_NAME).openCursor();
        req.onsuccess = function (ev) {
          var cursor = ev.target.result;
          if (!cursor) {
            resolve(out);
            return;
          }
          if (cursor.value && cursor.value.testId === tid) {
            out.push(cursor.value);
          }
          cursor.continue();
        };
        req.onerror = function () {
          resolve(out);
        };
      });
    });
  }

  function idbPurgeTest(testId) {
    return idbListForTest(testId).then(function (rows) {
      if (!rows.length) return;
      return openDb().then(function (db) {
        if (!db) return;
        return new Promise(function (resolve) {
          var tx = db.transaction(STORE_NAME, "readwrite");
          tx.oncomplete = function () {
            resolve();
          };
          tx.onerror = function () {
            resolve();
          };
          var store = tx.objectStore(STORE_NAME);
          rows.forEach(function (row) {
            if (row && row.id) store.delete(row.id);
          });
        });
      });
    });
  }

  function purgeMemoryForTest(testId) {
    var tid = String(testId || "").trim();
    Object.keys(memoryCache).forEach(function (key) {
      if (key.indexOf(tid + "|") === 0) delete memoryCache[key];
    });
  }

  function createSegmentBlobVault() {
    var telemetry = {
      interruptSnapshots: 0,
      skippedNoBlob: [],
      continueCaptures: [],
    };
    var MAX_CONTINUE_CAPTURES = 48;

    function put(testId, questionNumber, blob, headlightResult) {
      if (!blob || !testId || !questionNumber) return Promise.resolve();
      var key = cacheKey(testId, questionNumber);
      var record = {
        blob: blob,
        headlightResult: headlightResult || null,
        savedAt: new Date().toISOString(),
      };
      memoryCache[key] = record;
      return idbPut(testId, questionNumber, record);
    }

    function get(testId, questionNumber) {
      var key = cacheKey(testId, questionNumber);
      if (memoryCache[key] && memoryCache[key].blob) {
        return Promise.resolve(memoryCache[key].blob);
      }
      return idbGet(testId, questionNumber).then(function (row) {
        if (!row || !row.blob) return null;
        memoryCache[key] = {
          blob: row.blob,
          headlightResult: row.headlightResult,
          savedAt: row.savedAt,
        };
        return row.blob;
      });
    }

    function getEntry(testId, questionNumber) {
      var key = cacheKey(testId, questionNumber);
      if (memoryCache[key]) {
        return Promise.resolve({
          blob: memoryCache[key].blob,
          headlightResult: memoryCache[key].headlightResult,
        });
      }
      return idbGet(testId, questionNumber).then(function (row) {
        if (!row || !row.blob) return null;
        memoryCache[key] = {
          blob: row.blob,
          headlightResult: row.headlightResult,
          savedAt: row.savedAt,
        };
        return { blob: row.blob, headlightResult: row.headlightResult };
      });
    }

    function has(testId, questionNumber) {
      var key = cacheKey(testId, questionNumber);
      if (memoryCache[key] && memoryCache[key].blob) return Promise.resolve(true);
      return idbGet(testId, questionNumber).then(function (row) {
        return !!(row && row.blob);
      });
    }

    function remove(testId, questionNumber) {
      var key = cacheKey(testId, questionNumber);
      delete memoryCache[key];
      return idbDelete(testId, questionNumber);
    }

    function listPendingKeys(testId) {
      var tid = String(testId || "").trim();
      var keys = {};
      Object.keys(memoryCache).forEach(function (key) {
        if (key.indexOf(tid + "|") === 0) {
          var q = key.slice(tid.length + 1);
          if (q) keys[q] = true;
        }
      });
      return idbListForTest(testId).then(function (rows) {
        rows.forEach(function (row) {
          if (row && row.questionNumber) keys[row.questionNumber] = true;
        });
        return Object.keys(keys);
      });
    }

    function purgeTest(testId) {
      purgeMemoryForTest(testId);
      return idbPurgeTest(testId);
    }

    function recordInterruptSnapshot() {
      telemetry.interruptSnapshots += 1;
    }

    function recordSkippedNoBlob(questionNumber) {
      var key = qKey(questionNumber);
      if (!key) return;
      if (telemetry.skippedNoBlob.indexOf(key) === -1) {
        telemetry.skippedNoBlob.push(key);
      }
    }

    function recordContinueCapture(entry) {
      if (!entry || !entry.questionNumber) return;
      var row = {
        at: new Date().toISOString(),
        questionNumber: qKey(entry.questionNumber),
        chunkCount: typeof entry.chunkCount === "number" ? entry.chunkCount : null,
        chunkBytes: typeof entry.chunkBytes === "number" ? entry.chunkBytes : null,
        trackReadyState: entry.trackReadyState != null ? String(entry.trackReadyState) : null,
        trackMuted: typeof entry.trackMuted === "boolean" ? entry.trackMuted : null,
        trackEnabled: typeof entry.trackEnabled === "boolean" ? entry.trackEnabled : null,
        recorderState: entry.recorderState != null ? String(entry.recorderState) : null,
        segmentInterrupted: !!entry.segmentInterrupted,
        hadBlob: !!entry.hadBlob,
        blobFromVault: !!entry.blobFromVault,
        blobSizeBytes: typeof entry.blobSizeBytes === "number" ? entry.blobSizeBytes : 0,
        enqueued: !!entry.enqueued,
        callLikely: !!entry.callLikely,
        segmentHealthReason: entry.segmentHealthReason || null,
        sessionRecordingInterrupted:
          typeof entry.sessionRecordingInterrupted === "boolean"
            ? entry.sessionRecordingInterrupted
            : null,
        visibilityState: entry.visibilityState || null,
      };
      telemetry.continueCaptures.push(row);
      if (telemetry.continueCaptures.length > MAX_CONTINUE_CAPTURES) {
        telemetry.continueCaptures.shift();
      }
    }

    function getTelemetry() {
      return {
        interruptSnapshots: telemetry.interruptSnapshots,
        skippedNoBlob: telemetry.skippedNoBlob.slice(),
        continueCaptures: telemetry.continueCaptures.slice(),
      };
    }

    function getClientInfo(testId) {
      return listPendingKeys(testId).then(function (pending) {
        var t = getTelemetry();
        return {
          pending: pending,
          skippedNoBlob: t.skippedNoBlob,
          interruptSnapshots: t.interruptSnapshots,
          continueCaptures: t.continueCaptures,
        };
      });
    }

    return {
      put: put,
      get: get,
      getEntry: getEntry,
      has: has,
      remove: remove,
      listPendingKeys: listPendingKeys,
      purgeTest: purgeTest,
      recordInterruptSnapshot: recordInterruptSnapshot,
      recordSkippedNoBlob: recordSkippedNoBlob,
      recordContinueCapture: recordContinueCapture,
      getTelemetry: getTelemetry,
      getClientInfo: getClientInfo,
    };
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.createSegmentBlobVault = createSegmentBlobVault;
})();
