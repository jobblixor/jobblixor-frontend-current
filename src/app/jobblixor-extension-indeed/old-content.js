(() => {
// ==========================================
// ENHANCED SMART NAVIGATION CONTROL
// ==========================================

let extensionRunning = false;
let automationInProgress = false;
let reloadListeners = [];
let navigationPromises = new Map();

// Enhanced navigation wrapper that properly manages flags
async function safeAutomationAction(actionName, actionFn, waitForLoad = true) {
  console.log(`[Automation] STARTING: ${actionName}`);
  
  // Set automation flag BEFORE the action
  automationInProgress = true;
  
  try {
    // Execute the action
    const result = await actionFn();
    
    // Wait for navigation/loading if requested
    if (waitForLoad) {
      await waitForNavigationComplete(actionName);
    }
    
    return result;
  } catch (error) {
    console.error(`[Automation] ERROR in ${actionName}:`, error);
    throw error;
  } finally {
    // Always reset flag after a delay to ensure navigation completes
    setTimeout(() => {
      automationInProgress = false;
      console.log(`[Automation] COMPLETED: ${actionName} - protection re-enabled`);
    }, 1000);
  }
}

// Smart wait function that detects when navigation/loading is complete
async function waitForNavigationComplete(actionName, maxWaitMs = 8000) {
  console.log(`[Automation] Waiting for ${actionName} navigation to complete...`);
  
  const startTime = Date.now();
  let lastUrl = window.location.href;
  let stabilityCount = 0;
  const requiredStability = 3;
  
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const currentTime = Date.now();
      const currentUrl = window.location.href;
      
      // Check if URL has changed (navigation occurred)
      if (currentUrl !== lastUrl) {
        console.log(`[Automation] URL changed during ${actionName}: ${lastUrl} -> ${currentUrl}`);
        lastUrl = currentUrl;
        stabilityCount = 0;
        return;
      }
      
      // Check for loading indicators
      const isLoading = document.querySelector('.loading, .spinner, [data-testid*="loading"]') ||
                       document.readyState !== 'complete' ||
                       window.location.href.includes('#loading');
      
      if (isLoading) {
        console.log(`[Automation] Still loading during ${actionName}...`);
        stabilityCount = 0;
        return;
      }
      
      // Check for specific Indeed loading states
      const indeedLoading = document.querySelector('[data-testid*="skeleton"]') ||
                           document.querySelector('.jobsearch-ViewjobPaneWrapper[style*="opacity"]') ||
                           document.querySelector('.jobsearch-JobComponent[aria-busy="true"]');
      
      if (indeedLoading) {
        console.log(`[Automation] Indeed-specific loading detected during ${actionName}...`);
        stabilityCount = 0;
        return;
      }
      
      // Increment stability counter
      stabilityCount++;
      
      // If we've had enough stable checks or timeout reached
      if (stabilityCount >= requiredStability || currentTime - startTime > maxWaitMs) {
        clearInterval(checkInterval);
        console.log(`[Automation] Navigation complete for ${actionName} (${currentTime - startTime}ms, stability: ${stabilityCount})`);
        resolve();
      }
    }, 500);
  });
}

// Page reload protection (enhanced to work with automation)
function preventPageReloads() {
  console.log("[Protection] Installing page reload protection");
  
  window.addEventListener('beforeunload', (event) => {
    // Only block if extension is running AND automation is not in progress
    if (extensionRunning && !automationInProgress) {
      event.preventDefault();
      event.returnValue = 'Jobblixor is running. Are you sure you want to leave?';
      console.log("[Protection] Blocked page reload - extension is running");
      return 'Jobblixor is running. Are you sure you want to leave?';
    }
  });
  
  extensionRunning = true;
}

function allowPageReloads() {
  console.log("[Protection] Disabling page reload protection");
  extensionRunning = false;
  automationInProgress = false;
}

// ==========================================
// PHASE 2: ROBUST INDEED AUTOMATION
// ==========================================

// Send status update to popup
function sendStatusUpdate(message) {
  chrome.runtime.sendMessage({
    type: "STATUS_UPDATE",
    message: message
  });
  console.log(`[Phase 2] STATUS: ${message}`);
}

// STEP 1: Robust job search with comprehensive selectors
async function performRobustJobSearch(userProfile) {
  console.log("[Phase 2] ===== STEP 1: PERFORMING JOB SEARCH =====");
  sendStatusUpdate(`ðŸ” Searching for "${userProfile.job_title}" in "${userProfile.location}"...`);
  
  return safeAutomationAction("Job Search", async () => {
    // Wait for page to be fully loaded
    await waitForPageLoad();
    
    // Find search inputs with ALL possible selectors
    const searchInputs = findSearchInputs();
    
    if (!searchInputs.jobInput || !searchInputs.locationInput) {
      throw new Error("Could not find search form. Make sure you're on Indeed.com main page.");
    }
    
    console.log("[Phase 2] Found search inputs - job:", searchInputs.jobInput.tagName, "location:", searchInputs.locationInput.tagName);
    
    // Fill job title with robust method
    await fillInputRobustly(searchInputs.jobInput, userProfile.job_title, "job title");
    
    // Fill location with robust method  
    await fillInputRobustly(searchInputs.locationInput, userProfile.location, "location");
    
    // Wait for autocomplete to settle
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Find and click search button
    const searchButton = findSearchButton();
    
    if (!searchButton) {
      throw new Error("Could not find search button");
    }
    
    console.log("[Phase 2] Clicking search button:", searchButton.textContent?.trim());
    searchButton.click();
    
    return { success: true, action: "search_performed" };
  }, true);
}

// Find search inputs with comprehensive selectors
function findSearchInputs() {
  const jobSelectors = [
    'input[name="q"]',
    'input[id*="text-input-what"]', 
    '[data-testid*="what-where-what"]',
    '#text-input-what',
    'input[aria-label*="What"]',
    'input[placeholder*="Job title"]',
    'input[placeholder*="job"]'
  ];
  
  const locationSelectors = [
    'input[name="l"]',
    'input[id*="text-input-where"]',
    '[data-testid*="what-where-where"]', 
    '#text-input-where',
    'input[aria-label*="Where"]',
    'input[placeholder*="City"]',
    'input[placeholder*="location"]'
  ];
  
  let jobInput = null;
  let locationInput = null;
  
  // Try each selector until we find the inputs
  for (const selector of jobSelectors) {
    jobInput = document.querySelector(selector);
    if (jobInput) break;
  }
  
  for (const selector of locationSelectors) {
    locationInput = document.querySelector(selector);
    if (locationInput) break;
  }
  
  return { jobInput, locationInput };
}

// Find search button with comprehensive selectors
function findSearchButton() {
  const buttonSelectors = [
    'button[type="submit"]',
    '.yosegi-InlineWhatWhere-primaryButton',
    'button[data-testid*="search"]',
    'button[aria-label*="Search"]'
  ];
  
  // Try direct selectors first
  for (const selector of buttonSelectors) {
    const button = document.querySelector(selector);
    if (button) return button;
  }
  
  // Fallback: find by text content
  const allButtons = Array.from(document.querySelectorAll('button'));
  return allButtons.find(btn => {
    const text = btn.textContent?.toLowerCase().trim();
    return text === 'search' || text === 'find jobs';
  });
}

// Robust input filling with multiple methods
async function fillInputRobustly(input, value, fieldName) {
  console.log(`[Phase 2] Filling ${fieldName} with: "${value}"`);
  
  // Method 1: Focus and clear
  input.focus();
  input.select();
  document.execCommand('selectAll');
  document.execCommand('delete');
  
  // Method 2: Set value directly
  input.value = '';
  
  // Method 3: Type character by character
  for (let i = 0; i < value.length; i++) {
    input.value += value[i];
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  // Method 4: Trigger all events
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  input.dispatchEvent(new Event('keyup', { bubbles: true }));
  
  console.log(`[Phase 2] ${fieldName} final value:`, input.value);
  
  // Verify the value stuck
  if (input.value !== value) {
    console.warn(`[Phase 2] Warning: ${fieldName} value may not have stuck properly`);
  }
}

// Wait for page to be fully loaded
async function waitForPageLoad(maxWait = 10000) {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkLoad = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      const isLoaded = document.readyState === 'complete' &&
                      !document.querySelector('.loading, .spinner') &&
                      document.body &&
                      document.body.children.length > 0;
      
      if (isLoaded || elapsed >= maxWait) {
        clearInterval(checkLoad);
        console.log(`[Phase 2] Page load complete (${elapsed}ms)`);
        resolve();
      }
    }, 200);
  });
}

// STEP 2: Wait for search results to load
async function waitForSearchResults(maxWait = 15000) {
  console.log("[Phase 2] ===== STEP 2: WAITING FOR SEARCH RESULTS =====");
  sendStatusUpdate("â³ Waiting for search results to load...");
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkResults = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      // Check multiple indicators that results have loaded
      const hasJobCards = document.querySelectorAll('[data-jk]').length > 0;
      const hasResultsList = document.querySelector('.jobsearch-ResultsList, [data-testid="searchResults"]');
      const hasJobBeacons = document.querySelector('.job_seen_beacon');
      const noLoadingIndicators = !document.querySelector('.loading, .spinner, [data-testid*="loading"]');
      
      const resultsReady = (hasJobCards || hasResultsList || hasJobBeacons) && noLoadingIndicators;
      
      console.log(`[Phase 2] Results check (${elapsed}ms): jobCards=${document.querySelectorAll('[data-jk]').length}, loaded=${noLoadingIndicators}`);
      
      if (resultsReady || elapsed >= maxWait) {
        clearInterval(checkResults);
        console.log(`[Phase 2] Search results ready (${elapsed}ms)`);
        resolve(resultsReady);
      }
    }, 1000);
  });
}

// STEP 3: Find Easy Apply jobs with robust detection
function findEasyApplyJobs() {
  console.log("[Phase 2] ===== STEP 3: FINDING EASY APPLY JOBS =====");
  
  const easyApplyJobs = [];
  
  // Multiple selectors for job cards
  const jobCardSelectors = [
    '[data-jk]',
    '.job_seen_beacon',
    '.slider_container', 
    '[data-testid*="job"]',
    '.jobsearch-SerpJobCard',
    '.slider_item'
  ];
  
  let jobCards = [];
  for (const selector of jobCardSelectors) {
    jobCards = document.querySelectorAll(selector);
    if (jobCards.length > 0) {
      console.log(`[Phase 2] Found ${jobCards.length} job cards using selector: ${selector}`);
      break;
    }
  }
  
  if (jobCards.length === 0) {
    console.log("[Phase 2] No job cards found on page");
    return [];
  }
  
  // Check each job card for Easy Apply
  jobCards.forEach((jobCard, index) => {
    const hasEasyApply = checkForEasyApply(jobCard);
    
    if (hasEasyApply) {
      const jobDetails = extractJobDetails(jobCard, index);
      easyApplyJobs.push(jobDetails);
      console.log(`[Phase 2] âœ… Found Easy Apply job: ${jobDetails.title} at ${jobDetails.company}`);
    }
  });
  
  console.log(`[Phase 2] Total Easy Apply jobs found: ${easyApplyJobs.length}`);
  return easyApplyJobs;
}

// Check if job card has Easy Apply
function checkForEasyApply(jobCard) {
  const easyApplyIndicators = [
    'easy apply',
    'easily apply', 
    'Apply now',
    'one-click apply'
  ];
  
  // Check all text content in the job card
  const allText = jobCard.textContent?.toLowerCase() || '';
  
  // Also check for specific Easy Apply elements
  const easyApplyElements = jobCard.querySelectorAll('button, span, div, a');
  
  for (const element of easyApplyElements) {
    const elementText = element.textContent?.toLowerCase() || '';
    const elementClass = element.className?.toLowerCase() || '';
    const elementId = element.id?.toLowerCase() || '';
    
    if (easyApplyIndicators.some(indicator => 
      elementText.includes(indicator) || 
      elementClass.includes('easy') || 
      elementId.includes('easy'))) {
      return true;
    }
  }
  
  return easyApplyIndicators.some(indicator => allText.includes(indicator));
}

// Extract job details from job card
function extractJobDetails(jobCard, index) {
  const titleSelectors = [
    'h2 a',
    '[data-testid*="job-title"] a',
    'a[data-jk]',
    '.jobTitle a',
    'h2 span',
    '.jobTitle'
  ];
  
  const companySelectors = [
    '[data-testid="company-name"]',
    '.companyName',
    'span[title]',
    'a[data-testid*="company"]'
  ];
  
  let titleElement = null;
  let companyElement = null;
  
  // Find title element
  for (const selector of titleSelectors) {
    titleElement = jobCard.querySelector(selector);
    if (titleElement) break;
  }
  
  // Find company element
  for (const selector of companySelectors) {
    companyElement = jobCard.querySelector(selector);
    if (companyElement) break;
  }
  
  return {
    element: jobCard,
    title: titleElement?.textContent?.trim() || `Job ${index + 1}`,
    company: companyElement?.textContent?.trim() || 'Company',
    titleLink: titleElement?.href,
    index: index
  };
}

// STEP 4: Click job card robustly
async function clickJobCardRobustly(job) {
  console.log(`[Phase 2] ===== STEP 4: CLICKING JOB CARD: ${job.title} =====`);
  sendStatusUpdate(`ðŸ“‹ Opening job details for: ${job.title}`);
  
  return safeAutomationAction(`Click Job Card: ${job.title}`, async () => {
    // Scroll job card into view first
    job.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try multiple click methods
    let clickSuccessful = false;
    
    // Method 1: Click title link if available
    if (job.titleLink) {
      const titleLink = job.element.querySelector('a[href]');
      if (titleLink) {
        console.log("[Phase 2] Method 1: Clicking title link");
        titleLink.click();
        clickSuccessful = true;
      }
    }
    
    // Method 2: Click any clickable title element
    if (!clickSuccessful) {
      const titleElement = job.element.querySelector('h2 a, [data-testid*="job-title"] a, a[data-jk], .jobTitle a');
      if (titleElement) {
        console.log("[Phase 2] Method 2: Clicking title element");
        titleElement.click();
        clickSuccessful = true;
      }
    }
    
    // Method 3: Click the job card itself
    if (!clickSuccessful) {
      console.log("[Phase 2] Method 3: Clicking job card element");
      job.element.click();
      clickSuccessful = true;
    }
    
    if (!clickSuccessful) {
      throw new Error("Could not click job card");
    }
    
    return { success: true, action: "job_card_clicked" };
  }, false); // Don't wait for navigation, we'll do it manually
}

// STEP 5: Wait for job details panel to load
async function waitForJobDetailsPanel(maxWait = 10000) {
  console.log("[Phase 2] ===== STEP 5: WAITING FOR JOB DETAILS PANEL =====");
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkPanel = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      // Look for various job details panel indicators
      const detailsPanel = document.querySelector(
        '.jobsearch-ViewjobPaneWrapper, ' +
        '.jobsearch-JobComponent, ' +
        '[data-testid*="jobDetails"], ' +
        '.jobsearch-JobInfoHeader, ' +
        '#jobDetailsContainer, ' +
        '.jobsearch-JobComponentHeader'
      );
      
      // Look for Apply Now button as confirmation panel is ready
      const applyButton = document.querySelector(
        'button[data-testid*="apply"], ' +
        'button[aria-label*="Apply"], ' +
        'a[data-testid*="apply"], ' +
        '.jobsearch-IndeedApplyButton'
      );
      
      // Check for job description content
      const hasJobDescription = document.querySelector('.jobsearch-jobDescriptionText, .jobDescriptionText, [data-testid*="jobDescription"]');
      
      const panelReady = (detailsPanel && (applyButton || hasJobDescription));
      
      console.log(`[Phase 2] Panel check (${elapsed}ms): panel=${!!detailsPanel}, apply=${!!applyButton}, description=${!!hasJobDescription}`);
      
      if (panelReady || elapsed >= maxWait) {
        clearInterval(checkPanel);
        console.log(`[Phase 2] Job details panel ready (${elapsed}ms)`);
        resolve(panelReady);
      }
    }, 500);
  });
}

// STEP 6: Click Apply Now button robustly
async function clickApplyNowRobustly() {
  console.log("[Phase 2] ===== STEP 6: CLICKING APPLY NOW BUTTON =====");
  sendStatusUpdate("ðŸš€ Clicking Apply Now button...");
  
  return safeAutomationAction("Click Apply Now", async () => {
    // Wait a moment for any final loading
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Find Apply Now button with comprehensive selectors
    const applyButton = findApplyNowButton();
    
    if (!applyButton) {
      throw new Error("Apply Now button not found");
    }
    
    // Check if button is enabled
    if (applyButton.disabled || applyButton.getAttribute('aria-disabled') === 'true') {
      throw new Error("Apply Now button is disabled");
    }
    
    console.log(`[Phase 2] Found Apply Now button: "${applyButton.textContent?.trim()}"`);
    
    // Handle different types of Apply buttons
    if (applyButton.href) {
      // External link - open in new tab and trigger Phase 1
      console.log("[Phase 2] Opening Easy Apply in new tab:", applyButton.href);
      const newTab = window.open(applyButton.href, '_blank');
      
      // Send message to background to trigger Phase 1 in new tab
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: "TRIGGER_PHASE1_IN_NEW_TAB",
          url: applyButton.href,
          email: getCurrentUserEmail()
        });
      }, 2000);
      
      return { success: true, action: "apply_opened_new_tab", url: applyButton.href };
    } else {
      // SPA navigation - click and wait
      applyButton.click();
      console.log("[Phase 2] Clicked Apply Now button (SPA)");
      return { success: true, action: "apply_clicked_spa" };
    }
  }, false);
}

// Find Apply Now button with comprehensive selectors
function findApplyNowButton() {
  const applySelectors = [
    'button[data-testid*="apply"]',
    'button[aria-label*="Apply"]',
    'a[data-testid*="apply"]', 
    '.jobsearch-IndeedApplyButton button',
    '.jobsearch-ApplyButtonContainer button',
    'button[data-jk*="apply"]',
    '[data-testid="indeedApplyButton"]',
    '.js-apply-button'
  ];
  
  // Try direct selectors first
  for (const selector of applySelectors) {
    const button = document.querySelector(selector);
    if (button) return button;
  }
  
  // Fallback: text-based search
  const allClickableElements = Array.from(document.querySelectorAll('button, a'));
  return allClickableElements.find(element => {
    const text = element.textContent?.toLowerCase().trim() || '';
    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
    
    return (text.includes('apply now') || 
            text.includes('apply') || 
            ariaLabel.includes('apply')) &&
           !text.includes('save') && 
           !text.includes('share') && 
           !text.includes('applied');
  });
}

// Get current user email from storage or popup
function getCurrentUserEmail() {
  // Try to get from local storage first
  const storedEmail = localStorage.getItem('jobblixor_email');
  if (storedEmail) {
    return storedEmail;
  }
  
  // Fallback email if none stored
  return "test@example.com";
}

// MAIN PHASE 2 ORCHESTRATOR - BULLETPROOF VERSION
async function runPhase2Automation(userProfile) {
  console.log("[Phase 2] ===== STARTING BULLETPROOF PHASE 2 AUTOMATION =====");
  console.log("[Phase 2] User profile:", userProfile);
  
  // Start protection
  preventPageReloads();
  
  let processedCount = 0;
  let errorCount = 0;
  const maxErrors = 3;
  
  try {
    const targetJobs = parseInt(userProfile.targetJobs) || 10;
    sendStatusUpdate(`ðŸŽ¯ Starting Phase 2 automation - Target: ${targetJobs} applications`);
    
    // STEP 1: Always perform fresh search
    console.log("[Phase 2] ALWAYS performing fresh search...");
    await performRobustJobSearch(userProfile);
    
    // STEP 2: Wait for search results
    const resultsLoaded = await waitForSearchResults();
    if (!resultsLoaded) {
      throw new Error("Search results did not load in time");
    }
    
    // STEP 3: Find Easy Apply jobs
    const easyApplyJobs = findEasyApplyJobs();
    
    if (easyApplyJobs.length === 0) {
      sendStatusUpdate("âŒ No Easy Apply jobs found. Try different search terms.");
      return { success: false, reason: "no_easy_apply_jobs" };
    }
    
    sendStatusUpdate(`âœ… Found ${easyApplyJobs.length} Easy Apply jobs - starting applications...`);
    
    // STEP 4: Process each job with error handling
    const jobsToProcess = Math.min(easyApplyJobs.length, targetJobs);
    
    for (let i = 0; i < jobsToProcess; i++) {
      const currentJob = easyApplyJobs[i];
      
      try {
        console.log(`[Phase 2] ===== PROCESSING JOB ${i + 1}/${jobsToProcess}: ${currentJob.title} =====`);
        sendStatusUpdate(`ðŸ“ Job ${i + 1}/${jobsToProcess}: Applying to ${currentJob.title}...`);
        
        // Click job card
        await clickJobCardRobustly(currentJob);
        
        // Wait for details panel
        const panelReady = await waitForJobDetailsPanel();
        if (!panelReady) {
          console.warn(`[Phase 2] Job details panel not ready for ${currentJob.title}, skipping...`);
          continue;
        }
        
        // Click Apply Now
        const applyResult = await clickApplyNowRobustly();
        
        if (applyResult.success) {
          processedCount++;
          sendStatusUpdate(`âœ… Application ${processedCount} opened: ${currentJob.title}`);
          
          if (applyResult.action === "apply_opened_new_tab") {
            // Give Phase 1 time to process in new tab
            await new Promise(resolve => setTimeout(resolve, 8000));
          }
        }
        
        // Brief delay between jobs
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        errorCount++;
        console.error(`[Phase 2] Error processing job ${i + 1}:`, error);
        sendStatusUpdate(`âš ï¸ Error with ${currentJob.title}: ${error.message}`);
        
        if (errorCount >= maxErrors) {
          throw new Error(`Too many errors (${errorCount}), stopping automation`);
        }
        
        // Continue to next job
        continue;
      }
    }
    
    const finalMessage = `ðŸŽ‰ Phase 2 completed! Processed ${processedCount}/${jobsToProcess} jobs successfully.`;
    sendStatusUpdate(finalMessage);
    console.log(`[Phase 2] ${finalMessage}`);
    
    return { success: true, processed: processedCount, total: jobsToProcess };
    
  } catch (error) {
    const errorMessage = `âŒ Phase 2 error: ${error.message}`;
    sendStatusUpdate(errorMessage);
    console.error(`[Phase 2] Fatal error:`, error);
    return { success: false, error: error.message };
  } finally {
    // Always stop protection when done
    setTimeout(() => {
      allowPageReloads();
    }, 2000);
  }
}

// ==========================================
// PHASE 1 AUTOMATION FUNCTIONS (Enhanced)
// ==========================================

console.log("[Jobblixor DEBUG] content.js loaded on page:", window.location.href);

// Global variables for Phase 1
let autoStartEmail = null;
let isRunning = false;
let isPaused = false;
let pageCheckInterval = null;
let targetJobCount = 1;
let currentJobCount = 0;
let processedPages = new Set();

// Start continuous monitoring when email is set
function startContinuousMonitoring(email) {
  autoStartEmail = email;
  console.log("[Jobblixor DEBUG] Starting continuous monitoring with email:", email);
  
  // Clear any existing interval
  if (pageCheckInterval) {
    clearInterval(pageCheckInterval);
  }
  
  // Check every 3 seconds for new pages
  pageCheckInterval = setInterval(() => {
    checkForAutoStart();
  }, 3000);
}

// Stop monitoring when application is complete
function stopContinuousMonitoring() {
  console.log("[Jobblixor DEBUG] Stopping continuous monitoring");
  autoStartEmail = null;
  isRunning = false;
  isPaused = false;
  processedPages.clear();
  if (pageCheckInterval) {
    clearInterval(pageCheckInterval);
    pageCheckInterval = null;
  }
}

// Check if we should auto-start the bot on this page
function checkForAutoStart() {
  const currentUrl = window.location.href;
  
  // Don't run if already running, paused, or no email stored
  if (isRunning || isPaused || !autoStartEmail) {
    return;
  }

  // Check if we've already processed this exact URL
  if (processedPages.has(currentUrl)) {
    console.log("[Jobblixor DEBUG] Page already processed, skipping:", currentUrl);
    return;
  }

  // Check if we've reached our target job count
  if (currentJobCount >= targetJobCount) {
    logProgress(autoStartEmail, `ðŸŽ¯ Target of ${targetJobCount} applications reached!`);
    stopContinuousMonitoring();
    return;
  }
  
  // Check if we're on an Indeed application page
  if (isIndeedApplicationPage(currentUrl)) {
    console.log("[Jobblixor DEBUG] Auto-starting bot on NEW page:", currentUrl);
    
    // Mark this page as processed IMMEDIATELY
    processedPages.add(currentUrl);
    isRunning = true;
    
    // Add a small delay to ensure page is fully loaded
    setTimeout(() => {
      startJobblixorBot(autoStartEmail).then(() => {
        isRunning = false;
      }).catch((err) => {
        console.error("[Jobblixor DEBUG] Auto-start error:", err);
        isRunning = false;
        // Remove from processed pages if it failed
        processedPages.delete(currentUrl);
      });
    }, 1500);
  }
}

// Detect if current page is part of Indeed application flow
function isIndeedApplicationPage(url) {
  const applicationPatterns = [
    '/form/questions-module/',
    '/form/demographic-questions/',
    '/form/resume-selection-module/',
    '/form/contact-module/',
    '/form/contact-info-module/',
    '/apply',
    '/job-application',
    '/application/',
    '/questions/',
    '/demographic/',
    '/resume-selection',
    '/contact-information'
  ];
  
  const isApplicationPage = applicationPatterns.some(pattern => url.includes(pattern));
  
  // Additional checks for application pages
  const hasApplicationElements = 
    document.querySelector('button[type="submit"]') ||
    document.querySelector('input[type="submit"]') ||
    document.querySelector('button') ||
    document.querySelector('[data-testid*="continue"]') ||
    document.querySelector('[data-testid*="submit"]') ||
    Array.from(document.querySelectorAll('button')).find(btn => 
      /continue|submit|next|review|apply/i.test(btn.textContent || btn.innerText || '')
    );
  
  const finalResult = isApplicationPage || (url.includes('indeed.com') && hasApplicationElements);
  
  if (finalResult) {
    console.log("[Jobblixor DEBUG] Detected application page:", url);
  }
  
  return finalResult;
}

// Main Phase 1 automation function
async function startJobblixorBot(email) {
  try {
    // Check if paused
    if (isPaused) {
      logProgress(email, "Bot is paused. Click Resume to continue.");
      return;
    }
    
    console.log("[Jobblixor DEBUG] startJobblixorBot called with:", email);
    const profile = await fetchUserProfile(email);
    console.log("[Jobblixor DEBUG] Fetched user profile:", profile);

    logProgress(email, "ðŸš€ Starting Jobblixor auto-apply bot...");

    // Step 1: Handle screening questions
    const screeningAnswered = handleScreeningQuestions(profile);
    if (screeningAnswered > 0) {
      logProgress(email, `Answered ${screeningAnswered} screening questions`);
    }

    // Step 1.5: Handle resume selection page specifically
    const currentUrl = window.location.href;
    if (currentUrl.includes('resume-selection')) {
      console.log("[Jobblixor DEBUG] On resume selection page - resume appears ready");
      logProgress(email, "Resume page detected - proceeding to Continue");
    } else {
      const resumePageHandled = handleResumeSelectionPage();
      if (resumePageHandled) {
        logProgress(email, "Handled resume selection page");
      }
    }

    // Step 2: Force-check any remaining unchecked checkboxes for maximum availability
    const remainingCheckboxes = await forceCheckAvailabilityBoxes();
    if (remainingCheckboxes > 0) {
      logProgress(email, `Force-checked ${remainingCheckboxes} availability checkboxes`);
    }

    // Step 3: robust fill for regular fields
    const fieldMappings = getFieldMappings(profile);
    let filledAny = false;
    fieldMappings.forEach(map => {
      if (map.value && robustFillField(map.keywords, map.value)) {
        logProgress(email, `Filled one of ${map.keywords.join('/')} with "${map.value}"`);
        filledAny = true;
      }
    });

    // Step 4: check any required checkboxes
    fillAllCheckboxes();

    // Step 5: upload resume if available
    let resumeUploaded = false;
    let resumeHandledContinue = false;
    if (profile.resume) {
      const result = await uploadResumeFromFirebase(profile.resume);
      resumeUploaded = result.uploaded;
      resumeHandledContinue = result.clickedContinue;
    }

    // Step 6: warn if nothing got filled
    if (!filledAny && !resumeUploaded && screeningAnswered === 0) {
      if (!detectAnyFillableInputs()) {
        logProgress(email, "No fillable fields detected. Manual input may be required.");
      } else {
        logProgress(email, "No known fields matched on this form step.");
      }
    }

    // Step 7: click next/continue/submit (only if resume didn't already handle it)
    if (!resumeHandledContinue) {
      // Wait for form validation and data saving
      console.log("[Jobblixor DEBUG] Waiting for form validation and data persistence...");
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const nextBtn = Array.from(document.querySelectorAll('button, input[type="submit"]'))
        .find(b => /next|continue|submit|review.*application|apply|proceed/i.test(b.innerText || b.value));
      if (nextBtn) {
        if (!nextBtn.disabled && nextBtn.getAttribute('aria-disabled') !== 'true') {
          // Additional verification: make sure all required fields are still filled
          console.log("[Jobblixor DEBUG] Verifying form data before clicking Continue...");
          
          // Check if phone number is still there
          const phoneInputs = document.querySelectorAll('input[type="tel"], input[name*="phone"], input[id*="phone"]');
          for (const phoneInput of phoneInputs) {
            if (phoneInput.value) {
              console.log(`[Jobblixor DEBUG] Phone field verified: "${phoneInput.value}"`);
            } else {
              console.log(`[Jobblixor DEBUG] âš ï¸ Phone field is empty, may need re-filling`);
            }
          }
          
          // Final delay before clicking
          await new Promise(resolve => setTimeout(resolve, 500));
          
          nextBtn.click();
          logProgress(email, "Clicked Continue button");
        } else {
          console.log("[Jobblixor DEBUG] Continue button is disabled - may need to answer more questions");
        }
      } else {
        console.log("[Jobblixor DEBUG] No Continue button found.");
      }
    }

    logProgress(email, "Step complete! Bot waiting for next page...");
    
    // Check if we've reached the final submission page
    if (window.location.href.includes('application-submitted') || 
        window.location.href.includes('thank-you') || 
        window.location.href.includes('confirmation') ||
        window.location.href.includes('success') ||
        document.querySelector('.application-complete') ||
        document.querySelector('[data-testid="application-complete"]') ||
        document.querySelector('[data-testid*="success"]') ||
        document.querySelector('[data-testid*="submitted"]') ||
        Array.from(document.querySelectorAll('h1, h2')).find(h => 
          /application.*submitted|thank.*you|success|complete/i.test(h.textContent || '')
        )) {
      
      currentJobCount++;
      logProgress(email, `ðŸŽ‰ APPLICATION ${currentJobCount} SUBMITTED SUCCESSFULLY!`);
      
      // Send completion message
      chrome.runtime.sendMessage({
        type: "APPLICATION_COMPLETED",
        email: email
      });
      
      if (currentJobCount >= targetJobCount) {
        logProgress(email, `ðŸŽ¯ Target of ${targetJobCount} applications reached!`);
        chrome.runtime.sendMessage({
          type: "APPLICATION_FLOW_COMPLETE",
          email: email
        });
        stopContinuousMonitoring();
      } else {
        logProgress(email, `ðŸ“Š Progress: ${currentJobCount}/${targetJobCount} applications completed`);
      }
      
      console.log("[Jobblixor DEBUG] Application completed!");
    } else {
      logProgress(email, "Waiting for page navigation to continue automatically...");
      console.log("[Jobblixor DEBUG] Current URL:", window.location.href);
      console.log("[Jobblixor DEBUG] Continuous monitoring will handle next page automatically");
    }
  } catch (err) {
    logProgress(email, `âŒ Error: ${err}`);
    console.error("[Jobblixor DEBUG] ERROR in main automation:", err);
  }
}

// FIXED fetchUserProfile with better fallbacks
function fetchUserProfile(email) {
  console.log("[Jobblixor DEBUG] fetchUserProfile called with:", email);
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "FETCH_USER_DOC", email }, (response) => {
      console.log("[Jobblixor DEBUG] FETCH_USER_DOC response:", response);
      if (response?.success && response.data) {
        const profile = {
          first_name: "Livia",
          last_name: "DeMori",
          email: email,
          phone_number: "3524434968",
          location: "New York, NY",
          zip_code: "10001",
          street_address: "123 Main Street",
          years_experience: "2-3",
          gender: "female",
          ethnicity: "asian",
          veteran_status: "no",
          hispanic_latino: "no",
          over_18: "yes",
          authorized_us: "yes",
          require_sponsorship: "no",
          preferred_salary: "50000",
          resume: null,
          ...response.data // Override with actual profile data
        };
        resolve(profile);
      } else {
        // Full fallback profile
        resolve({
          first_name: "Livia",
          last_name: "DeMori", 
          email: email,
          phone_number: "3524434968",
          location: "New York, NY",
          zip_code: "10001",
          street_address: "123 Main Street",
          years_experience: "2-3",
          gender: "female",
          ethnicity: "asian",
          veteran_status: "no",
          hispanic_latino: "no",
          over_18: "yes",
          authorized_us: "yes",
          require_sponsorship: "no",
          preferred_salary: "50000",
          resume: null
        });
      }
    });
  });
}

// ---- Handle Screening Questions ----
function handleScreeningQuestions(profile) {
  console.log("[Jobblixor DEBUG] Checking for screening questions...");
  let answeredCount = 0;

  const screeningRules = [
    {
      patterns: ['18 years of age', '18 years or older', 'at least 18', 'eighteen years'],
      answer: 'yes',
      profileKey: 'over_18'
    },
    {
      patterns: ['authorized to work', 'right to work', 'eligible to work', 'work authorization'],
      answer: 'yes',
      profileKey: 'authorized_us'
    },
    {
      patterns: ['require sponsorship', 'need sponsorship', 'visa sponsorship', 'work visa'],
      answer: 'no',
      profileKey: 'require_sponsorship'
    },
    {
      patterns: ['years of experience', 'relevant experience', 'work experience'],
      answer: profile.years_experience || '0-2',
      profileKey: 'years_experience'
    },
    {
      patterns: ['willing to relocate', 'open to relocation', 'relocate for'],
      answer: 'yes',
      profileKey: 'willing_relocate'
    },
    {
      patterns: ['available to start', 'start date', 'when can you start'],
      answer: 'immediately',
      profileKey: 'start_date'
    },
    {
      patterns: ['availability to work', 'general availability', 'available to work'],
      answer: 'all',
      profileKey: 'availability'
    },
    {
      patterns: ['full time or part time', 'full time and part time', 'work schedule', 'employment type'],
      answer: 'both full time and part time',
      profileKey: 'schedule_preference'
    },
    {
      patterns: ['nights', 'night shifts', 'overnight'],
      answer: 'yes',
      profileKey: 'nights_available'
    },
    {
      patterns: ['days', 'day shifts', 'daytime'],
      answer: 'yes',
      profileKey: 'days_available'
    },
    {
      patterns: ['holidays', 'holiday work'],
      answer: 'yes',
      profileKey: 'holidays_available'
    },
    {
      patterns: ['weekends', 'weekend work'],
      answer: 'yes',
      profileKey: 'weekends_available'
    },
    {
      patterns: ['please enter your gender', 'enter your gender', 'gender'],
      answer: profile.gender || 'not declared',
      profileKey: 'gender'
    },
    {
      patterns: ['please enter your ethnicity', 'enter your ethnicity', 'ethnicity'],
      answer: profile.ethnicity || 'prefer not to answer',
      profileKey: 'ethnicity'
    },
    {
      patterns: ['please enter your veteran status', 'enter your veteran status', 'veteran status'],
      answer: profile.veteran_status || 'i am not a veteran',
      profileKey: 'veteran_status'
    },
    {
      patterns: ['do you identify as hispanic', 'hispanic/latino', 'hispanic', 'latino'],
      answer: profile.hispanic_latino || 'no',
      profileKey: 'hispanic_latino'
    },
    {
      patterns: ['share these answers', 'terms and conditions', 'consent', 'agree'],
      answer: 'yes',
      profileKey: 'consent_sharing'
    }
  ];

  const questionElements = Array.from(document.querySelectorAll('p, div, label, legend, h3, h4'))
    .filter(el => {
      const text = el.textContent.toLowerCase();
      return text.includes('?') && text.length > 10 && text.length < 200;
    });

  console.log(`[Jobblixor DEBUG] Found ${questionElements.length} potential questions`);

  handleStandaloneCheckboxGroups();

  questionElements.forEach(questionEl => {
    const questionText = questionEl.textContent.toLowerCase();
    console.log(`[Jobblixor DEBUG] Analyzing question: "${questionText}"`);

    const matchedRule = screeningRules.find(rule => 
      rule.patterns.some(pattern => questionText.includes(pattern))
    );

    if (matchedRule) {
      console.log(`[Jobblixor DEBUG] Matched rule for: ${matchedRule.patterns[0]}`);
      
      let answerValue = profile[matchedRule.profileKey] || matchedRule.answer;
      
      const questionContainer = questionEl.closest('div, fieldset, form') || questionEl.parentElement;
      if (questionContainer) {
        if (matchedRule.answer === 'all') {
          const checkboxes = questionContainer.querySelectorAll('input[type="checkbox"]');
          if (checkboxes.length > 0) {
            console.log(`[Jobblixor DEBUG] Found ${checkboxes.length} availability checkboxes - checking all`);
            checkboxes.forEach(checkbox => {
              if (!checkbox.checked) {
                checkbox.checked = true;
                checkbox.click();
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`[Jobblixor DEBUG] âœ… Checked availability option: ${checkbox.value || checkbox.id}`);
              }
            });
            answeredCount++;
            return;
          }
        }

        const radios = questionContainer.querySelectorAll('input[type="radio"]');
        const answered = handleRadioQuestion(radios, answerValue, questionText);
        if (answered) {
          answeredCount++;
          return;
        }

        const selects = questionContainer.querySelectorAll('select');
        const selectedDropdown = handleSelectQuestion(selects, answerValue, questionText);
        if (selectedDropdown) {
          answeredCount++;
          return;
        }

        const checkboxes = questionContainer.querySelectorAll('input[type="checkbox"]');
        const checkedBox = handleCheckboxQuestion(checkboxes, answerValue, questionText);
        if (checkedBox) {
          answeredCount++;
        }
      }
    } else {
      console.log(`[Jobblixor DEBUG] No rule matched for: "${questionText}" - applying fallback logic`);
      const handled = handleUnknownQuestion(questionEl, questionText);
      if (handled) {
        answeredCount++;
      }
    }
  });

  // ALSO handle specific demographic form elements directly
  handleDemographicFormElements(profile);

  console.log(`[Jobblixor DEBUG] Answered ${answeredCount} screening questions total`);
  return answeredCount;
}

// Handle resume selection page (Build Indeed Resume vs Upload Resume)
function handleResumeSelectionPage() {
  console.log("[Jobblixor DEBUG] Checking if this is a resume selection page...");
  
  const currentUrl = window.location.href;
  if (!currentUrl.includes('resume-selection')) {
    return false;
  }
  
  console.log("[Jobblixor DEBUG] Detected resume selection page");
  
  // Check if resume is already uploaded/selected
  const resumeUploaded = document.querySelector('[data-testid="resume-preview"]') ||
                        document.querySelector('.resume-preview') ||
                        document.querySelector('[data-testid*="resume"]') ||
                        document.querySelector('iframe') ||
                        Array.from(document.querySelectorAll('div')).find(div => 
                          div.textContent && div.textContent.includes('resume') && div.textContent.includes('.pdf')
                        );
  
  if (resumeUploaded) {
    console.log("[Jobblixor DEBUG] Resume already uploaded, proceeding to Continue");
    return true;
  }
  
  // Look for "Upload a resume" option
  const uploadButtons = Array.from(document.querySelectorAll('button, div, label'))
    .filter(el => /upload.*resume|upload a resume/i.test(el.textContent || ''));
  
  if (uploadButtons.length > 0) {
    const uploadBtn = uploadButtons[0];
    uploadBtn.click();
    console.log("[Jobblixor DEBUG] âœ… Selected 'Upload a resume' option");
    return true;
  }
  
  // Alternative: look for radio buttons or tiles
  const radioButtons = document.querySelectorAll('input[type="radio"]');
  for (const radio of radioButtons) {
    const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
    const labelText = label ? label.textContent.toLowerCase() : '';
    
    if (labelText.includes('upload') && labelText.includes('resume')) {
      if (!radio.checked) {
        radio.checked = true;
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("[Jobblixor DEBUG] âœ… Selected upload resume radio option");
        return true;
      }
    }
  }
  
  console.log("[Jobblixor DEBUG] Resume appears to be ready, no action needed");
  return true;
}

// Direct handling of demographic form elements
function handleDemographicFormElements(profile) {
  console.log("[Jobblixor DEBUG] Directly handling demographic form elements...");
  
  // Handle Gender Radio Buttons
  const genderRadios = document.querySelectorAll('input[type="radio"]');
  const genderValue = profile.gender || 'not declared';
  console.log(`[Jobblixor DEBUG] Looking for gender option: "${genderValue}"`);
  
  for (const radio of genderRadios) {
    const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
    const radioText = label ? label.textContent.toLowerCase().trim() : radio.value.toLowerCase();
    
    if ((genderValue === 'male' && radioText === 'male') ||
        (genderValue === 'female' && radioText === 'female') ||
        ((genderValue === 'not declared' || !genderValue) && (radioText.includes('not declared') || radioText.includes('not disclosed')))) {
      if (!radio.checked) {
        radio.checked = true;
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`[Jobblixor DEBUG] âœ… Selected gender: ${radioText}`);
        break;
      }
    }
  }
  
  // Handle Ethnicity Dropdown
  const ethnicitySelects = document.querySelectorAll('select');
  const ethnicityValue = profile.ethnicity || 'prefer not to answer';
  console.log(`[Jobblixor DEBUG] Looking for ethnicity option: "${ethnicityValue}"`);
  
  for (const select of ethnicitySelects) {
    const selectContainer = select.closest('div');
    const containerText = selectContainer ? selectContainer.textContent.toLowerCase() : '';
    
    if (containerText.includes('ethnicity') || containerText.includes('race')) {
      console.log(`[Jobblixor DEBUG] Found ethnicity dropdown with ${select.options.length} options`);
      
      for (const option of select.options) {
        const optionText = option.textContent.toLowerCase();
        
        if ((ethnicityValue.includes('prefer not') && optionText.includes('prefer not')) ||
            (ethnicityValue.includes('decline') && optionText.includes('decline')) ||
            (ethnicityValue.includes('white') && optionText.includes('white')) ||
            (ethnicityValue.includes('black') && optionText.includes('black')) ||
            (ethnicityValue.includes('asian') && optionText.includes('asian')) ||
            (ethnicityValue.includes('hispanic') && optionText.includes('hispanic'))) {
          
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`[Jobblixor DEBUG] âœ… Selected ethnicity: ${option.textContent}`);
          break;
        }
      }
      break;
    }
  }
  
  // Handle Veteran Status Radio Buttons
  const veteranValue = profile.veteran_status || 'i am not a veteran';
  console.log(`[Jobblixor DEBUG] Looking for veteran status option: "${veteranValue}"`);
  
  const allRadios = document.querySelectorAll('input[type="radio"]');
  for (const radio of allRadios) {
    const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
    const radioText = label ? label.textContent.toLowerCase().trim() : radio.value.toLowerCase();
    
    const container = radio.closest('div, fieldset');
    const containerText = container ? container.textContent.toLowerCase() : '';
    
    if (containerText.includes('veteran status') || containerText.includes('veteran')) {
      console.log(`[Jobblixor DEBUG] Found veteran radio: "${radioText}"`);
      
      if ((veteranValue.toLowerCase().includes('not') && 
           (radioText.includes('i am not') || radioText.includes('not a veteran'))) ||
          (veteranValue.toLowerCase().includes('do not wish') && 
           radioText.includes('do not wish')) ||
          (!veteranValue.toLowerCase().includes('not') && 
           !veteranValue.toLowerCase().includes('do not') &&
           radioText.includes('veteran') && !radioText.includes('not'))) {
        
        if (!radio.checked) {
          radio.checked = true;
          radio.click();
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`[Jobblixor DEBUG] âœ… Selected veteran status: ${radioText}`);
          break;
        }
      }
    }
  }
  
  // Handle Hispanic/Latino Radio Buttons
  const hispanicValue = profile.hispanic_latino || 'no';
  console.log(`[Jobblixor DEBUG] Looking for hispanic/latino option: "${hispanicValue}"`);
  
  for (const radio of allRadios) {
    const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
    const radioText = label ? label.textContent.toLowerCase().trim() : radio.value.toLowerCase();
    
    const container = radio.closest('div');
    const containerText = container ? container.textContent.toLowerCase() : '';
    
    if (containerText.includes('hispanic') || containerText.includes('latino')) {
      if ((hispanicValue === 'yes' && radioText === 'yes') ||
          (hispanicValue === 'no' && radioText === 'no')) {
        if (!radio.checked) {
          radio.checked = true;
          radio.click();
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`[Jobblixor DEBUG] âœ… Selected hispanic/latino: ${radioText}`);
          break;
        }
      }
    }
  }
}

function handleStandaloneCheckboxGroups() {
  console.log("[Jobblixor DEBUG] Checking for standalone checkbox groups...");
  
  const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
  
  if (allCheckboxes.length >= 3) {
    console.log(`[Jobblixor DEBUG] Found ${allCheckboxes.length} checkboxes - checking if they're availability options`);
    
    let isAvailabilityGroup = false;
    const availabilityKeywords = ['nights', 'days', 'holidays', 'weekends', 'availability', 'shifts'];
    
    for (const checkbox of allCheckboxes) {
      const label = document.querySelector(`label[for="${checkbox.id}"]`) || checkbox.closest('label');
      const labelText = label ? label.textContent.toLowerCase() : '';
      
      if (availabilityKeywords.some(keyword => labelText.includes(keyword))) {
        isAvailabilityGroup = true;
        break;
      }
    }
    
    if (isAvailabilityGroup) {
      console.log("[Jobblixor DEBUG] Detected availability checkbox group - checking all options");
      let checkedCount = 0;
      
      allCheckboxes.forEach(checkbox => {
        if (!checkbox.checked) {
          const label = document.querySelector(`label[for="${checkbox.id}"]`) || checkbox.closest('label');
          const labelText = label ? label.textContent.trim() : (checkbox.value || checkbox.id);
          
          checkbox.checked = true;
          checkbox.click();
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`[Jobblixor DEBUG] âœ… Checked availability: ${labelText}`);
          checkedCount++;
        }
      });
      
      return checkedCount > 0;
    }
  }
  
  return false;
}

function handleRadioQuestion(radios, answerValue, questionText) {
  if (radios.length === 0) return false;

  console.log(`[Jobblixor DEBUG] Found ${radios.length} radio buttons for question`);

  for (const radio of radios) {
    let radioText = '';
    
    const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
    if (label) {
      radioText = label.textContent.toLowerCase().trim();
    }
    
    if (!radioText && radio.parentElement) {
      const parentText = radio.parentElement.textContent.toLowerCase().trim();
      if (parentText.length < 20) {
        radioText = parentText;
      }
    }
    
    if (!radioText && radio.nextSibling) {
      if (radio.nextSibling.nodeType === Node.TEXT_NODE) {
        radioText = radio.nextSibling.textContent.toLowerCase().trim();
      } else if (radio.nextSibling.tagName) {
        radioText = radio.nextSibling.textContent.toLowerCase().trim();
      }
    }
    
    if (!radioText && radio.value) {
      radioText = radio.value.toLowerCase().trim();
    }

    const shouldSelect = shouldSelectRadioOption(radioText, radio.value, answerValue, questionText);
    
    if (shouldSelect) {
      if (!radio.checked) {
        radio.checked = true;
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('input', { bubbles: true }));
        radio.dispatchEvent(new Event('click', { bubbles: true }));
        
        console.log(`[Jobblixor DEBUG] âœ… Selected radio: "${radioText || radio.value}"`);
        return true;
      } else {
        console.log(`[Jobblixor DEBUG] Radio already selected: "${radioText || radio.value}"`);
        return true;
      }
    }
  }

  return false;
}

function shouldSelectRadioOption(optionText, optionValue, answerValue, questionText) {
  const answer = answerValue.toString().toLowerCase().trim();
  const text = optionText.toLowerCase().trim();
  const value = optionValue.toLowerCase().trim();

  if (answer === 'yes' || answer === 'true') {
    if (text === 'yes' || value === 'yes' || text === 'true' || value === 'true') {
      return true;
    }
  }
  
  if (answer === 'no' || answer === 'false') {
    if (text === 'no' || value === 'no' || text === 'false' || value === 'false') {
      return true;
    }
  }

  if (answer === 'male' && (text === 'male' || value === 'male')) {
    return true;
  }

  if (answer === 'female' && (text === 'female' || value === 'female')) {
    return true;
  }

  if ((answer === 'not declared' || answer === 'prefer not to answer') && 
      (text.includes('not declared') || text.includes('not disclosed') || text.includes('prefer not'))) {
    return true;
  }

  if (text === answer || value === answer) {
    return true;
  }

  if (text.includes(answer) || value.includes(answer)) {
    return true;
  }

  return false;
}

function handleSelectQuestion(selects, answerValue, questionText) {
  if (selects.length === 0) return false;

  for (const select of selects) {
    for (const option of select.options) {
      const optionText = option.textContent.toLowerCase();
      const optionValue = option.value.toLowerCase();
      
      const shouldSelect = shouldSelectSelectOption(optionText, optionValue, answerValue, questionText);
      
      if (shouldSelect) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`[Jobblixor DEBUG] âœ… Selected option: "${option.textContent}"`);
        return true;
      }
    }
  }

  return false;
}

function shouldSelectSelectOption(optionText, optionValue, answerValue, questionText) {
  const answer = answerValue.toString().toLowerCase();
  const text = optionText.toLowerCase();
  const value = optionValue.toLowerCase();

  if (questionText.includes('experience') && /\d/.test(answer)) {
    const answerNum = parseInt(answer.match(/\d+/)?.[0] || '0');
    
    const rangeMatch = text.match(/(\d+)[-\s]*(?:to|-)?\s*(\d+)/);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1]);
      const max = parseInt(rangeMatch[2]);
      return answerNum >= min && answerNum <= max;
    }
    
    const singleMatch = text.match(/(\d+)/);
    if (singleMatch && parseInt(singleMatch[1]) === answerNum) {
      return true;
    }
    
    if (answerNum <= 1 && (text.includes('0-1') || text.includes('less than 2'))) return true;
    if (answerNum >= 2 && answerNum <= 3 && text.includes('2-3')) return true;
    if (answerNum >= 4 && answerNum <= 5 && text.includes('4-5')) return true;
    if (answerNum >= 6 && text.includes('6+')) return true;
  }

  if (text.includes(answer) || value.includes(answer)) {
    return true;
  }

  return false;
}

function handleCheckboxQuestion(checkboxes, answerValue, questionText) {
  if (checkboxes.length === 0) return false;

  const shouldCheck = answerValue.toString().toLowerCase() === 'yes' || 
                     answerValue.toString().toLowerCase() === 'true';

  if (shouldCheck) {
    checkboxes.forEach(checkbox => {
      if (!checkbox.checked) {
        checkbox.checked = true;
        checkbox.click();
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("[Jobblixor DEBUG] âœ… Checked checkbox");
      }
    });
    return true;
  }

  return false;
}

function handleUnknownQuestion(questionEl, questionText) {
  const questionContainer = questionEl.closest('div, fieldset, form') || questionEl.parentElement;
  if (!questionContainer) return false;

  if (questionText.includes('availability') || questionText.includes('work') || questionText.includes('schedule')) {
    const checkboxes = questionContainer.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      let checkedAny = false;
      checkboxes.forEach(checkbox => {
        if (!checkbox.checked) {
          checkbox.checked = true;
          checkbox.click();
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          checkedAny = true;
        }
      });
      return checkedAny;
    }
  }

  const radios = questionContainer.querySelectorAll('input[type="radio"]');
  if (radios.length > 0) {
    const attractiveOptions = [
      'both full time and part time', 'both', 'full time and part time',
      'full time', 'full-time',
      'yes', 'available', 'immediately', 'anytime',
      'flexible', 'open', 'willing'
    ];

    for (const attractiveOption of attractiveOptions) {
      for (const radio of radios) {
        const label = document.querySelector(`label[for="${radio.id}"]`) || radio.closest('label');
        let radioText = '';
        
        if (label) {
          radioText = label.textContent.toLowerCase().trim();
        } else if (radio.parentElement) {
          radioText = radio.parentElement.textContent.toLowerCase().trim();
        } else if (radio.value) {
          radioText = radio.value.toLowerCase().trim();
        }

        if (radioText.includes(attractiveOption)) {
          if (!radio.checked) {
            radio.checked = true;
            radio.click();
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`[Jobblixor DEBUG] âœ… Fallback selected attractive option: "${radioText}"`);
            return true;
          }
        }
      }
    }

    if (radios[0] && !radios[0].checked) {
      radios[0].checked = true;
      radios[0].click();
      radios[0].dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`[Jobblixor DEBUG] âœ… Fallback selected first radio option`);
      return true;
    }
  }

  return false;
}

async function forceCheckAvailabilityBoxes() {
  console.log("[Jobblixor DEBUG] Force-checking any remaining unchecked checkboxes...");
  
  const allCheckboxes = document.querySelectorAll('input[type="checkbox"]:not(:checked)');
  console.log(`[Jobblixor DEBUG] Found ${allCheckboxes.length} unchecked checkboxes`);
  
  let checkedCount = 0;
  
  for (const checkbox of allCheckboxes) {
    if (checkbox.offsetParent === null || checkbox.disabled) {
      continue;
    }
    
    const label = document.querySelector(`label[for="${checkbox.id}"]`) || checkbox.closest('label');
    let labelText = '';
    
    if (label) {
      labelText = label.textContent.trim();
    } else if (checkbox.parentElement) {
      const parentText = checkbox.parentElement.textContent.trim();
      if (parentText.length < 50) {
        labelText = parentText;
      }
    } else if (checkbox.value) {
      labelText = checkbox.value;
    } else if (checkbox.name) {
      labelText = checkbox.name;
    }
    
    console.log(`[Jobblixor DEBUG] Force-checking checkbox: "${labelText}"`);
    
    if (label) {
      label.click();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('click', { bubbles: true }));
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    checkbox.dispatchEvent(new Event('input', { bubbles: true }));
    
    checkbox.focus();
    checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    checkbox.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
    
    checkbox.click();
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    if (checkbox.checked) {
      console.log(`[Jobblixor DEBUG] âœ… Successfully checked: "${labelText}"`);
      checkedCount++;
    }
  }
  
  return checkedCount;
}

function getFieldMappings(profile) {
  return [
    { value: profile.first_name, keywords: ['first name', 'given name', 'fname', 'forename'] },
    { value: profile.last_name, keywords: ['last name', 'surname', 'lname', 'family name'] },
    { value: profile.email, keywords: ['email', 'e-mail'] },
    { value: profile.phone_number, keywords: ['phone', 'mobile', 'cell'] },
    { value: profile.location, keywords: ['location', 'city', 'locality', 'town'] },
    { value: profile.preferred_salary, keywords: ['salary', 'expected pay', 'pay'] },
    { value: profile.zip_code, keywords: ['zip', 'postal', 'postcode', 'zip/postal'] },
    { value: profile.street_address, keywords: ['address', 'address line', 'street', 'street address', 'address 1', 'address line 1'] }
  ];
}

function robustFillField(keywords, value) {
  let filled = false;
  
  // Enhanced phone number handling
  if (keywords.some(kw => kw.includes('phone'))) {
    console.log(`[Jobblixor DEBUG] Looking for phone number field with value: "${value}"`);
    
    const phoneInputs = document.querySelectorAll('input[type="tel"], input[name*="phone"], input[id*="phone"], input[placeholder*="phone"]');
    
    for (const phoneInput of phoneInputs) {
      if (phoneInput.type === 'tel' || 
          phoneInput.name?.toLowerCase().includes('phone') ||
          phoneInput.id?.toLowerCase().includes('phone') ||
          phoneInput.placeholder?.toLowerCase().includes('phone')) {
        
        const cleanPhone = value.replace(/\D/g, '');
        
        console.log(`[Jobblixor DEBUG] Attempting to fill phone with: "${cleanPhone}"`);
        
        phoneInput.focus();
        phoneInput.select();
        document.execCommand('delete');
        
        setNativeValue(phoneInput, cleanPhone);
        
        phoneInput.value = '';
        for (let i = 0; i < cleanPhone.length; i++) {
          phoneInput.value += cleanPhone[i];
          phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
        phoneInput.dispatchEvent(new Event('blur', { bubbles: true }));
        
        setTimeout(() => {
          console.log(`[Jobblixor DEBUG] Phone field value after fill: "${phoneInput.value}"`);
          if (phoneInput.value === cleanPhone) {
            console.log(`[Jobblixor DEBUG] âœ… Phone number successfully filled and verified`);
          } else {
            console.log(`[Jobblixor DEBUG] âš ï¸ Phone number may not have stuck properly`);
            phoneInput.value = cleanPhone;
            phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
            phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, 500);
        
        filled = true;
        break;
      }
    }
  }
  
  // General field filling for non-phone fields or if phone wasn't filled
  if (!filled) {
    document.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input:not([type]), textarea, select').forEach(input => {
      const allAttrs = [
        input.labels?.[0]?.innerText?.toLowerCase() || "",
        input.placeholder?.toLowerCase() || "",
        input.name?.toLowerCase() || "",
        input.id?.toLowerCase() || "",
        input.getAttribute("data-testid")?.toLowerCase() || "",
        input.getAttribute("aria-label")?.toLowerCase() || ""
      ];
      if (keywords.some(kw => allAttrs.some(attr => attr.includes(kw)))) {
        setNativeValue(input, value);
        filled = true;
        console.log(`[Jobblixor DEBUG] [Native Setter] Filled "${keywords.join('/')}" with "${value}"`);
      }
    });
  }
  
  if (!filled) {
    document.querySelectorAll('input[type="radio"], select').forEach(el => {
      const allAttrs = [
        el.labels?.[0]?.innerText?.toLowerCase() || "",
        el.name?.toLowerCase() || "",
        el.id?.toLowerCase() || "",
        el.getAttribute("data-testid")?.toLowerCase() || "",
        el.getAttribute("aria-label")?.toLowerCase() || ""
      ];
      if (keywords.some(kw => allAttrs.some(attr => attr.includes(kw)))) {
        if (el.type === "radio") {
          if (el.value?.toLowerCase() === value?.toLowerCase() || allAttrs.some(attr => attr.includes(value?.toLowerCase()))) {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filled = true;
            console.log(`[Jobblixor DEBUG] Checked radio "${keywords.join('/')}" as "${value}"`);
          }
        }
        if (el.tagName === "SELECT") {
          for (const option of el.options) {
            if (option.text.toLowerCase().includes(value.toLowerCase())) {
              el.value = option.value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              filled = true;
              console.log(`[Jobblixor DEBUG] Selected option "${keywords.join('/')}" as "${value}"`);
              break;
            }
          }
        }
      }
    });
  }
  return filled;
}

function setNativeValue(element, value) {
  // Special handling for phone inputs
  if (element.type === 'tel' || 
      element.name?.toLowerCase().includes('phone') ||
      element.id?.toLowerCase().includes('phone') ||
      element.placeholder?.toLowerCase().includes('phone')) {
    
    console.log(`[Jobblixor DEBUG] Using enhanced phone input method for: "${value}"`);
    
    element.focus();
    element.select();
    
    const lastValue = element.value;
    element.value = value;
    
    const tracker = element._valueTracker;
    if (tracker) {
      tracker.setValue(lastValue);
    }
    
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      element.dispatchEvent(new KeyboardEvent('keydown', { 
        key: char, 
        code: `Digit${char}`, 
        bubbles: true 
      }));
      element.dispatchEvent(new KeyboardEvent('keyup', { 
        key: char, 
        code: `Digit${char}`, 
        bubbles: true 
      }));
    }
    
    setTimeout(() => {
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`[Jobblixor DEBUG] Phone input final value: "${element.value}"`);
    }, 100);
    
  } else {
    // Regular input handling for non-phone fields
    const lastValue = element.value;
    element.value = value;
    const event = new Event('input', { bubbles: true });
    const tracker = element._valueTracker;
    if (tracker) {
      tracker.setValue(lastValue);
    }
    element.dispatchEvent(event);
  }
}

function fillAllCheckboxes() {
  console.log('[Jobblixor DEBUG] Checking for agreement/terms checkboxes...');
  
  document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    if (!checkbox.checked) {
      const label = document.querySelector(`label[for="${checkbox.id}"]`) || checkbox.closest('label');
      const parent = checkbox.parentElement;
      
      let checkboxContext = '';
      if (label) {
        checkboxContext = label.textContent.toLowerCase();
      } else if (parent) {
        checkboxContext = parent.textContent.toLowerCase();
      }
      
      if (checkboxContext.includes('terms') || 
          checkboxContext.includes('conditions') || 
          checkboxContext.includes('agree') || 
          checkboxContext.includes('consent') || 
          checkboxContext.includes('share') || 
          checkboxContext.includes('policy') ||
          checkboxContext.includes('understand') ||
          checkboxContext.includes('acknowledge')) {
        
        checkbox.checked = true;
        if (label) {
          label.click();
        }
        checkbox.click();
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        checkbox.dispatchEvent(new Event('input', { bubbles: true }));
        
        console.log('[Jobblixor DEBUG] âœ… Checked agreement/terms checkbox');
      }
    }
  });
}

async function uploadResumeFromFirebase(resumeUrl) {
  try {
    selectUploadResumeOption();
    
    await new Promise(r => setTimeout(r, 500));

    const waitForInput = async () => {
      for (let i = 0; i < 12; i++) {
        const inp = document.querySelector('input[type="file"]');
        if (inp) return inp;
        await new Promise(r => setTimeout(r, 250));
      }
      return null;
    };
    const fileInput = await waitForInput();
    if (!fileInput) {
      console.log('[Jobblixor DEBUG] No file input found for resume upload');
      return { uploaded: false, clickedContinue: false };
    }
    if (fileInput.files && fileInput.files.length > 0) {
      console.log('[Jobblixor DEBUG] File input already has a file');
      return { uploaded: true, clickedContinue: false };
    }

    const resp = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'FETCH_RESUME_FILE', resumeUrl }, resolve);
    });
    if (!resp || !resp.success) {
      console.error('[Jobblixor DEBUG] Resume fetch failed:', resp?.error);
      return { uploaded: false, clickedContinue: false };
    }

    const base64 = resp.base64;
    const mimeType = resp.mimeType || 'application/pdf';
    const filename = resp.filename || 'resume.pdf';

    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const file = new File([bytes], filename, { type: mimeType });

    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;

    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    console.log('[Jobblixor DEBUG] Resume uploaded!');

    await new Promise(r => setTimeout(r, 500));
    selectPostUploadResumeOptions();

    await new Promise(r => setTimeout(r, 1000));
    
    const continueBtn = Array.from(document.querySelectorAll('button, input[type="submit"]'))
      .find(b => /continue|next|submit/i.test(b.innerText || b.value));
    
    if (continueBtn) {
      console.log('[Jobblixor DEBUG] Found Continue button, waiting for it to be enabled...');
      const enabled = await waitForEnabled(continueBtn, 10000);
      
      if (enabled) {
        const now = Date.now();
        if (!continueBtn._lastClicked || now - continueBtn._lastClicked > 2000) {
          continueBtn._lastClicked = now;
          continueBtn.click();
          console.log('[Jobblixor DEBUG] Clicked Continue button after resume upload');
          return { uploaded: true, clickedContinue: true };
        } else {
          console.log('[Jobblixor DEBUG] Continue button was recently clicked, skipping');
          return { uploaded: true, clickedContinue: true };
        }
      } else {
        console.log('[Jobblixor DEBUG] Continue button did not become enabled, may need manual intervention');
        return { uploaded: true, clickedContinue: false };
      }
    } else {
      console.log('[Jobblixor DEBUG] No Continue button found after resume upload');
      return { uploaded: true, clickedContinue: false };
    }
  } catch (e) {
    console.error('[Jobblixor DEBUG] Resume upload failed:', e);
    return { uploaded: false, clickedContinue: false };
  }
}

function selectUploadResumeOption() {
  const uploadElements = Array.from(document.querySelectorAll('button, label, div, span, input'))
    .filter(el => /upload.*resume|upload a resume/i.test(el.textContent || el.value || el.getAttribute('aria-label') || ''));

  for (const el of uploadElements) {
    if (el.type === 'radio') {
      if (!el.checked) {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[Jobblixor DEBUG] Selected upload resume radio option');
        return true;
      }
    } else if (el.tagName === 'LABEL') {
      const radio = el.querySelector('input[type="radio"]') || 
                   (el.getAttribute('for') && document.getElementById(el.getAttribute('for')));
      if (radio && radio.type === 'radio') {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[Jobblixor DEBUG] Selected upload resume radio via label');
        return true;
      } else {
        el.click();
        console.log('[Jobblixor DEBUG] Clicked upload resume label/button');
        return true;
      }
    } else {
      el.click();
      console.log('[Jobblixor DEBUG] Clicked upload resume element:', el.tagName);
      return true;
    }
  }
  
  return false;
}

function selectPostUploadResumeOptions() {
  const radios = Array.from(document.querySelectorAll('input[type="radio"]'))
    .filter(radio => !radio.checked);
  
  if (radios.length > 0) {
    const firstRadio = radios[0];
    firstRadio.checked = true;
    firstRadio.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[Jobblixor DEBUG] Selected post-upload resume option:', firstRadio.value || firstRadio.id);
    return true;
  }
  
  return false;
}

async function waitForEnabled(element, timeoutMs = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (!element.disabled && element.getAttribute('aria-disabled') !== 'true') {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return false;
}

function detectAnyFillableInputs() {
  const fillableInputs = document.querySelectorAll(
    'input[type="text"], input[type="email"], input[type="number"], textarea, select, input[type="radio"], input[type="checkbox"]'
  );
  console.log("[Jobblixor DEBUG] Fillable inputs detected:", fillableInputs.length);
  return fillableInputs.length > 0;
}

function logProgress(email, message) {
  if (!email) return;
  chrome.runtime.sendMessage({
    type: "LOG_PROGRESS_UPDATE",
    email,
    message,
    timestamp: Date.now()
  }, (response) => {
    if (!response?.success) {
      console.error("[Jobblixor DEBUG] Failed to log progress:", response?.error);
    }
  });
}

// ==========================================
// UNIFIED MESSAGE HANDLER WITH PROPER ROUTING
// ==========================================

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log("[Jobblixor DEBUG] onMessage received:", message.type, message);
  
  try {
    // PHASE 2: Start orchestrated search and apply - FIXED VERSION
    if (message.type === "START_AUTO_APPLY") {
      console.log("[Jobblixor DEBUG] ===== PHASE 2 MODE ACTIVATED =====");
      
      // COMPLETELY DISABLE Phase 1 monitoring to prevent interference
      stopContinuousMonitoring();
      isRunning = false;
      isPaused = false;

      // Set up user profile for Phase 2
      const userProfile = {
        job_title: message.jobTitle || "software engineer",
        location: message.location || "New York, NY", 
        targetJobs: message.jobCount || 10,
        email: message.email
      };

      console.log("[Phase 2] User Profile:", userProfile);

      // FORCE Phase 2 logic with proper async handling
      setTimeout(async () => {
        try {
          const result = await runPhase2Automation(userProfile);
          console.log("[Phase 2] Automation completed with result:", result);
        } catch (error) {
          console.error("[Phase 2] Automation failed:", error);
          sendStatusUpdate(`âŒ Phase 2 Error: ${error.message}`);
        }
      }, 1000);

      sendResponse({ success: true, message: "Phase 2 automation started" });
      return true;

    // PHASE 1: Run autofill ONLY for Easy Apply forms
    } else if (message.type === "RUN_PHASE1_AUTOFILL" && message.email) {
      console.log("[Jobblixor DEBUG] ===== PHASE 1 MODE ACTIVATED =====");
      console.log("[Phase 1] Running autofill for Easy Apply form");
      
      // This should ONLY run on smartapply.indeed.com pages
      if (!window.location.hostname.includes('smartapply.indeed.com')) {
        console.log("[Phase 1] WARNING: Not on Easy Apply page, skipping autofill");
        sendResponse({ success: false, error: "Not on Easy Apply page" });
        return true;
      }
      
      // Set target job count from message
      targetJobCount = message.jobCount || 1;
      currentJobCount = 0;
      processedPages.clear();
      
      // Start continuous monitoring for auto-continuation
      startContinuousMonitoring(message.email);
      
      // Run the bot immediately on current page
      isRunning = true;
      isPaused = false;
      
      // Mark current page as processed
      processedPages.add(window.location.href);
      
      await startJobblixorBot(message.email);
      isRunning = false;
      
      sendResponse({ success: true });
      console.log("[Jobblixor DEBUG] Phase 1 autofill completed");
      
    } else if (message.type === "STOP_AUTO_APPLY") {
      console.log("[Jobblixor DEBUG] STOP_AUTO_APPLY received");
      
      isRunning = false;
      isPaused = false;
      allowPageReloads();
      stopContinuousMonitoring();
      
      sendResponse({ success: true });

    } else {
      console.warn("[Jobblixor DEBUG] Received unknown message:", message);
      sendResponse({ success: false, error: "Unknown message type" });
    }
    
  } catch (err) {
    console.error("[Jobblixor DEBUG] Bot error:", err);
    allowPageReloads();
    sendResponse({ success: false, error: err?.toString() });
  }
  
  return true;
});

// Auto-detect Easy Apply pages and run Phase 1
if (window.location.hostname === 'smartapply.indeed.com' || 
    window.location.hostname === 'us.smartapply.indeed.com') {
  console.log("[Jobblixor] Detected Easy Apply page");
  
  // Wait for page to load, then check if we should auto-run Phase 1
  setTimeout(() => {
    if (autoStartEmail) {
      startJobblixorBot(autoStartEmail);
    }
  }, 3000);
}

})();