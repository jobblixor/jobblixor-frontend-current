// CRITICAL: Prevent duplicate script injection
if (!window.__JOBBLIXOR_LOADED__) {
  window.__JOBBLIXOR_LOADED__ = true;

  (() => {
// ==========================================
// SINGLE ORCHESTRATOR SYSTEM - NO LEGACY CODE
// ==========================================

// GLOBAL SINGLETON FLAGS
let globalOrchestratorRunning = false;
let globalStopped = false;
let currentSessionId = null;
// Global variables
let autoStartEmail = null;
let isRunning = false;
let isPaused = false;
let pageCheckInterval = null;
let targetJobCount = 1;
let currentJobCount = 0;
let processedPages = new Set(); // Track processed pages to prevent double-runs

// Generate unique session ID
function generateSessionId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

// Get or create session ID
function getSessionId() {
  if (!currentSessionId) {
    currentSessionId = generateSessionId();
    localStorage.setItem('jobblixor_session_id', currentSessionId);
  }
  return currentSessionId;
}

// ==========================================
// ORCHESTRATOR LOCK SYSTEM
// ==========================================

// === INSTANCE TRACKING ===
const INSTANCE_ID = `${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
let instanceActive = true;
// CRITICAL: Clear any stale global stop flag on fresh load
chrome.storage.local.remove(['jobblixor_global_stop'], () => {
  console.log('[Cleanup] Cleared stale global stop flag');
});

// Listen for global stop flag
chrome.storage.local.get(['jobblixor_global_stop'], (result) => {
  if (result.jobblixor_global_stop) {
    instanceActive = false;
    globalStopped = true;
    globalOrchestratorRunning = false;
    releaseOrchestratorLock();
    clearOrchestratorState();
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.jobblixor_global_stop) {
    if (changes.jobblixor_global_stop.newValue) {
      instanceActive = false;
      globalStopped = true;
      globalOrchestratorRunning = false;
      releaseOrchestratorLock();
      clearOrchestratorState();
    }
  }
});

// REPLACE the lock system variables and functions:
const SESSION_LOCK_KEY = 'jobblixor_session_lock';
const LOCK_TIMEOUT = 30000; // Increased to 30 seconds
let lockHeartbeat = null;

async function acquireOrchestratorLock() {
  if (!instanceActive) {
    console.log('[Lock] Instance not active, will not acquire lock');
    return false;
  }
  const sessionId = getSessionId();
  const now = Date.now();
  return new Promise((resolve) => {
    chrome.storage.local.get([SESSION_LOCK_KEY], (result) => {
      const currentLock = result[SESSION_LOCK_KEY];
      // More aggressive lock clearing with longer timeout
      if (currentLock && (now - currentLock.timestamp) > LOCK_TIMEOUT) {
        console.log('[Lock] Clearing expired lock (longer timeout)');
        chrome.storage.local.remove([SESSION_LOCK_KEY], () => {
          // Immediately acquire after clearing
          chrome.storage.local.set({
            [SESSION_LOCK_KEY]: {
              sessionId,
              timestamp: now,
              instanceId: INSTANCE_ID,
              tabId: window.tabId || 'unknown'
            }
          }, () => {
            console.log('[Lock] Acquired lock after clearing expired');
            // Start heartbeat to maintain lock
            if (lockHeartbeat) clearInterval(lockHeartbeat);
            lockHeartbeat = setInterval(renewLock, 5000);
            resolve(true);
          });
        });
        return;
      }
      // Only allow same session OR no lock exists
      if (!currentLock || currentLock.sessionId === sessionId || currentLock.instanceId === INSTANCE_ID) {
        chrome.storage.local.set({
          [SESSION_LOCK_KEY]: {
            sessionId,
            timestamp: now,
            instanceId: INSTANCE_ID,
            tabId: window.tabId || 'unknown'
          }
        }, () => {
          console.log('[Lock] Acquired orchestrator lock');
          // Start heartbeat to maintain lock
          if (lockHeartbeat) clearInterval(lockHeartbeat);
          lockHeartbeat = setInterval(renewLock, 5000);
          resolve(true);
        });
      } else {
        console.log('[Lock] Lock held by another session/instance', currentLock);
        resolve(false);
      }
    });
  });
}

function renewLock() {
  const sessionId = getSessionId();
  chrome.storage.local.set({
    [SESSION_LOCK_KEY]: {
      sessionId,
      timestamp: Date.now(),
      instanceId: INSTANCE_ID,
      tabId: window.tabId || 'unknown'
    }
  });
}

function releaseOrchestratorLock() {
  const sessionId = getSessionId();
  if (lockHeartbeat) {
    clearInterval(lockHeartbeat);
    lockHeartbeat = null;
  }
  chrome.storage.local.get([SESSION_LOCK_KEY], (result) => {
    const currentLock = result[SESSION_LOCK_KEY];
    if (currentLock && (currentLock.sessionId === sessionId || currentLock.instanceId === INSTANCE_ID)) {
      chrome.storage.local.remove([SESSION_LOCK_KEY], () => {
        console.log('[Lock] Released orchestrator lock');
      });
    }
  });
}

// ==========================================
// SINGLE ASYNC ORCHESTRATOR
// ==========================================

let orchestratorLoopPromise = null;

async function checkForRunningOrchestrator() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SESSION_LOCK_KEY], (result) => {
      const currentLock = result[SESSION_LOCK_KEY];
      if (currentLock && (Date.now() - currentLock.timestamp) < LOCK_TIMEOUT) {
        resolve({ isRunning: true, instanceId: currentLock.instanceId });
      } else {
        resolve({ isRunning: false });
      }
    });
  });
}

async function startSingleOrchestrator(userProfile, resumeFromState = null) {
  // [Orchestrator] Logging at start
  console.log('[Orchestrator] ===== START CALLED =====');
  console.log('[Orchestrator] userProfile:', userProfile);
  console.log('[Orchestrator] resumeFromState:', resumeFromState);

  if (!instanceActive) {
    console.log('[Orchestrator] Instance not active, aborting start');
    return { success: false, reason: 'instance_inactive' };
  }
  // Single instance check
  const runningCheck = await checkForRunningOrchestrator();
  if (runningCheck.isRunning && runningCheck.instanceId !== INSTANCE_ID) {
    console.log('[Orchestrator] Another orchestrator is actively running');
    return { success: false, reason: 'another_instance_active' };
  }
  console.log('[Orchestrator] Attempting to start...');
  if (globalOrchestratorRunning) {
    console.log('[Orchestrator] Already running, aborting');
    return { success: false, reason: 'already_running' };
  }
  const lockAcquired = await acquireOrchestratorLock();
  console.log('[Orchestrator] Lock acquired, state:', {
    globalOrchestratorRunning,
    globalStopped,
    resumeFromState: !!resumeFromState
  });
  if (!lockAcquired) {
    console.log('[Orchestrator] Could not acquire lock');
    return { success: false, reason: 'lock_not_acquired' };
  }
  globalOrchestratorRunning = true;
  globalStopped = false;

  // Register as orchestrator with background.js
  chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' }, (response) => {
    if (response && response.id) {
      chrome.runtime.sendMessage({ 
        type: 'REGISTER_ORCHESTRATOR', 
        tabId: response.id 
      });
      console.log('[Orchestrator] Registered with background.js, tab:', response.id);
    }
  });

  let orchestratorState = {
    isRunning: true,
    currentJobIndex: resumeFromState?.currentJobIndex || 0,
    targetJobs: userProfile.targetJobs,
    email: userProfile.email,
    jobTitle: userProfile.job_title,
    location: userProfile.location,
    startTime: Date.now(),
    userProfile: userProfile,
    successfulApplications: resumeFromState?.successfulApplications || 0,
    waitingForSearch: false // default
  };
  if (resumeFromState && typeof resumeFromState.waitingForSearch !== 'undefined') {
    orchestratorState.waitingForSearch = resumeFromState.waitingForSearch;
  }
  await saveOrchestratorState(orchestratorState);
  console.log('[Orchestrator] Starting with profile:', userProfile);
  try {
    if (!resumeFromState) {
      console.log('[Orchestrator] NEW SEARCH - will navigate');
      // CRITICAL: Save state BEFORE navigation (which kills the script)
      orchestratorState.waitingForSearch = true;
      await saveOrchestratorState(orchestratorState);
      await performJobSearch(userProfile);
      // Script dies here - everything below won't execute
      // await waitForNavigationComplete();
      return; // Explicitly return since navigation will kill the script
    } else {
      console.log('[Orchestrator] RESUMING - will NOT navigate, resumeFromState:', resumeFromState);
      console.log('[Orchestrator] Resuming - waiting for search results to load...');
    }
    // Always wait for search results (whether new search or resume)
    await waitForSearchResults();
    // Update state to show search is complete
    orchestratorState.waitingForSearch = false;
    await saveOrchestratorState(orchestratorState);
    // Persistent job loop with PHASE_1_DONE wait
    const allJobs = findAllJobCards();
    if (allJobs.length === 0) {
      console.log('[Orchestrator] No jobs found');
      // Enhanced logging for debugging
      const jobCardElements = document.querySelectorAll('[data-jk]');
      console.log(`[Orchestrator][Debug] jobCardElements.length: ${jobCardElements.length}`);
      if (jobCardElements.length === 0) {
        console.log('[Orchestrator][Debug] No [data-jk] elements found on the page.');
      } else {
        jobCardElements.forEach((el, idx) => {
          console.log(`[Orchestrator][Debug] JobCard[${idx}]:`, el.outerHTML);
        });
      }
      await clearOrchestratorState();
      return { success: false, reason: 'no_jobs' };
    }
    const targetJobs = parseInt(orchestratorState.userProfile.targetJobs) || 10;
    let successfulApplications = orchestratorState.successfulApplications || 0;
    let startIndex = orchestratorState.currentJobIndex || 0;
    for (let i = startIndex; i < allJobs.length && successfulApplications < targetJobs; i++) {
      if (globalStopped || !instanceActive) {
        console.log('[Orchestrator] Stopped by user or instance deactivated');
        break;
      }
      // CRITICAL: Check for page anomalies before processing each job
      const anomalyDetected = await detectAndHandlePageAnomalies();
      if (anomalyDetected) {
        console.log('[Orchestrator] Page anomaly detected and recovery attempted');
        // Wait for page to load after recovery
        await delay(5000);
        // Re-find jobs after recovery
        const recoveredJobs = findAllJobCards();
        if (recoveredJobs.length === 0) {
          console.log('[Orchestrator] No jobs found after recovery - ending session');
          break;
        }
        // Reset job list and continue from current index
        allJobs = recoveredJobs;
        if (i >= allJobs.length) {
          console.log('[Orchestrator] Job index out of range after recovery');
          break;
        }
      }
      const job = allJobs[i];
      console.log(`[Orchestrator] Processing job ${i + 1}: ${job.title}`);
      await clickJobCard(job);
      await delay(2000);
      const panelReady = await waitForJobDetailsPanel(job.title);
      if (!panelReady) {
        console.log(`[Orchestrator] Panel timeout for ${job.title} - skipping to next job`);
        continue;
      }
      const applyButton = await detectApplyButton();
      if (!applyButton.isEasyApply) {
        console.log(`[Orchestrator] Not Easy Apply: ${job.title} - skipping to next job (${applyButton.reason || ''})`);
        continue;
      }
      console.log(`[Orchestrator] Opening Easy Apply for ${job.title}`);
      orchestratorState.currentJobIndex = i;
      orchestratorState.successfulApplications = successfulApplications;
      await saveOrchestratorState(orchestratorState);
      const applicationResult = await openEasyApplyAndWait(job, orchestratorState.userProfile.email);
      if (applicationResult.success) {
        successfulApplications++;
        orchestratorState.successfulApplications = successfulApplications;
        orchestratorState.currentJobIndex = i + 1;
        await saveOrchestratorState(orchestratorState);
        console.log(`[Orchestrator] Application ${successfulApplications} completed`);
      } else {
        console.log(`[Orchestrator] Application failed: ${applicationResult.error} - skipping to next job`);
      }
      // REMOVED: await waitForApplicationCompletion(job.title); - this was causing double waiting
      await delay(1000); // Small delay before next job
    }
    console.log(`[Orchestrator] Completed! ${successfulApplications} applications`);
    await clearOrchestratorState();
    return { success: true, applications: successfulApplications };
  } catch (error) {
    console.error('[Orchestrator] Error:', error);
    await clearOrchestratorState();
    return { success: false, error: error.message };
  } finally {
    globalOrchestratorRunning = false;
    instanceActive = false;
    releaseOrchestratorLock();
    console.log('[Orchestrator] Cleanup completed');
  }
}

// ==========================================
// PERSISTENT ORCHESTRATOR STATE HELPERS
// ==========================================

const ORCHESTRATOR_STATE_KEY = 'orchestrator_state';

async function saveOrchestratorState(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [ORCHESTRATOR_STATE_KEY]: state }, resolve);
  });
}

async function loadOrchestratorState() {
  return new Promise((resolve) => {
    chrome.storage.local.get([ORCHESTRATOR_STATE_KEY], (result) => {
      resolve(result[ORCHESTRATOR_STATE_KEY] || null);
    });
  });
}

async function clearOrchestratorState() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([ORCHESTRATOR_STATE_KEY], resolve);
  });
}

// ==========================================
// EASY APPLY TAB HANDLING
// ==========================================

// ADD this new function before openEasyApplyAndWait:
async function extractApplyUrl(applyButton) {
  console.log('[EasyApply] Extracting apply URL from button...');
  // Method 1: Direct href
  let applyUrl = applyButton.href;
  if (applyUrl && applyUrl.includes('indeed.com')) {
    console.log('[EasyApply] Found URL via href:', applyUrl);
    return applyUrl;
  }
  // Method 2: Data attributes
  applyUrl = applyButton.getAttribute('data-href') ||
             applyButton.getAttribute('data-url') ||
             applyButton.getAttribute('data-jk') && 
             `https://www.indeed.com/applystart?jk=${applyButton.getAttribute('data-jk')}`;
  if (applyUrl) {
    console.log('[EasyApply] Found URL via data attributes:', applyUrl);
    return applyUrl;
  }
  // Method 3: Check parent elements
  const parent = applyButton.closest('a, [data-href], [data-jk]');
  if (parent) {
    applyUrl = parent.href || 
               parent.getAttribute('data-href') ||
               (parent.getAttribute('data-jk') && 
                `https://www.indeed.com/applystart?jk=${parent.getAttribute('data-jk')}`);
    if (applyUrl) {
      console.log('[EasyApply] Found URL via parent element:', applyUrl);
      return applyUrl;
    }
  }
  // Method 4: Build URL from page job ID
  const jobId = document.querySelector('[data-jk]')?.getAttribute('data-jk') ||
                window.location.href.match(/jk=([^&]+)/)?.[1];
  if (jobId) {
    applyUrl = `https://www.indeed.com/applystart?jk=${jobId}`;
    console.log('[EasyApply] Built URL from job ID:', applyUrl);
    return applyUrl;
  }
  console.error('[EasyApply] Could not extract apply URL');
  return null;
}

// MODIFY openEasyApplyAndWait to use the new extraction function:
async function openEasyApplyAndWait(job, email) {
  const now = Date.now();
  // Prevent multiple clicks on same job within 5 seconds
  if (now - lastClickTime < CLICK_DEBOUNCE_TIME) {
    console.log('[EasyApply] Click debounced - too recent');
    return { success: false, error: 'Click debounced' };
  }
  lastClickTime = now;

  // Check if Easy Apply tab already exists for this job
  const existingTabCheck = await new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: "CHECK_EASY_APPLY_TAB_EXISTS",
      jobId: job.jobId
    }, resolve);
  });
  if (existingTabCheck && existingTabCheck.tabExists) {
    console.log('[EasyApply] Easy Apply tab already exists for this job');
    return { success: false, error: 'Tab already exists' };
  }

  console.log(`[EasyApply] Attempting to click Easy Apply for ${job.title}`);
  try {
    const applyButtonResult = await detectApplyButton();
    if (!applyButtonResult.isEasyApply) {
      return { success: false, error: applyButtonResult.reason || 'Not an Easy Apply job' };
    }
    const applyButton = applyButtonResult.button;
    // Click the button directly (let Indeed handle modal/tab)
    applyButton.click();
    console.log('[EasyApply] Clicked Easy Apply button, waiting for completion signal...');

    // Wait for APPLICATION_COMPLETED message from background
    await waitForApplicationCompletion(job.title);

    return { success: true };
  } catch (error) {
    console.error(`[EasyApply] Error for ${job.title}:`, error);
    return { success: false, error: error.message };
  }
}

// Helper: Wait for Easy Apply modal or new tab to appear
async function waitForEasyApplyInterface(timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // Modal detection (common Indeed selectors)
    if (document.querySelector('.ia-IndeedApplyModal, .indeed-apply-modal, .jobsearch-IndeedApplyButton-modal, [data-testid*="indeed-apply-modal"], iframe[src*="smartapply.indeed.com"]')) {
      return true;
    }
    // If the page navigates to smartapply.indeed.com or an application page
    if (window.location.href.includes('smartapply.indeed.com') || window.location.href.includes('applystart') || window.location.href.includes('application')) {
      return true;
    }
    await delay(300);
  }
  return false;
}

// SIMPLIFIED: Just wait 60 seconds instead of complex message handling
async function waitForApplicationCompletion(jobTitle) {
  return new Promise((resolve) => {
    const handler = (message) => {
      if (message.type === 'JOB_DONE') {
        chrome.runtime.onMessage.removeListener(handler);
        console.log(`[Orchestrator] Job completed instantly: ${jobTitle}`);
        resolve();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    // Timeout fallback
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      resolve();
    }, 120000);
  });
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// REPLACE performJobSearch with URL navigation
async function performJobSearch(userProfile) {
  console.log('[Search] Performing job search via URL navigation...');

  let jobQuery = userProfile.job_title || 'software engineer';
  
  // Add salary to search query if available
  if (userProfile.preferred_salary) {
    // Remove only dollar sign, keep commas
    const cleanSalary = userProfile.preferred_salary.replace(/\$/g, '');
    // Add it directly to the query
    jobQuery += ` $${cleanSalary}`;
    console.log(`[Search] Added salary to search query: "${jobQuery}"`);
  }

  const encodedJobQuery = encodeURIComponent(jobQuery);
  const locationQuery = encodeURIComponent(userProfile.location || 'New York, NY');
  const searchUrl = `https://www.indeed.com/jobs?q=${encodedJobQuery}&l=${locationQuery}&from=searchOnHP`;

  console.log('[Search] Navigating to:', searchUrl);
  window.location.href = searchUrl;
  await delay(5000);
}

// Helper to detect when navigation is complete
async function waitForNavigationComplete() {
  console.log('[Search] Waiting for navigation to complete...');

  // Wait for DOM to be ready
  if (document.readyState !== 'complete') {
    await new Promise((resolve) => {
      window.addEventListener('load', resolve, { once: true });
    });
  }

  // Additional wait for dynamic content
  await delay(2000);
  console.log('[Search] Navigation complete');
}

async function waitForSearchResults() {
  console.log('[Search] Waiting for results...');
  
  for (let i = 0; i < 30; i++) {
    const jobCards = document.querySelectorAll('[data-jk]');
    if (jobCards.length > 0) {
      console.log(`[Search] Found ${jobCards.length} job cards`);
      return true;
    }
    await delay(500);
  }
  
  throw new Error('Search results not loaded');
}

function findAllJobCards() {
  const jobCards = document.querySelectorAll('[data-jk]');
  const jobs = [];
  
  jobCards.forEach((card, index) => {
    const titleElement = card.querySelector('h2 span[title], h2 a');
    const title = titleElement ? titleElement.textContent.trim() : `Job ${index + 1}`;
    const jobId = card.getAttribute('data-jk') || `job_${index}_${Date.now()}`;
    
    jobs.push({
      element: card,
      title: title,
      jobId: jobId,
      index: index
    });
  });
  
  return jobs;
}

async function clickJobCard(job) {
  console.log(`[Click] Clicking job card: ${job.title}`);
  
  job.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await delay(500);
  
  const titleLink = job.element.querySelector('h2 a');
  if (titleLink) {
    titleLink.click();
  } else {
    job.element.click();
  }
}

async function waitForJobDetailsPanel(jobTitle) {
  console.log(`[Panel] Waiting for job details panel: ${jobTitle}`);
  
  for (let i = 0; i < 20; i++) {
    const panel = document.querySelector('.jobsearch-ViewjobPaneWrapper, .jobsearch-JobComponent');
    const applyButton = document.querySelector('.jobsearch-IndeedApplyButton');
    
    if (panel && applyButton) {
      console.log(`[Panel] Panel ready for ${jobTitle}`);
      return true;
    }
    
    await delay(300);
  }
  
  return false;
}

// COMPLETELY REPLACE the detectApplyButton function with:
async function detectApplyButton() {
  console.log('[EasyApply] Starting apply button detection...');
  // Wait for page to fully load
  await delay(2000);
  // Updated selectors for 2025 Indeed layout
  const currentSelectors = [
    // Most common current selectors
    'button[data-jk*="apply"]',
    'button[aria-label*="Apply"]',
    'button[data-testid*="apply"]',
    '.ia-BaseCTAButton',
    '.indeed-apply-button-label',
    // Fallback selectors
    '.jobsearch-IndeedApplyButton button',
    'button[data-indeed-apply-jobid]',
    'a[data-indeed-apply-jobid]',
    // Generic fallbacks
    'button[class*="apply"]',
    'a[class*="apply"]'
  ];
  let foundButton = null;
  for (const selector of currentSelectors) {
    try {
      if (selector.includes(':contains')) {
        // Manual contains logic for text-based selectors
        const tag = selector.split(':')[0];
        const text = selector.match(/\"(.+?)\"/)[1].toLowerCase();
        const buttons = Array.from(document.querySelectorAll(tag)).filter(b => 
          (b.textContent || '').toLowerCase().includes(text)
        );
        if (buttons.length > 0) {
          foundButton = buttons[0];
          console.log(`[EasyApply] Found button with text selector: ${selector}`);
          break;
        }
      } else {
        const buttons = document.querySelectorAll(selector);
        if (buttons.length > 0) {
          foundButton = buttons[0];
          console.log(`[EasyApply] Found button with selector: ${selector}`);
          break;
        }
      }
    } catch (error) {
      console.log(`[EasyApply] Selector failed: ${selector}`, error);
    }
  }
  if (!foundButton) {
    console.log('[EasyApply] No apply button found with any selector');
    return { isEasyApply: false, reason: 'No apply button found' };
  }
  // Enhanced button validation
  const buttonText = foundButton.textContent.toLowerCase().trim();
  const buttonAriaLabel = foundButton.getAttribute('aria-label')?.toLowerCase() || '';
  const allText = buttonText + ' ' + buttonAriaLabel;
  console.log(`[EasyApply] Button text analysis: "${allText}"`);
  // More accurate Easy Apply detection
  const isEasyApply = (
    allText.includes('easy apply') ||
    allText.includes('apply now') ||
    (allText.includes('apply') && !allText.includes('company site') && !allText.includes('external') )
  );
  if (!isEasyApply) {
    console.log(`[EasyApply] Not Easy Apply: "${allText}"`);
    return { isEasyApply: false, reason: 'Not an Easy Apply job', buttonText: allText };
  }
  console.log(`[EasyApply] Confirmed Easy Apply button: "${allText}"`);
  return {
    isEasyApply: true,
    button: foundButton,
    buttonText: allText
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// MESSAGE HANDLERS
// ==========================================

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('[Message] Received:', message.type);
  
  if (message.type === "START_AUTO_APPLY") {
    // [Message] Logging for START_AUTO_APPLY
    console.log('[Message] ⚡️ START_AUTO_APPLY received');
    console.log('[Message] Current URL:', window.location.href);
    console.log('[Message] Job Title:', message.jobTitle);
    console.log('[Message] Location:', message.location);
    
    // Fetch full profile from Firebase first
    const fullProfile = await fetchUserProfile(message.email);
    
    const userProfile = {
      job_title: message.jobTitle || fullProfile.job_title || "software engineer",
      location: message.location || fullProfile.location || "New York, NY",
      targetJobs: message.jobCount || 10,
      email: message.email,
      preferred_salary: fullProfile.preferred_salary // ADD THIS LINE
    };
    const result = await startSingleOrchestrator(userProfile);
    sendResponse(result);
    return true;
  }
  if (message.type === "STOP_AUTO_APPLY") {
    console.log('[Stop] Stopping orchestrator');
    globalStopped = true;
    globalOrchestratorRunning = false;
    instanceActive = false;
    setGlobalStopFlag();
    if (orchestratorLoopPromise) {
      orchestratorLoopPromise = null;
    }
    releaseOrchestratorLock();
    await clearOrchestratorState();
    sendResponse({ success: true });
    return true;
  }
  if (message.type === "PING") {
    sendResponse({ success: true, message: "Content script loaded" });
    return true;
  }
  // Add your Phase 1 message handler here:
  if (message.type === "RUN_PHASE1_AUTOFILL") {
    await startJobblixorBot(message.email);
    sendResponse({ success: true });
    return true;
  }
  if (message.type === "RESUME_ORCHESTRATOR") {
    /*
    const state = message.orchestratorState;
    console.log('[Orchestrator] RESUME_ORCHESTRATOR message received:', state);
    
    // CRITICAL: Force complete reset before attempting to resume
    globalOrchestratorRunning = false;
    globalStopped = false;
    
    // Clear any existing orchestrator promise
    if (orchestratorLoopPromise) {
      orchestratorLoopPromise = null;
    }
    
    console.log('[Orchestrator] State forcibly reset, resuming...');
    
    orchestratorLoopPromise = startSingleOrchestrator(state.userProfile, state);
    orchestratorLoopPromise.then(() => {
      globalOrchestratorRunning = false;
    });
    sendResponse({ success: true, resumed: true });
    return true;
    */
  }
  if (message.type === "PHASE_1_DONE") {
    console.log("[PHASE_1_DONE] RECEIVED BY ORCHESTRATOR!");
    console.log("[Orchestrator] Current state check:", {
      globalOrchestratorRunning,
      instanceActive,
      globalStopped
    });
    
    const state = await loadOrchestratorState();
    if (state && state.isRunning) {
      console.log("[Orchestrator] Updating job index after PHASE_1_DONE");
      state.currentJobIndex = (state.currentJobIndex || 0) + 1;
      await saveOrchestratorState(state);
    } else {
      console.log("[Orchestrator] WARNING: No active orchestrator state found for PHASE_1_DONE");
    }
    sendResponse({ success: true });
    return true;
  }
  // --- Jobblixor bot message types ---
  if (message.type === "JOBBLIXOR_START_APPLY" && message.email) {
    targetJobCount = message.jobCount || 1;
    currentJobCount = 0;
    processedPages.clear();
    startContinuousMonitoring(message.email);
    isRunning = true;
    isPaused = false;
    processedPages.add(window.location.href);
    await startJobblixorBot(message.email);
    isRunning = false;
    sendResponse({ success: true });
    console.log("[Jobblixor DEBUG] Bot started and continuous monitoring enabled.");
    return true;
  }
  if (message.type === "JOBBLIXOR_PAUSE") {
    isPaused = true;
    logProgress(autoStartEmail, "Bot paused by user");
    sendResponse({ success: true });
    return true;
  }
  if (message.type === "JOBBLIXOR_RESUME") {
    isPaused = false;
    logProgress(autoStartEmail, "Bot resumed by user");
    sendResponse({ success: true });
    return true;
  }
  if (message.type === "JOBBLIXOR_STOP") {
    isPaused = false;
    stopContinuousMonitoring();
    logProgress(autoStartEmail, "Bot stopped by user");
    sendResponse({ success: true });
    return true;
  }
  // --- End Jobblixor bot message types ---

  // If message type is not recognized, do NOT warn (to avoid duplicate handler confusion)
  sendResponse({ success: false, error: "Unknown message type" });
  return true;
});

// ==========================================
// CLEANUP ON UNLOAD
// ==========================================

window.addEventListener('beforeunload', () => {
  console.log('[Cleanup] Page unloading, releasing lock');
  instanceActive = false;
  globalStopped = true;
  globalOrchestratorRunning = false;
  if (typeof orchestratorLoopPromise !== 'undefined') {
    orchestratorLoopPromise = null;
  }
  releaseOrchestratorLock();
});

// Add STATE_KEY if missing
const STATE_KEY = 'jobblixor_automation_state';

console.log('[ContentScript] Single Orchestrator System Loaded');

// ====================
// JOBBLIXOR BOT CONTENT SCRIPT (FIXED DOUBLE-RUN ISSUES + NO DOUBLE DECREMENTS)
// ====================

console.log("[Jobblixor DEBUG] content.js loaded on page:", window.location.href);


// Start continuous monitoring when email is set
function startContinuousMonitoring(email) {
  autoStartEmail = email;
  console.log("[Jobblixor DEBUG] Starting continuous monitoring with email:", email);
  
  // Clear any existing interval
  if (pageCheckInterval) {
    clearInterval(pageCheckInterval);
  }
  
  // Check every 3 seconds for new pages (increased from 2 seconds)
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
  processedPages.clear(); // Clear processed pages
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

  // ENHANCED: Log current URL for debugging
  console.log("[Jobblixor DEBUG] Monitoring URL:", currentUrl);
  console.log("[Jobblixor DEBUG] Processed pages:", Array.from(processedPages));

  // Check if we've already processed this exact URL
  if (processedPages.has(currentUrl)) {
    console.log("[Jobblixor DEBUG] Page already processed, skipping:", currentUrl);
    return;
  }

  // Check if we've reached our target job count
  if (currentJobCount >= targetJobCount) {
    logProgress(autoStartEmail, `Target of ${targetJobCount} applications reached!`);
    stopContinuousMonitoring();
    return;
  }
  
  // ENHANCED: Force detection of Indeed application pages
  console.log("[Jobblixor DEBUG] Checking if URL is application page:", currentUrl);
  const isAppPage = isIndeedApplicationPage(currentUrl);
  console.log("[Jobblixor DEBUG] Is application page:", isAppPage);
  
  // Check if we're on an Indeed application page
  if (isAppPage) {
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
  } else {
    console.log("[Jobblixor DEBUG] Not an application page, continuing to monitor");
  }
}

// Detect if current page is part of Indeed application flow
function isIndeedApplicationPage(url) {
  const applicationPatterns = [
    'form/questions-module',
    'form/demographic-questions',
    'form/resume-selection-module',
    'form/contact-module',
    'form/contact-info-module',
    'form/profile-location',        // No slashes - just the key part
    'beta/indeedapply/form',        // Broader catch-all
    '/apply',
    '/job-application',
    '/application/',
    '/questions/',
    '/demographic/',
    '/resume-selection',
    '/contact-information'
  ];
  
  // More flexible matching - check if URL contains any pattern
  const matchedPatterns = applicationPatterns.filter(pattern => url.includes(pattern));
  const isApplicationPage = matchedPatterns.length > 0;

  console.log("[Jobblixor DEBUG] URL pattern check:", url);
  console.log("[Jobblixor DEBUG] Matched patterns:", matchedPatterns);
  
  // Additional checks for application pages (fixed selectors)
  const hasApplicationElements = 
    document.querySelector('button[type="submit"]') ||
    document.querySelector('input[type="submit"]') ||
    document.querySelector('button') || // Any button on the page
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

// ---- Main Entry Point ----

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

    logProgress(email, "Starting Jobblixor auto-apply bot...");

    // Step 1: Handle screening questions
    const screeningAnswered = handleScreeningQuestions(profile);
    if (screeningAnswered > 0) {
      logProgress(email, `Answered ${screeningAnswered} screening questions`);
    }

    // --- ANTI-DETECTION: Add random delay after screening questions ---
    await randomDelay(1000, 3000);

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

    // --- ANTI-DETECTION: Add random delay after field filling ---
    await randomDelay(800, 2000);

    // Step 4: check any required checkboxes
    fillAllCheckboxes();

    // Step 5: upload resume if available (now handles Continue clicking internally)
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

    // Step 6.5: Handle any error popups and force continue
    const popupHandled = handleErrorPopups();
    if (popupHandled) {
      logProgress(email, "Dismissed error popup, forcing automation to continue...");
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Step 7: ENHANCED continue button with validation
    if (!resumeHandledContinue) {
      console.log("[Jobblixor DEBUG] Waiting for form validation and data persistence...");
      await randomDelay(2000, 4000);

      // ENHANCED: Validate form completion before continuing
      const validationResult = await validateFormCompleteness(profile);

      if (!validationResult.isComplete) {
        console.log("[Jobblixor DEBUG] Form not complete, attempting to fill missing fields...");
        // Try to fill missing required fields
        await attemptToFillMissingFields(validationResult.missingFields, profile);
        // Wait a bit more for dynamic updates
        await randomDelay(1000, 2000);
      }

      const nextBtn = Array.from(document.querySelectorAll('button, input[type="submit"]'))
        .find(b => /next|continue|submit|review.*application|apply|proceed/i.test(b.innerText || b.value));
      if (nextBtn) {
        // Final validation before clicking
        const finalCheck = await validateFormCompleteness(profile);
        if (nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true') {
          console.log("[Jobblixor DEBUG] Continue button is disabled - form likely incomplete");
          logProgress(email, "Continue button disabled - checking for missing required fields...");
          // Try one more time to fill critical fields
          await fillCriticalRequiredFields(profile);
          await randomDelay(500, 1000);
        }
        if (!nextBtn.disabled && nextBtn.getAttribute('aria-disabled') !== 'true') {
          await randomDelay(300, 800);
          await simulateHumanBehavior(nextBtn);
          logProgress(email, `Clicked Continue button (${finalCheck.filledCount} fields filled)`);
        } else {
          logProgress(email, "Continue button still disabled - may require manual intervention");
        }
      } else {
        console.log("[Jobblixor DEBUG] No Continue button found.");
      }
    }

    logProgress(email, "Step complete! Bot waiting for next page...");
    
    // FIXED: Check if we've reached the final submission page - SINGLE MESSAGE ONLY
    if (window.location.href.includes('application-submitted') || 
        window.location.href.includes('thank-you') || 
        window.location.href.includes('confirmation') ||
        window.location.href.includes('success') ||
        window.location.href.includes('post-apply') || // <-- Added for Indeed's new final page
        document.querySelector('.application-complete') ||
        document.querySelector('[data-testid="application-complete"]') ||
        document.querySelector('[data-testid*="success"]') ||
        document.querySelector('[data-testid*="submitted"]') ||
        Array.from(document.querySelectorAll('h1, h2')).find(h => 
          /application.*submitted|thank.*you|success|complete/i.test(h.textContent || '')
        )) {
      // ADD THESE TWO LINES:
      console.log('[Jobblixor DEBUG] ðŸ"¥ DETECTED COMPLETION PAGE:', window.location.href);
      console.log('[Jobblixor DEBUG] Page elements check:', {
        hasApplicationComplete: !!document.querySelector('.application-complete'),
        hasTestId: !!document.querySelector('[data-testid="application-complete"]'),
        hasH1H2: !!Array.from(document.querySelectorAll('h1, h2')).find(h => 
          /application.*submitted|thank.*you|success|complete/i.test(h.textContent || '')
        )
      });
      // CRITICAL: Prevent duplicate submissions with URL tracking
      // OLD: const completionKey = `completion_${window.location.href}_${email}`;
      // OLD: const baseUrl = window.location.pathname;
      // OLD: const completionKey = `completion_${baseUrl}_${email}`;
      // NEW: Use jobId from URL or timestamp fallback for uniqueness
      const jobId = new URLSearchParams(window.location.search).get('jk') || Date.now();
      const completionKey = `completion_${jobId}_${email}`;
      const alreadyProcessed = localStorage.getItem(completionKey);
      // ADD THIS LINE:
      console.log('[Jobblixor DEBUG] Already processed?', alreadyProcessed);
      if (!alreadyProcessed) {
        // ADD THIS LINE:
        console.log('[Jobblixor DEBUG] ðŸ"¤ ABOUT TO SEND APPLICATION_COMPLETED MESSAGE');
        // Write to localStorage for legacy tracking
        localStorage.setItem(completionKey, Date.now().toString());
        currentJobCount++;
        logProgress(email, `APPLICATION ${currentJobCount} SUBMITTED SUCCESSFULLY!`);

        // Write completion to shared storage for orchestrator to detect
        chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' }, async (tabIdResponse) => {
          const completionData = {
            completed: true,
            email: email,
            jobId: window.location.href, // Use URL as job identifier
            timestamp: Date.now(),
            tabId: tabIdResponse?.id
          };
          // Write to chrome.storage for orchestrator to poll
          chrome.storage.local.set({ 
            last_application_completion: completionData 
          }, () => {
            console.log("[Jobblixor DEBUG] Wrote completion to storage:", completionData);
            // Tell background to close this tab immediately
            chrome.runtime.sendMessage({
              type: "APPLICATION_COMPLETED",
              email: email,
              completionKey: completionKey,
              tabId: tabIdResponse?.id,
              closeTabNow: true
            });
            console.log("[Jobblixor DEBUG] Requested background to close tab:", tabIdResponse?.id);
          });
        });
      } else {
        console.log("[Jobblixor DEBUG] Application already processed, skipping duplicate");
      }
      if (currentJobCount >= targetJobCount) {
        logProgress(email, `Target of ${targetJobCount} applications reached!`);
        chrome.runtime.sendMessage({
          type: "APPLICATION_FLOW_COMPLETE",
          email: email
        });
        stopContinuousMonitoring();
      } else {
        logProgress(email, `Progress: ${currentJobCount}/${targetJobCount} applications completed`);
      }
      console.log("[Jobblixor DEBUG] Application completed!");
    } else {
      logProgress(email, "Waiting for page navigation to continue automatically...");
      console.log("[Jobblixor DEBUG] Current URL:", window.location.href);
      console.log("[Jobblixor DEBUG] Continuous monitoring will handle next page automatically");
    }
  } catch (err) {
    logProgress(email, `Error: ${err}`);
    console.error("[Jobblixor DEBUG] ERROR in main automation:", err);
  }
}

// --- ENHANCED VALIDATION HELPERS ---

// Validate if form is ready for submission
async function validateFormCompleteness(profile) {
  const requiredFields = findRequiredFields();
  const missingFields = [];
  let filledCount = 0;

  console.log(`[Jobblixor DEBUG] Validating ${requiredFields.length} required fields...`);

  for (const field of requiredFields) {
    if (isFieldEmpty(field)) {
      missingFields.push(field);
      console.log(`[Jobblixor DEBUG] Missing required field: ${getFieldDescription(field)}`);
    } else {
      filledCount++;
    }
  }

  const isComplete = missingFields.length === 0;
  console.log(`[Jobblixor DEBUG] Form validation: ${filledCount}/${requiredFields.length} filled, complete: ${isComplete}`);

  return {
    isComplete,
    missingFields,
    filledCount,
    totalRequired: requiredFields.length
  };
}

// Find all required fields on the page
function findRequiredFields() {
  const requiredSelectors = [
    'input[required]',
    'select[required]', 
    'textarea[required]',
    'input[aria-required="true"]',
    'select[aria-required="true"]',
    'textarea[aria-required="true"]',
    // Indeed-specific required field patterns
    'input[data-testid*="required"]',
    'select[data-testid*="required"]'
  ];

  const fields = [];

  requiredSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(field => {
      if (field.offsetParent !== null && !field.disabled) { // Must be visible and enabled
        fields.push(field);
      }
    });
  });

  // Also find fields that appear required based on labels
  document.querySelectorAll('input, select, textarea').forEach(field => {
    if (field.offsetParent !== null && !field.disabled) {
      const label = field.labels?.[0] || document.querySelector(`label[for="${field.id}"]`);
      const labelText = label?.textContent || '';
      if (labelText.includes('*') || labelText.toLowerCase().includes('required')) {
        if (!fields.includes(field)) {
          fields.push(field);
        }
      }
    }
  });

  return fields;
}

// Check if a field is empty
function isFieldEmpty(field) {
  if (field.type === 'radio') {
    const name = field.name;
    const radioGroup = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
    return !Array.from(radioGroup).some(radio => radio.checked);
  }
  if (field.type === 'checkbox') {
    return !field.checked;
  }
  if (field.tagName === 'SELECT') {
    return !field.value || field.value === '' || field.selectedIndex === 0;
  }
  return !field.value || field.value.trim() === '';
}

// Attempt to fill missing fields
async function attemptToFillMissingFields(missingFields, profile) {
  console.log(`[Jobblixor DEBUG] Attempting to fill ${missingFields.length} missing fields...`);
  for (const field of missingFields) {
    await fillSpecificField(field, profile);
    await randomDelay(200, 500); // Small delay between fields
  }
}

// Fill critical required fields as last resort
async function fillCriticalRequiredFields(profile) {
  console.log("[Jobblixor DEBUG] Final attempt to fill critical required fields...");
  // Focus on the most critical fields that often block submission
  const criticalFields = [
    { selectors: ['input[type="tel"]', 'input[name*="phone"]'], value: profile.phone_number },
    { selectors: ['input[type="email"]', 'input[name*="email"]'], value: profile.email },
    { selectors: ['input[name*="first"]', 'input[id*="first"]'], value: profile.first_name },
    { selectors: ['input[name*="last"]', 'input[id*="last"]'], value: profile.last_name }
  ];
  for (const fieldGroup of criticalFields) {
    for (const selector of fieldGroup.selectors) {
      const fields = document.querySelectorAll(selector);
      for (const field of fields) {
        if (field.offsetParent !== null && (!field.value || field.value.trim() === '')) {
          console.log(`[Jobblixor DEBUG] Critical fill: ${selector} with "${fieldGroup.value}"`);
          setNativeValue(field, fieldGroup.value);
          await randomDelay(100, 300);
        }
      }
    }
  }
}

// Fill a specific field based on its type and context
async function fillSpecificField(field, profile) {
  // Try to fill based on name, id, label, and type
  const fieldName = field.name?.toLowerCase() || field.id?.toLowerCase() || '';
  if (field.type === 'email' && profile.email) {
    setNativeValue(field, profile.email);
    return;
  }
  if (field.type === 'tel' && profile.phone_number) {
    setNativeValue(field, profile.phone_number);
    return;
  }
  if (fieldName.includes('first') && profile.first_name) {
    setNativeValue(field, profile.first_name);
    return;
  }
  if (fieldName.includes('last') && profile.last_name) {
    setNativeValue(field, profile.last_name);
    return;
  }
  if (fieldName.includes('zip') && profile.zip_code) {
    setNativeValue(field, profile.zip_code);
    return;
  }
  if (fieldName.includes('address') && profile.street_address) {
    setNativeValue(field, profile.street_address);
    return;
  }
  if (fieldName.includes('city') && profile.location) {
    setNativeValue(field, profile.location);
    return;
  }
  if (fieldName.includes('ethnicity') && profile.ethnicity) {
    setNativeValue(field, profile.ethnicity);
    return;
  }
  if (fieldName.includes('gender') && profile.gender) {
    setNativeValue(field, profile.gender);
    return;
  }
  if (fieldName.includes('veteran') && profile.veteran_status) {
    setNativeValue(field, profile.veteran_status);
    return;
  }
  // Fallback: try to fill with any profile value that matches
  for (const key in profile) {
    if (typeof profile[key] === 'string' && profile[key] && fieldName.includes(key)) {
      setNativeValue(field, profile[key]);
      return;
    }
  }
}

// Get a human-readable description of a field
function getFieldDescription(field) {
  if (field.labels && field.labels.length > 0) {
    return field.labels[0].textContent.trim();
  }
  if (field.id) {
    return `#${field.id}`;
  }
  if (field.name) {
    return `name='${field.name}'`;
  }
  if (field.placeholder) {
    return `placeholder='${field.placeholder}'`;
  }
  return field.outerHTML.slice(0, 60) + '...';
}

// FIXED fetchUserProfile with better fallbacks
function fetchUserProfile(email) {
  console.log("[Jobblixor DEBUG] fetchUserProfile called with:", email);
  return new Promise((resolve) => {
    // Define comprehensive fallback profile
    const fallbackProfile = {
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
      preferred_salary: "$50,000",
      job_title: "software engineer"
    };

    // Trigger Firebase fetch
    chrome.runtime.sendMessage({ type: "FETCH_USER_DOC", email }, async (response) => {
      console.log("[Jobblixor DEBUG] FETCH_USER_DOC response:", response);
      
      if (response?.success) {
        // Read from chrome.storage.local (background.js stores it there)
        try {
          const result = await chrome.storage.local.get([`user_profile_${email}`]);
          const userData = result[`user_profile_${email}`];
          
          if (userData) {
            console.log("[Jobblixor DEBUG] Retrieved from storage:", userData);
            console.log("[Jobblixor DEBUG] Salary:", userData?.preferred_salary);
            // Merge real data with fallback (fallback provides defaults)
            const profile = { ...fallbackProfile, ...userData };
            resolve(profile);
          } else {
            console.warn("[Jobblixor DEBUG] No data in chrome.storage - using fallback");
            resolve(fallbackProfile);
          }
        } catch (storageError) {
          console.error("[Jobblixor DEBUG] Storage read error:", storageError);
          resolve(fallbackProfile);
        }
      } else {
        console.warn("[Jobblixor DEBUG] Fetch failed, using fallback");
        resolve(fallbackProfile);
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
                console.log(`[Jobblixor DEBUG] Checked availability option: ${checkbox.value || checkbox.id}`);
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
  
  // Check if resume is already uploaded/selected (like in your case)
  const resumeUploaded = document.querySelector('[data-testid="resume-preview"]') ||
                        document.querySelector('.resume-preview') ||
                        document.querySelector('[data-testid*="resume"]') ||
                        document.querySelector('iframe') ||
                        Array.from(document.querySelectorAll('div')).find(div => 
                          div.textContent && div.textContent.includes('resume') && div.textContent.includes('.pdf')
                        );
  
  if (resumeUploaded) {
    console.log("[Jobblixor DEBUG] Resume already uploaded, proceeding to Continue");
    return true; // Resume is ready, just need to click Continue
  }
  
  // Look for "Upload a resume" option (we want to upload our own resume)
  const uploadButtons = Array.from(document.querySelectorAll('button, div, label'))
    .filter(el => /upload.*resume|upload a resume/i.test(el.textContent || ''));
  
  if (uploadButtons.length > 0) {
    const uploadBtn = uploadButtons[0];
    uploadBtn.click();
    console.log("[Jobblixor DEBUG] Selected 'Upload a resume' option");
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
        console.log("[Jobblixor DEBUG] Selected upload resume radio option");
        return true;
      }
    }
  }
  
  console.log("[Jobblixor DEBUG] Resume appears to be ready, no action needed");
  return true; // If we can't find upload options, assume resume is ready
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
        console.log(`[Jobblixor DEBUG] Selected gender: ${radioText}`);
        break;
      }
    }
  }
  
  // Handle Ethnicity Dropdown
  const ethnicitySelects = document.querySelectorAll('select');
  const ethnicityValue = profile.ethnicity || 'prefer not to answer';
  console.log(`[Jobblixor DEBUG] Looking for ethnicity option: "${ethnicityValue}"`);
  
  for (const select of ethnicitySelects) {
    // Check if this select is for ethnicity (look at nearby labels)
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
          console.log(`[Jobblixor DEBUG] Selected ethnicity: ${option.textContent}`);
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
    
    // Check if this radio is related to veteran status by looking at the container
    const container = radio.closest('div, fieldset');
    const containerText = container ? container.textContent.toLowerCase() : '';
    
    if (containerText.includes('veteran status') || containerText.includes('veteran')) {
      console.log(`[Jobblixor DEBUG] Found veteran radio: "${radioText}"`);
      
      // Match the veteran status more precisely
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
          console.log(`[Jobblixor DEBUG] Selected veteran status: ${radioText}`);
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
    
    // Check if this radio is related to hispanic/latino
    const container = radio.closest('div');
    const containerText = container ? container.textContent.toLowerCase() : '';
    
    if (containerText.includes('hispanic') || containerText.includes('latino')) {
      if ((hispanicValue === 'yes' && radioText === 'yes') ||
          (hispanicValue === 'no' && radioText === 'no')) {
        if (!radio.checked) {
          radio.checked = true;
          radio.click();
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`[Jobblixor DEBUG] Selected hispanic/latino: ${radioText}`);
          break;
        }
      }
    }
  }
  
  // Handle Terms and Conditions Radio Button (NOT checkbox - it's a radio!)
  console.log("[Jobblixor DEBUG] Looking for terms and conditions radio button...");
  
  for (const radio of allRadios) {
    if (!radio.checked) {
      // Check the container text to see if it's terms-related
      const container = radio.closest('div, fieldset') || radio.parentElement;
      const containerText = container ? container.textContent.toLowerCase() : '';
      
      if (containerText.includes('employment of applicants') || 
          containerText.includes('terms and conditions') ||
          containerText.includes('drug test') ||
          containerText.includes('lie detector')) {
        
        console.log(`[Jobblixor DEBUG] Found terms radio button: "${containerText.substring(0, 100)}..."`);
        radio.checked = true;
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`[Jobblixor DEBUG] Selected terms and conditions radio`);
        break;
      }
    }
  }
  
  // ALSO handle any remaining checkboxes for "Share these answers"
  console.log("[Jobblixor DEBUG] Looking for 'Share these answers' checkbox...");
  const shareCheckboxes = document.querySelectorAll('input[type="checkbox"]');
  
  for (const checkbox of shareCheckboxes) {
    if (!checkbox.checked) {
      const container = checkbox.closest('div') || checkbox.parentElement;
      const containerText = container ? container.textContent.toLowerCase() : '';
      
      if (containerText.includes('share these answers') || 
          containerText.includes('consent to sharing')) {
        
        console.log(`[Jobblixor DEBUG] Found share answers checkbox`);
        checkbox.checked = true;
        checkbox.click();
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`[Jobblixor DEBUG] Checked share answers checkbox`);
        break;
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
          console.log(`[Jobblixor DEBUG] Checked availability: ${labelText}`);
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

    console.log(`[Jobblixor DEBUG] Radio option text: "${radioText}", value: "${radio.value}", id: "${radio.id}"`);

    const shouldSelect = shouldSelectRadioOption(radioText, radio.value, answerValue, questionText);
    
    if (shouldSelect) {
      if (!radio.checked) {
        radio.checked = true;
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('input', { bubbles: true }));
        radio.dispatchEvent(new Event('click', { bubbles: true }));
        
        console.log(`[Jobblixor DEBUG] Selected radio: "${radioText || radio.value}" (checked: ${radio.checked})`);
        
        setTimeout(() => {
          console.log(`[Jobblixor DEBUG] Radio check after timeout: ${radio.checked}`);
        }, 100);
        
        return true;
      } else {
        console.log(`[Jobblixor DEBUG] Radio already selected: "${radioText || radio.value}"`);
        return true;
      }
    }
  }

  console.log("[Jobblixor DEBUG] No matching radio option found");
  return false;
}

function shouldSelectRadioOption(optionText, optionValue, answerValue, questionText) {
  const answer = answerValue.toString().toLowerCase().trim();
  const text = optionText.toLowerCase().trim();
  const value = optionValue.toLowerCase().trim();

  console.log(`[Jobblixor DEBUG] Checking radio match: answer="${answer}", text="${text}", value="${value}"`);

  if (answer === 'yes' || answer === 'true') {
    if (text === 'yes' || value === 'yes' || text === 'true' || value === 'true') {
      console.log(`[Jobblixor DEBUG] YES match found`);
      return true;
    }
  }
  
  if (answer === 'no' || answer === 'false') {
    if (text === 'no' || value === 'no' || text === 'false' || value === 'false') {
      console.log(`[Jobblixor DEBUG] NO match found`);
      return true;
    }
  }

  if (answer === 'male' && (text === 'male' || value === 'male')) {
    console.log(`[Jobblixor DEBUG] Male gender match found`);
    return true;
  }

  if (answer === 'female' && (text === 'female' || value === 'female')) {
    console.log(`[Jobblixor DEBUG] Female gender match found`);
    return true;
  }

  if ((answer === 'not declared' || answer === 'prefer not to answer') && 
      (text.includes('not declared') || text.includes('not disclosed') || text.includes('prefer not'))) {
    console.log(`[Jobblixor DEBUG] Not declared match found`);
    return true;
  }

  if (questionText.includes('veteran')) {
    if ((answer.includes('not') || answer.includes('no')) && 
        (text.includes('not') || text.includes('no') || text.includes('i am not'))) {
      console.log(`[Jobblixor DEBUG] Not veteran match found`);
      return true;
    }
    
    if (answer.includes('veteran') && text.includes('veteran') && !text.includes('not')) {
      console.log(`[Jobblixor DEBUG] Veteran match found`);
      return true;
    }
  }

  if (text === answer || value === answer) {
    console.log(`[Jobblixor DEBUG] Exact match found`);
    return true;
  }

  if (text.includes(answer) || value.includes(answer)) {
    console.log(`[Jobblixor DEBUG] Partial match found`);
    return true;
  }

  console.log(`[Jobblixor DEBUG] No match found for this option`);
  return false;
}

function handleSelectQuestion(selects, answerValue, questionText) {
  if (selects.length === 0) return false;

  for (const select of selects) {
    console.log(`[Jobblixor DEBUG] Found select with ${select.options.length} options`);
    
    for (const option of select.options) {
      const optionText = option.textContent.toLowerCase();
      const optionValue = option.value.toLowerCase();
      
      const shouldSelect = shouldSelectSelectOption(optionText, optionValue, answerValue, questionText);
      
      if (shouldSelect) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`[Jobblixor DEBUG] Selected option: "${option.textContent}"`);
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

  console.log(`[Jobblixor DEBUG] Checking dropdown option: answer="${answer}", text="${text}", value="${value}"`);

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

  if (answer === 'not declared' || answer === 'prefer not to answer') {
    if (text.includes('not declared') || text.includes('prefer not') || text.includes('decline')) {
      return true;
    }
  }

  if (answer === 'male' && (text.includes('male') && !text.includes('female'))) {
    return true;
  }

  if (answer === 'female' && text.includes('female')) {
    return true;
  }

  if (questionText.includes('ethnicity') || questionText.includes('race')) {
    const ethnicityMappings = {
      'white': ['white', 'caucasian'],
      'black': ['black', 'african american', 'african-american'],
      'asian': ['asian', 'pacific islander'],
      'hispanic': ['hispanic', 'latino'],
      'native american': ['native american', 'american indian'],
      'prefer not to answer': ['prefer not', 'decline', 'not disclosed']
    };

    for (const [category, keywords] of Object.entries(ethnicityMappings)) {
      if (answer.includes(category.toLowerCase())) {
        if (keywords.some(keyword => text.includes(keyword))) {
          return true;
        }
      }
    }
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
        console.log("[Jobblixor DEBUG] Checked checkbox");
      }
    });
    return true;
  }

  return false;
}

function handleUnknownQuestion(questionEl, questionText) {
  console.log(`[Jobblixor DEBUG] Handling unknown question with fallback logic: "${questionText}"`);
  
  const questionContainer = questionEl.closest('div, fieldset, form') || questionEl.parentElement;
  if (!questionContainer) return false;

  if (questionText.includes('availability') || questionText.includes('work') || questionText.includes('schedule')) {
    const checkboxes = questionContainer.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      console.log(`[Jobblixor DEBUG] Fallback: Found ${checkboxes.length} checkboxes - checking all for maximum availability`);
      let checkedAny = false;
      checkboxes.forEach(checkbox => {
        if (!checkbox.checked) {
          checkbox.checked = true;
          checkbox.click();
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          const label = document.querySelector(`label[for="${checkbox.id}"]`) || checkbox.closest('label');
          const labelText = label ? label.textContent.trim() : (checkbox.value || checkbox.id);
          console.log(`[Jobblixor DEBUG] Fallback checked: ${labelText}`);
          checkedAny = true;
        }
      });
      return checkedAny;
    }
  }

  const radios = questionContainer.querySelectorAll('input[type="radio"]');
  if (radios.length > 0) {
    console.log(`[Jobblixor DEBUG] Fallback: Found ${radios.length} radio options - selecting most attractive option`);
    
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
            console.log(`[Jobblixor DEBUG] Fallback selected attractive option: "${radioText}"`);
            return true;
          }
        }
      }
    }

    if (radios[0] && !radios[0].checked) {
      radios[0].checked = true;
      radios[0].click();
      radios[0].dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`[Jobblixor DEBUG] Fallback selected first radio option`);
      return true;
    }
  }

  const selects = questionContainer.querySelectorAll('select');
  if (selects.length > 0) {
    for (const select of selects) {
      console.log(`[Jobblixor DEBUG] Fallback: Found select with ${select.options.length} options`);
      
      const attractiveSelections = [
        'both', 'full time and part time', 'all shifts', 'any time',
        'full time', 'immediately', 'asap', 'flexible'
      ];

      for (const attractiveSelection of attractiveSelections) {
        for (const option of select.options) {
          if (option.textContent.toLowerCase().includes(attractiveSelection)) {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`[Jobblixor DEBUG] Fallback selected attractive dropdown option: "${option.textContent}"`);
            return true;
          }
        }
      }

      if (select.options.length > 1) {
        select.value = select.options[1].value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`[Jobblixor DEBUG] Fallback selected second dropdown option: "${select.options[1].textContent}"`);
        return true;
      }
    }
  }

  console.log(`[Jobblixor DEBUG] Fallback: No actionable inputs found for this question`);
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
      console.log(`[Jobblixor DEBUG] Clicked label for: "${labelText}"`);
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
      console.log(`[Jobblixor DEBUG] Successfully checked: "${labelText}"`);
      checkedCount++;
    } else {
      console.log(`[Jobblixor DEBUG] Failed to check: "${labelText}" - trying alternative approach`);
      
      if (checkbox.parentElement) {
        checkbox.parentElement.click();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (checkbox.checked) {
          console.log(`[Jobblixor DEBUG] Checked via parent click: "${labelText}"`);
          checkedCount++;
        }
      }
    }
  }
  
  return checkedCount;
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
  
  console.log('[Jobblixor DEBUG] No upload resume option found to select');
  return false;
}

function selectPostUploadResumeOptions() {
  console.log('[Jobblixor DEBUG] Looking for post-upload resume options...');
  
  const radios = Array.from(document.querySelectorAll('input[type="radio"]'))
    .filter(radio => !radio.checked);
  
  if (radios.length > 0) {
    const firstRadio = radios[0];
    firstRadio.checked = true;
    firstRadio.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[Jobblixor DEBUG] Selected post-upload resume option:', firstRadio.value || firstRadio.id);
    return true;
  }
  
  const optionElements = Array.from(document.querySelectorAll('button, div, label, span'))
    .filter(el => {
      const text = (el.textContent || '').toLowerCase();
      return text.includes('option') || text.includes('select') || text.includes('choose');
    });
  
  for (const el of optionElements) {
    if (el.offsetParent !== null) {
      el.click();
      console.log('[Jobblixor DEBUG] Clicked resume option element:', el.textContent?.trim());
      return true;
    }
  }
  
  console.log('[Jobblixor DEBUG] No post-upload resume options found');
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
  
  console.log('[Jobblixor DEBUG] Element did not become enabled within timeout');
  return false;
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

function getFieldMappings(profile) {
  return [
    { value: profile.first_name, keywords: ['first name', 'given name', 'fname', 'forename'] },
    { value: profile.last_name, keywords: ['last name', 'surname', 'lname', 'family name'] },
    { value: profile.email, keywords: ['email', 'e-mail'] },
    { value: profile.phone_number, keywords: ['phone', 'mobile', 'cell'] },
    { value: profile.location, keywords: ['location', 'city', 'locality', 'town'] },
    { value: profile.preferred_salary, keywords: ['salary', 'expected pay', 'pay'] },
    { value: profile.job_title_relevant_experience || "Software Engineer", keywords: ['job title', 'position', 'relevant experience', 'job that shows relevant'] },
    { value: profile.company_relevant_experience || "Tech Company", keywords: ['company', 'employer', 'company name', 'previous employer'] },
    { value: profile.over_18, keywords: ['18', 'over 18', 'age', 'older than'] },
    { value: profile.authorized_us, keywords: ['authorized', 'work authorization', 'right to work', 'eligible'] },
    { value: profile.require_sponsorship, keywords: ['sponsorship', 'require sponsorship'] },
    { value: profile.gender, keywords: ['gender', 'sex'] },
    { value: profile.ethnicity, keywords: ['ethnicity', 'race'] },
    { value: profile.years_experience, keywords: ['years experience', 'experience'] },
    { value: profile.veteran_status, keywords: ['veteran', 'military'] },
    { value: profile.zip_code || "10001", keywords: ['zip code', 'zip', 'postal', 'postcode'] },
    { value: profile.location || "New York, NY", keywords: ['city', 'city state', 'locality', 'town'] },
    { value: profile.street_address || "123 Main Street", keywords: ['street address', 'address', 'address line', 'street'] },
    { value: "United States", keywords: ['country'] },
    { value: profile.state || "NY", keywords: ['state'] },
  ];
}

function robustFillField(keywords, value) {
  let filled = false;
  
  // Enhanced phone number handling
  if (keywords.some(kw => kw.includes('phone'))) {
    console.log(`[Jobblixor DEBUG] Looking for phone number field with value: "${value}"`);
    
    // Look for phone inputs specifically (they might have different structures)
    const phoneInputs = document.querySelectorAll('input[type="tel"], input[name*="phone"], input[id*="phone"], input[placeholder*="phone"]');
    
    for (const phoneInput of phoneInputs) {
      if (phoneInput.type === 'tel' || 
          phoneInput.name?.toLowerCase().includes('phone') ||
          phoneInput.id?.toLowerCase().includes('phone') ||
          phoneInput.placeholder?.toLowerCase().includes('phone')) {
        
        // Clean the phone number (remove any formatting)
        const cleanPhone = value.replace(/\D/g, ''); // Remove non-digits
        
        console.log(`[Jobblixor DEBUG] Attempting to fill phone with: "${cleanPhone}"`);
        
        // Method 1: Focus and clear first
        phoneInput.focus();
        phoneInput.select();
        document.execCommand('delete');
        
        // Method 2: Use our enhanced setNativeValue
        setNativeValue(phoneInput, cleanPhone);
        
        // Method 3: Simulate typing character by character
        phoneInput.value = '';
        for (let i = 0; i < cleanPhone.length; i++) {
          phoneInput.value += cleanPhone[i];
          phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Method 4: Final validation events
        phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
        phoneInput.dispatchEvent(new Event('blur', { bubbles: true }));
        
        // Method 5: Verify it stuck
        setTimeout(() => {
          console.log(`[Jobblixor DEBUG] Phone field value after fill: "${phoneInput.value}"`);
          if (phoneInput.value === cleanPhone) {
            console.log(`[Jobblixor DEBUG] Phone number successfully filled and verified`);
          } else {
            console.log(`[Jobblixor DEBUG] Phone number may not have stuck properly`);
            // Try one more time if it didn't stick
            phoneInput.value = cleanPhone;
            phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
            phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, 500); // Increased delay for verification
        
        filled = true;
        break;
      }
    }
    
    // If no specific phone input found, try the general approach
    if (!filled) {
      console.log(`[Jobblixor DEBUG] No tel input found, trying general phone field detection`);
    }
  }
  
  // Enhanced location field handling
  if (keywords.some(kw => kw.includes('zip'))) {
    const zipInputs = document.querySelectorAll(
      'input[name*="zip"], input[id*="zip"], input[placeholder*="zip"], ' +
      'input[name*="postal"], input[id*="postal"], input[placeholder*="postal"]'
    );
    for (const zipInput of zipInputs) {
      setNativeValue(zipInput, value);
      console.log(`[Jobblixor DEBUG] Filled zip code: "${value}"`);
      filled = true;
      break;
    }
  }

  if (keywords.some(kw => kw.includes('city'))) {
    const cityInputs = document.querySelectorAll(
      'input[name*="city"], input[id*="city"], input[placeholder*="city"], ' +
      'input[name*="state"], input[id*="state"], input[placeholder*="state"]'
    );
    for (const cityInput of cityInputs) {
      setNativeValue(cityInput, value);
      console.log(`[Jobblixor DEBUG] Filled city/state: "${value}"`);
      filled = true;
      break;
    }
  }

  if (keywords.some(kw => kw.includes('address'))) {
    const addressInputs = document.querySelectorAll(
      'input[name*="address"], input[id*="address"], input[placeholder*="address"], ' +
      'input[name*="street"], input[id*="street"], input[placeholder*="street"]'
    );
    for (const addressInput of addressInputs) {
      setNativeValue(addressInput, value);
      console.log(`[Jobblixor DEBUG] Filled street address: "${value}"`);
      filled = true;
      break;
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
    
    // Method 1: Clear the field first
    element.focus();
    element.select();
    
    // Method 2: Set the value multiple ways
    const lastValue = element.value;
    element.value = value;
    
    // Method 3: Trigger React-style value tracking
    const tracker = element._valueTracker;
    if (tracker) {
      tracker.setValue(lastValue);
    }
    
    // Method 4: Dispatch comprehensive events in the right order
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    
    // Method 5: Trigger keydown/keyup events to simulate typing
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
    
    // Method 6: Force a final validation
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
      
      console.log(`[Jobblixor DEBUG] Found unchecked checkbox with context: "${checkboxContext.substring(0, 100)}..."`);
      
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
        
        console.log('[Jobblixor DEBUG] Checked agreement/terms checkbox');
      } else {
        console.log('[Jobblixor DEBUG] Skipped checkbox (not terms/agreement related)');
      }
    }
  });
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
// ORCHESTRATOR RECOVERY ON PAGE LOAD
// ==========================================
(async function orchestratorRecoveryOnLoad() {
  // Wait for page to be fully loaded
  if (document.readyState !== 'complete') {
    await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
  }
  await delay(2000); // Wait for content to settle

  // NEW: Check for anomalies on page load
  const anomalyDetected = await detectAndHandlePageAnomalies();
  if (anomalyDetected) {
    console.log('[Orchestrator] Anomaly detected on page load - recovery attempted');
    return; // Let the navigation complete
  }

  // CRITICAL: Check if another orchestrator is already running before attempting recovery
  const runningCheck = await checkForRunningOrchestrator();
  if (runningCheck.isRunning) {
    console.log('[Orchestrator] Another orchestrator already running, skipping recovery');
    return;
  }

  const state = await loadOrchestratorState();
  if (state && state.isRunning && state.waitingForSearch && !globalOrchestratorRunning) {
    console.log('[Orchestrator] Detected search navigation, resuming orchestrator:', state);
    globalStopped = false;
    await startSingleOrchestrator(state.userProfile, state);
  }
})();

// === GLOBAL STOP MECHANISM ===
function setGlobalStopFlag() {
  chrome.storage.local.set({ jobblixor_global_stop: true });
  // Auto-clear the flag after 30 seconds to prevent permanent blocking
  setTimeout(() => {
    chrome.storage.local.remove(['jobblixor_global_stop']);
    console.log('[Cleanup] Auto-cleared global stop flag');
  }, 30000);
}
function clearGlobalStopFlag() {
  chrome.storage.local.remove(['jobblixor_global_stop']);
}

// Global click tracking for debouncing
let lastClickTime = 0;
const CLICK_DEBOUNCE_TIME = 5000; // 5 seconds

function handleErrorPopups() {
  console.log("[Jobblixor DEBUG] Checking for error popups...");
  
  const errorPopupSelectors = [
    '[role="dialog"]',
    '.modal', 
    '.error-modal',
    '.alert',
    '[data-testid*="error"]',
    '[data-testid*="modal"]'
  ];
  
  for (const selector of errorPopupSelectors) {
    const popup = document.querySelector(selector);
    if (popup && (popup.textContent.toLowerCase().includes('something went wrong') || 
                  popup.textContent.toLowerCase().includes('save job'))) {
      console.log("[Jobblixor DEBUG] Found error popup, attempting to dismiss and continue...");
      
      const closeButtons = popup.querySelectorAll('button, [role="button"]');
      for (const button of closeButtons) {
        const buttonText = button.textContent.toLowerCase();
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        
        if ((buttonText.includes('close') || buttonText.includes('dismiss') || 
             ariaLabel.includes('close')) &&
            !buttonText.includes('save') && !buttonText.includes('exit')) {
          button.click();
          console.log("[Jobblixor DEBUG] Clicked close button, continuing automation");
          return true;
        }
      }
      
      const backdrop = document.querySelector('.modal-backdrop, .overlay');
      if (backdrop) {
        backdrop.click();
        console.log("[Jobblixor DEBUG] Clicked backdrop to dismiss popup");
        return true;
      }
      
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      console.log("[Jobblixor DEBUG] Pressed Escape to dismiss popup");
      return true;
    }
  }
  
  return false;
}

// --- ANTI-DETECTION HELPERS ---
function randomDelay(min = 500, max = 2000) {
  const delay = Math.random() * (max - min) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

function simulateHumanBehavior(element) {
  // Simulate mouse hover before clicking
  element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return new Promise(resolve => {
    setTimeout(() => {
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      setTimeout(() => {
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        element.click();
        resolve();
      }, 50 + Math.random() * 100);
    }, 100 + Math.random() * 200);
  });
}

// ==========================================
// ANOMALY DETECTION & RECOVERY FOR INDEED INTERRUPTION PAGES
// ==========================================
async function detectAndHandlePageAnomalies() {
  const currentUrl = window.location.href;
  // NEVER run anomaly detection on search results pages
  if (currentUrl.includes('/jobs?q=')) {
    console.log('[Orchestrator] Skipping anomaly detection - this is a search results page');
    return false;
  }
  // SKIP anomaly detection on homepage or verification pages
  if (currentUrl === 'https://www.indeed.com/' || 
      currentUrl.includes('www.indeed.com/?') ||
      currentUrl.includes('verification') ||
      currentUrl.includes('cloudflare') ||
      currentUrl.includes('challenge')) {
    console.log('[Orchestrator] Skipping anomaly detection on homepage/verification page');
    return false;
  }
  // Wait longer for the page to load before checking for anomalies
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('[Orchestrator] Checking for page anomalies...');

  // Detection patterns for Indeed's interruption pages
  const anomalyPatterns = [
    // Profile/qualification pages
    'Profile insights',
    'Do you have a valid',
    'Teaching Certification',
    "Bachelor's degree",
    "Here's how the job qualifications align",
    "Here's how the job details align",

    // Error/redirect pages
    'Something went wrong',
    'Page not found',
    'Job no longer available',

    // Survey/feedback pages
    'Tell us about yourself',
    'Help us improve',
    'Rate your experience'
  ];

  const pageText = document.body.textContent || '';
  const pageTitle = document.title || '';

  // Check if we're on an anomaly page
  const isAnomalyPage = anomalyPatterns.some(pattern =>
    pageText.includes(pattern) || pageTitle.includes(pattern)
  );

  // Also check URL patterns
  const anomalyUrlPatterns = [
    '/profile-insights',
    '/job-qualifications',
    '/error',
    '/survey',
    '/feedback'
  ];

  const hasAnomalyUrl = anomalyUrlPatterns.some(pattern =>
    currentUrl.includes(pattern)
  );

  if (isAnomalyPage || hasAnomalyUrl) {
    console.log('[Orchestrator] ANOMALY DETECTED - attempting recovery');
    console.log('[Orchestrator] Page text sample:', pageText.substring(0, 200));
    console.log('[Orchestrator] Current URL:', currentUrl);

    // Recovery strategy 1: Click Home button
    const homeButton = document.querySelector('a[href="/"]') ||
      document.querySelector('a[href="https://www.indeed.com"]') ||
      document.querySelector('.icl-Header-logo') ||
      document.querySelector('[data-testid="header-logo"]') ||
      Array.from(document.querySelectorAll('a')).find(a =>
        a.textContent.toLowerCase().includes('home') ||
        (a.href.includes('indeed.com') && a.href.endsWith('/'))
      );

    if (homeButton) {
      console.log('[Orchestrator] Found home button, clicking...');
      homeButton.click();
      await delay(3000); // Wait for navigation
      return true; // Recovery attempted
    }

    // Recovery strategy 2: Navigate directly to job search
    console.log('[Orchestrator] No home button found, navigating to job search...');
    const jobQuery = encodeURIComponent('teacher'); // Use generic search
    const locationQuery = encodeURIComponent('New York, NY');
    const fallbackUrl = `https://www.indeed.com/jobs?q=${jobQuery}&l=${locationQuery}`;

    window.location.href = fallbackUrl;
    await delay(3000);
    return true; // Recovery attempted
  }

  return false; // No anomaly detected
}

// Clear stale completion flags on page load
chrome.storage.local.get(['last_application_completion'], (result) => {
  const completion = result.last_application_completion;
  // If completion is older than 30 seconds, clear it
  if (completion && (Date.now() - completion.timestamp) > 120000) {
    chrome.storage.local.remove(['last_application_completion']);
    console.log('[Cleanup] Cleared stale application completion flag');
  }
});

})();
}