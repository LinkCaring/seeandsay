/**
 * Off-main-thread MP3 encode (lamejs only). Main thread decodes blob → mono Float32Array
 * and posts transferable PCM — many browsers have no AudioContext inside workers.
 */
/* global importScripts, lamejs */
importScripts("https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js");

var lameGlobal = typeof lamejs !== "undefined" ? lamejs : self.lamejs;
if (!lameGlobal || typeof lameGlobal.Mp3Encoder !== "function") {
  throw new Error("mp3-encode-worker: lamejs.Mp3Encoder not available after importScripts");
}

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

var workChain = Promise.resolve();

self.onmessage = function (ev) {
  var msg = ev.data;
  if (!msg || msg.type !== "encodePcm") {
    return;
  }
  var id = msg.id;
  var sampleRate = msg.sampleRate;
  var pcm = msg.pcm;
  var sampleCount = msg.sampleCount;
  workChain = workChain
    .then(function () {
      return runEncodePcmJob(id, sampleRate, pcm, sampleCount);
    })
    .catch(function (err) {
      self.postMessage({
        id: id,
        ok: false,
        message: err && err.message ? err.message : String(err),
      });
    });
};

function runEncodePcmJob(id, sampleRate, pcmAb, sampleCount) {
  try {
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
    self.postMessage(
      {
        id: id,
        ok: true,
        arrayBuffer: outCopy.buffer,
        byteLength: outCopy.byteLength,
      },
      [outCopy.buffer]
    );
  } catch (err) {
    self.postMessage({
      id: id,
      ok: false,
      message: err && err.message ? err.message : String(err),
    });
  }
  return Promise.resolve();
}
