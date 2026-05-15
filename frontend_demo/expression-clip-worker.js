/**
 * Off-main-thread expression clip pipeline: WebM decode → mono → MP3 (lamejs) → data URL.
 * Falls back to main-thread decode in recording.js when OfflineAudioContext is unavailable.
 */
/* global importScripts, lamejs */
importScripts("https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js");

var lameGlobal = typeof lamejs !== "undefined" ? lamejs : self.lamejs;
if (!lameGlobal || typeof lameGlobal.Mp3Encoder !== "function") {
  throw new Error("expression-clip-worker: lamejs.Mp3Encoder not available after importScripts");
}

var workChain = Promise.resolve();

function floatToInt16(samples) {
  var int16Samples = new Int16Array(samples.length);
  for (var i = 0; i < samples.length; i++) {
    var s = Math.max(-1, Math.min(1, samples[i]));
    int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Samples;
}

function encodeInt16ToMp3(int16Samples, sampleRate) {
  var encoder = new lameGlobal.Mp3Encoder(1, sampleRate, 128);
  var sampleBlockSize = 1152;
  var mp3Data = [];
  for (var i = 0; i < int16Samples.length; i += sampleBlockSize) {
    var chunk = int16Samples.subarray(i, i + sampleBlockSize);
    var mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }
  }
  var flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    mp3Data.push(new Uint8Array(flushBuf));
  }
  var total = 0;
  for (var j = 0; j < mp3Data.length; j++) {
    total += mp3Data[j].length;
  }
  var out = new Uint8Array(total);
  var off = 0;
  for (var k = 0; k < mp3Data.length; k++) {
    out.set(mp3Data[k], off);
    off += mp3Data[k].length;
  }
  return out;
}

function mixAudioBufferToMono(audioBuffer) {
  var n = audioBuffer.numberOfChannels;
  var len = audioBuffer.length;
  if (n === 1) {
    return audioBuffer.getChannelData(0);
  }
  var out = new Float32Array(len);
  for (var i = 0; i < len; i++) {
    var sum = 0;
    for (var c = 0; c < n; c++) {
      sum += audioBuffer.getChannelData(c)[i];
    }
    out[i] = sum / n;
  }
  return out;
}

function decodeArrayBufferToMono(ab) {
  var OfflineCtx = self.OfflineAudioContext || self.webkitOfflineAudioContext;
  if (!OfflineCtx) {
    return Promise.reject(new Error("OfflineAudioContext not available in worker"));
  }
  var ctx = new OfflineCtx(1, 2, 44100);
  var copy = ab.slice(0);
  return ctx.decodeAudioData(copy).then(function (buf) {
    return {
      sampleRate: buf.sampleRate,
      mono: mixAudioBufferToMono(buf),
    };
  });
}

function uint8ToBase64Chunked(u8) {
  var CHUNK = 0x8000;
  var binary = "";
  for (var i = 0; i < u8.length; i += CHUNK) {
    var sub = u8.subarray(i, i + CHUNK);
    for (var j = 0; j < sub.length; j++) {
      binary += String.fromCharCode(sub[j]);
    }
  }
  return btoa(binary);
}

function runEncodeWebmJob(id, webmAb) {
  return decodeArrayBufferToMono(webmAb).then(function (decoded) {
    var int16 = floatToInt16(decoded.mono);
    var mp3 = encodeInt16ToMp3(int16, decoded.sampleRate);
    var outCopy = new Uint8Array(mp3.byteLength);
    outCopy.set(mp3);
    var dataUrl = "data:audio/mpeg;base64," + uint8ToBase64Chunked(outCopy);
    self.postMessage(
      {
        id: id,
        ok: true,
        arrayBuffer: outCopy.buffer,
        byteLength: outCopy.byteLength,
        dataUrl: dataUrl,
      },
      [outCopy.buffer]
    );
  });
}

function runEncodePcmJob(id, sampleRate, pcmAb, sampleCount) {
  if (
    !pcmAb ||
    typeof sampleCount !== "number" ||
    sampleCount < 0 ||
    sampleCount * 4 > pcmAb.byteLength
  ) {
    throw new Error("invalid pcm buffer or sampleCount");
  }
  var mono = new Float32Array(pcmAb, 0, sampleCount);
  var int16 = floatToInt16(mono);
  var mp3 = encodeInt16ToMp3(int16, sampleRate);
  var outCopy = new Uint8Array(mp3.byteLength);
  outCopy.set(mp3);
  var dataUrl = "data:audio/mpeg;base64," + uint8ToBase64Chunked(outCopy);
  self.postMessage(
    {
      id: id,
      ok: true,
      arrayBuffer: outCopy.buffer,
      byteLength: outCopy.byteLength,
      dataUrl: dataUrl,
    },
    [outCopy.buffer]
  );
}

function workerDecodeInWorkerAvailable() {
  return !!(self.OfflineAudioContext || self.webkitOfflineAudioContext);
}

self.onmessage = function (ev) {
  var msg = ev.data;
  if (!msg || !msg.type) {
    return;
  }
  if (msg.type === "probe") {
    self.postMessage({
      type: "probeResult",
      decodeInWorker: workerDecodeInWorkerAvailable(),
    });
    return;
  }
  var id = msg.id;
  workChain = workChain
    .then(function () {
      if (msg.type === "encodeWebm") {
        var ab = msg.webm;
        var len =
          typeof msg.byteLength === "number" ? msg.byteLength : ab && ab.byteLength;
        if (!ab || !len) {
          throw new Error("encodeWebm: missing webm buffer");
        }
        return runEncodeWebmJob(id, ab);
      }
      if (msg.type === "encodePcm") {
        return runEncodePcmJob(id, msg.sampleRate, msg.pcm, msg.sampleCount);
      }
      throw new Error("unknown worker message type: " + msg.type);
    })
    .catch(function (err) {
      self.postMessage({
        id: id,
        ok: false,
        message: err && err.message ? err.message : String(err),
      });
    });
};
