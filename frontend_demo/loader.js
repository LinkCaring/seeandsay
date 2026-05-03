const ImageLoader = (function() {
  const loadedImages = new Set();
  const queuedImages = new Set();
  /** FIFO for הבנה questions — runs in parallel with exprQueue (second worker). */
  const compQueue = [];
  /** FIFO for הבעה questions — runs in parallel with compQueue. */
  const exprQueue = [];
  let isProcessingComp = false;
  let isProcessingExpr = false;
  let allQuestions = [];

  function getImageUrl(queryNumber, imageIndex) {
    return "resources/test_assets/" + queryNumber + "/image_" + imageIndex + ".png";
  }

  function isExpressionQuestion(q) {
    return (q.query_type || "").trim().normalize("NFC") === "הבעה";
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

  function processCompQueue() {
    if (isProcessingComp || compQueue.length === 0) return;

    isProcessingComp = true;
    const url = compQueue.shift();
    queuedImages.delete(url);

    preloadImage(url).then(function() {
      isProcessingComp = false;
      processCompQueue();
    });
  }

  function processExprQueue() {
    if (isProcessingExpr || exprQueue.length === 0) return;

    isProcessingExpr = true;
    const url = exprQueue.shift();
    queuedImages.delete(url);

    preloadImage(url).then(function() {
      isProcessingExpr = false;
      processExprQueue();
    });
  }

  function kickBothQueues() {
    processCompQueue();
    processExprQueue();
  }

  function startLoading(questions, priorityAgeGroups) {
    if (!questions || questions.length === 0) return;

    allQuestions = questions;

    const sorted = questions.slice().sort(function(a, b) {
      const numA = parseInt(a.query_number, 10) || 0;
      const numB = parseInt(b.query_number, 10) || 0;
      return numA - numB;
    });

    sorted.forEach(function(q) {
      if (!q.query_number || !q.image_count) return;

      const count = parseInt(q.image_count, 10) || 1;
      const targetQueue = isExpressionQuestion(q) ? exprQueue : compQueue;

      for (let i = 1; i <= count; i++) {
        const url = getImageUrl(q.query_number, i);
        if (!loadedImages.has(url) && !queuedImages.has(url)) {
          targetQueue.push(url);
          queuedImages.add(url);
        }
      }
    });

    kickBothQueues();
  }

  function updatePriority(priorityAgeGroups) {
    if (!allQuestions || allQuestions.length === 0) return;

    startLoading(allQuestions, priorityAgeGroups);
  }

  function removeUrlFromQueue(queue, url) {
    let idx;
    while ((idx = queue.indexOf(url)) !== -1) {
      queue.splice(idx, 1);
    }
  }

  /**
   * Loads current-question images immediately in parallel and removes them from backlog queues.
   * Keeps navigation/jumps responsive while dual FIFOs prefetch in the background.
   */
  function prioritizeQuestion(queryNumber, imageCount) {
    var qn = parseInt(queryNumber, 10);
    if (!qn) return;
    var count = parseInt(imageCount, 10) || 1;
    var urls = [];
    var u;
    var i;
    for (i = 1; i <= count; i++) {
      urls.push(getImageUrl(qn, i));
    }
    for (i = 0; i < urls.length; i++) {
      u = urls[i];
      removeUrlFromQueue(compQueue, u);
      removeUrlFromQueue(exprQueue, u);
    }
    var pending = urls.filter(function(url) {
      return !loadedImages.has(url);
    });
    if (pending.length === 0) {
      kickBothQueues();
      return;
    }
    Promise.all(pending.map(preloadImage)).then(function() {
      kickBothQueues();
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

  return {
    startLoading: startLoading,
    updatePriority: updatePriority,
    prioritizeQuestion: prioritizeQuestion,
    areImagesLoaded: areImagesLoaded,
    isImageLoaded: isImageLoaded,
    getImageUrl: getImageUrl
  };
})();
