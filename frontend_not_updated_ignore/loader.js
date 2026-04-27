const ImageLoader = (function() {
  const loadedImages = new Set();
  const loadingQueue = [];
  let isProcessing = false;
  let allQuestions = [];

  function getImageUrl(queryNumber, imageIndex) {
    return "resources/test_assets/" + queryNumber + "/image_" + imageIndex + ".webp";
  }

  function preloadImage(url) {
    return new Promise(function(resolve) {
      if (loadedImages.has(url)) {
        resolve(url);
        return;
      }
      
      const img = new Image();
      img.onload = function() {
        loadedImages.add(url);
        resolve(url);
      };
      img.onerror = function() {
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
    
    preloadImage(url).then(function() {
      isProcessing = false;
      processQueue(); // Process next item
    });
  }

  function startLoading(questions, priorityAgeGroups) {
    if (!questions || questions.length === 0) return;
    
    allQuestions = questions;
    const priorityUrls = [];
    const otherUrls = [];

    questions.forEach(function(q) {
      if (!q || !q.query_number || !q.image_count) return;
      
      const count = parseInt(q.image_count, 10) || 1;
      const urls = [];
      for (let i = 1; i <= count; i++) {
        urls.push(getImageUrl(q.query_number, i));
      }

      // Check if this question is in priority age groups
      let isPriority = false;
      if (priorityAgeGroups && priorityAgeGroups.length > 0) {
        const qAgeGroup = (q.age_group || "").trim().normalize("NFC");
        isPriority = priorityAgeGroups.some(function(ag) {
          return ag === qAgeGroup;
        });
      }

      if (isPriority) {
        priorityUrls.push(...urls);
      } else {
        otherUrls.push(...urls);
      }
    });

    // Add to queue: priority first, then others
    loadingQueue.push(...priorityUrls, ...otherUrls);
    
    // Start processing
    processQueue();
  }

  function updatePriority(priorityAgeGroups) {
    if (!allQuestions || allQuestions.length === 0) return;
    
    // Rebuild queue with new priorities
    const priorityUrls = [];
    const otherUrls = [];

    allQuestions.forEach(function(q) {
      if (!q || !q.query_number || !q.image_count) return;
      
      const count = parseInt(q.image_count, 10) || 1;
      for (let i = 1; i <= count; i++) {
        const url = getImageUrl(q.query_number, i);
        
        // Skip already loaded images
        if (loadedImages.has(url)) continue;
        
        // Check if this question is in priority age groups
        let isPriority = false;
        if (priorityAgeGroups && priorityAgeGroups.length > 0) {
          const qAgeGroup = (q.age_group || "").trim().normalize("NFC");
          isPriority = priorityAgeGroups.some(function(ag) {
            return ag === qAgeGroup;
          });
        }

        if (isPriority) {
          priorityUrls.push(url);
        } else {
          otherUrls.push(url);
        }
      }
    });

    // Clear current queue and replace with prioritized urls
    loadingQueue.length = 0;
    loadingQueue.push(...priorityUrls, ...otherUrls);
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
    areImagesLoaded: areImagesLoaded,
    isImageLoaded: isImageLoaded,
    getImageUrl: getImageUrl
  };
})();
