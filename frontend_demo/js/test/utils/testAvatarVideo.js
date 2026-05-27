/**
 * Avatar intro video: WebM transparency vs MP4 fallback per platform.
 * @see docs/TEST_MODULE_MAP.md
 */
(function () {
  var AVATAR_INTRO_WEBM_TRANSPARENCY_SUPPORT = null;

  var AVATAR_INTRO_VIDEO = {
    intro1: {
      webm: "resources/avatar/intro1.webm",
      mp4Fallback: "resources/avatar/intro1_fallback.mp4",
    },
    compr: {
      webm: "resources/avatar/compr_intro.webm",
      mp4Fallback: "resources/avatar/compr_intro_fallback.mp4",
    },
    exp: {
      webm: "resources/avatar/exp_intro.webm",
      mp4Fallback: "resources/avatar/exp_intro_fallback.mp4",
    },
  };

  function isApplePlatformWithoutWebmAlpha() {
    try {
      var ua = navigator.userAgent || "";
      if (/iPad|iPhone|iPod/.test(ua)) return true;
      if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    } catch (e) {}
    return false;
  }

  function canPlayWebmWithTransparency() {
    if (AVATAR_INTRO_WEBM_TRANSPARENCY_SUPPORT !== null) {
      return AVATAR_INTRO_WEBM_TRANSPARENCY_SUPPORT;
    }
    var supported = false;
    try {
      var probe = document.createElement("video");
      var vp9 = probe.canPlayType('video/webm; codecs="vp9"');
      var vp8 = probe.canPlayType('video/webm; codecs="vp8"');
      var webm = probe.canPlayType("video/webm");
      var canPlayWebm =
        vp9 === "probably" ||
        vp9 === "maybe" ||
        vp8 === "probably" ||
        vp8 === "maybe" ||
        webm === "probably" ||
        webm === "maybe";
      supported = canPlayWebm && !isApplePlatformWithoutWebmAlpha();
    } catch (e) {
      supported = false;
    }
    AVATAR_INTRO_WEBM_TRANSPARENCY_SUPPORT = supported;
    return supported;
  }

  function resolveAvatarIntroVideoSources(webmPath, mp4FallbackPath) {
    if (canPlayWebmWithTransparency()) {
      return { src: webmPath, isFallback: false };
    }
    return { src: mp4FallbackPath, isFallback: true };
  }

  function switchAvatarIntroVideoToMp4Fallback(videoEl, mp4FallbackPath, onGiveUp) {
    if (!videoEl || typeof onGiveUp !== "function") return;
    var currentSrc = String(videoEl.currentSrc || videoEl.src || "");
    if (currentSrc.indexOf(mp4FallbackPath) !== -1) {
      onGiveUp();
      return;
    }
    if (videoEl.getAttribute("data-avatar-intro-fallback") === "1") {
      onGiveUp();
      return;
    }
    videoEl.setAttribute("data-avatar-intro-fallback", "1");
    videoEl.classList.add("test-avatar-intro__video--solid-bg");
    videoEl.src = mp4FallbackPath;
    try {
      videoEl.load();
      var playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function () {
          onGiveUp();
        });
      }
    } catch (e) {
      onGiveUp();
    }
  }

  window.MiliTestModules = window.MiliTestModules || {};
  window.MiliTestModules.AVATAR_INTRO_VIDEO = AVATAR_INTRO_VIDEO;
  window.MiliTestModules.isApplePlatformWithoutWebmAlpha = isApplePlatformWithoutWebmAlpha;
  window.MiliTestModules.canPlayWebmWithTransparency = canPlayWebmWithTransparency;
  window.MiliTestModules.resolveAvatarIntroVideoSources = resolveAvatarIntroVideoSources;
  window.MiliTestModules.switchAvatarIntroVideoToMp4Fallback = switchAvatarIntroVideoToMp4Fallback;
})();
