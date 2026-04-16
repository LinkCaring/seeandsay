const ImageLoader = (function() {
  const loadedImages = new Set();
  const loadingQueue = [];
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
    
    // Define age group order for loading priority
    const ageGroupOrder = ["2:00-2:06", "2:07-3:00", "3:00-4:00", "4:00-5:00", "5:00-6:00"];
    const orderedUrls = [];

    // Load images in order by age group, then by question number
    ageGroupOrder.forEach(function(ageGroup) {
      const groupQuestions = questions.filter(function(q) {
        return q && q.age_group && q.age_group.trim().normalize("NFC") === ageGroup;
      });
      
      // Sort questions within age group by query_number
      groupQuestions.sort(function(a, b) {
        const numA = parseInt(a.query_number, 10) || 0;
        const numB = parseInt(b.query_number, 10) || 0;
        return numA - numB;
      });
      
      // Add URLs for this age group
      groupQuestions.forEach(function(q) {
        if (!q.query_number || !q.image_count) return;
        
        const count = parseInt(q.image_count, 10) || 1;
        for (let i = 1; i <= count; i++) {
          orderedUrls.push(getImageUrl(q.query_number, i));
        }
      });
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
