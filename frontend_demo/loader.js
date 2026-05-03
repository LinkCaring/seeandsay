const ImageLoader = (function() {
  const loadedImages = new Set();
  const loadingQueue = [];
  const queuedImages = new Set();
  let isProcessing = false;
  let allQuestions = [];

  function getImageUrl(queryNumber, imageIndex) {
    return "resources/test_assets/" + queryNumber + "/image_" + imageIndex + ".png";
  }

  function preloadImage(url) {
    return new Promise(function(resolve) {
      if (loadedImages.has(url)) {
        resolve(url);
        return;
      }

      let settled = false;
      const timeoutMs = 10000;
      const timeoutId = setTimeout(function() {
        if (settled) return;
        settled = true;
        console.warn("Image load timeout:", url);
        loadedImages.add(url);
        resolve(url);
      }, timeoutMs);

      const img = new Image();
      img.onload = function() {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        loadedImages.add(url);
        resolve(url);
      };
      img.onerror = function() {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.warn("Failed to load image:", url);
        loadedImages.add(url); // Mark as "loaded" to avoid retry
        resolve(url);
      };
      img.src = url;
    });
  }

  function processQueue() {
    if (isProcessing || loadingQueue.length === 0) return;

    isProcessing = true;
    const url = loadingQueue.shift();
    queuedImages.delete(url);
    
    preloadImage(url).then(function() {
      isProcessing = false;
      processQueue(); // Process next item
    });
  }

  function startLoading(questions, priorityAgeGroups) {
    if (!questions || questions.length === 0) return;
    
    allQuestions = questions;
    
    const orderedUrls = [];

    const sorted = questions.slice().sort(function(a, b) {
      const numA = parseInt(a.query_number, 10) || 0;
      const numB = parseInt(b.query_number, 10) || 0;
      return numA - numB;
    });

    sorted.forEach(function(q) {
      if (!q.query_number || !q.image_count) return;

      const count = parseInt(q.image_count, 10) || 1;
      for (let i = 1; i <= count; i++) {
        const url = getImageUrl(q.query_number, i);
        if (!loadedImages.has(url) && !queuedImages.has(url)) {
          orderedUrls.push(url);
          queuedImages.add(url);
        }
      }
    });

    // Add all URLs to queue in the correct order
    loadingQueue.push(...orderedUrls);
    
    // Start processing
    processQueue();
  }

  function updatePriority(priorityAgeGroups) {
    if (!allQuestions || allQuestions.length === 0) return;
    
    // Since we're loading all questions in order, just restart loading
    // This will maintain the same order as startLoading
    startLoading(allQuestions, priorityAgeGroups);
  }

  /**
   * Loads current-question images immediately in parallel and pulls them ahead of the FIFO queue.
   * Avoids long waits when the user jumps forward (e.g. two comprehension wrongs → first expression).
   */
  function prioritizeQuestion(queryNumber, imageCount) {
    var qn = parseInt(queryNumber, 10);
    if (!qn) return;
    var count = parseInt(imageCount, 10) || 1;
    var urls = [];
    var u;
    var idx;
    var i;
    for (i = 1; i <= count; i++) {
      urls.push(getImageUrl(qn, i));
    }
    for (i = 0; i < urls.length; i++) {
      u = urls[i];
      while ((idx = loadingQueue.indexOf(u)) !== -1) {
        loadingQueue.splice(idx, 1);
      }
    }
    var pending = urls.filter(function(url) {
      return !loadedImages.has(url);
    });
    if (pending.length === 0) {
      processQueue();
      return;
    }
    Promise.all(pending.map(preloadImage)).then(function() {
      processQueue();
    });
  }

  function areImagesLoaded(queryNumber, imageCount) {
    const count = parseInt(imageCount, 10) || 1;
    for (let i = 1; i <= count; i++) {
      const url = getImageUrl(queryNumber, i);
      if (!loadedImages.has(url)) {
        return false;
      }
    }
    return true;
  }

  function isImageLoaded(url) {
    return loadedImages.has(url);
  }

  // Public API
  return {
    startLoading: startLoading,
    updatePriority: updatePriority,
    prioritizeQuestion: prioritizeQuestion,
    areImagesLoaded: areImagesLoaded,
    isImageLoaded: isImageLoaded,
    getImageUrl: getImageUrl
  };
})();
