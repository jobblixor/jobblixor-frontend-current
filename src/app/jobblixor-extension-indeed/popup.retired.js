// FIXED: Four-Button Popup Script with Bulletproof State Management
let userProfile = null;
let currentPhase = 'ready';
let isRunning = false;
let isPaused = false;
let sessionStats = {
  applied: 0,
  startTime: null,
  apm: 0,
  jobsFound: 0
};

// Automation states
const AUTOMATION_STATES = {
  IDLE: 'idle',
  RUNNING: 'running', 
  PAUSED: 'paused',
  STOPPING: 'stopping'
};

let currentAutomationState = AUTOMATION_STATES.IDLE;

// DOM Elements
const emailInput = document.getElementById('email');
const jobCountInput = document.getElementById('jobCount');
const applicationsLeftEl = document.getElementById('applicationsLeft');
const currentStatusEl = document.getElementById('currentStatus');
const appliedCountEl = document.getElementById('appliedCount');
const targetJobsEl = document.getElementById('targetJobs');
const statusEl = document.getElementById('status');

// Four control buttons
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtn = document.getElementById('stopBtn');

// State persistence keys
const STATE_STORAGE_KEY = 'jobblixor_automation_state';
const AUTOMATION_STATE_KEY = 'jobblixor_current_state';

// FIXED: Debug logging function
function debugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[Popup-DEBUG ${timestamp}] ${message}`, data || '');
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  debugLog("FIXED: Initializing four-button popup...");
  
  try {
    // Load saved email
    const savedEmail = localStorage.getItem('jobblixor_email');
    if (savedEmail) {
      emailInput.value = savedEmail;
      await loadUserProfile(savedEmail);
    }

    // Load session stats
    const savedStats = localStorage.getItem('jobblixor_session_stats');
    if (savedStats) {
      try {
        sessionStats = JSON.parse(savedStats);
        debugLog("Loaded session stats", sessionStats);
      } catch (e) {
        debugLog("Error loading session stats", e);
      }
    }

    // FIXED: Load automation state with proper error handling
    await restoreAutomationState();

    // FIXED: Always update display and button visibility
    updateDisplay();
    setupEventListeners();
    startStatsUpdating();
    
    debugLog("FIXED: Initialization complete - Current state:", currentAutomationState);
  } catch (error) {
    debugLog("CRITICAL: Initialization error", error);
    updateStatus(`Initialization error: ${error.message}`);
  }
});

// FIXED: Restore automation state with comprehensive error handling
async function restoreAutomationState() {
  debugLog("FIXED: Attempting to restore automation state...");
  
  try {
    // Check for saved automation state
    const savedState = localStorage.getItem(AUTOMATION_STATE_KEY);
    const stateJson = localStorage.getItem(STATE_STORAGE_KEY);
    
    if (savedState) {
      debugLog("Found saved automation state:", savedState);
      
      // Validate the state is legitimate
      if (Object.values(AUTOMATION_STATES).includes(savedState)) {
        currentAutomationState = savedState;
        debugLog("Restored automation state to:", currentAutomationState);
      } else {
        debugLog("Invalid saved state, resetting to idle:", savedState);
        currentAutomationState = AUTOMATION_STATES.IDLE;
      }
    }
    
    if (stateJson) {
      const state = JSON.parse(stateJson);
      debugLog("Found automation session state", state);
      
      // Check if state is recent (less than 30 minutes old)
      const maxAge = 30 * 60 * 1000;
      if (Date.now() - state.timestamp < maxAge) {
        debugLog("Session state is recent, restoring...");
        
        // Restore form values
        if (state.email && emailInput) {
          emailInput.value = state.email;
        }
        if (state.targetJobs && jobCountInput) {
          jobCountInput.value = state.targetJobs;
        }
        
        // Update progress from state
        if (state.processedCount) {
          sessionStats.applied = state.processedCount;
        }
        
        // Set appropriate flags based on state
        if (currentAutomationState === AUTOMATION_STATES.RUNNING) {
          isRunning = true;
          isPaused = false;
          debugLog("Set flags for running state");
        } else if (currentAutomationState === AUTOMATION_STATES.PAUSED) {
          isRunning = true;
          isPaused = true;
          debugLog("Set flags for paused state");
        }
        
        // Show appropriate status based on current step
        let statusMsg = getStatusMessageFromState(state, currentAutomationState);
        updateStatus(statusMsg);
        
        return true;
      } else {
        debugLog("Session state is too old, clearing...");
        clearAllAutomationState();
      }
    }
  } catch (error) {
    debugLog("CRITICAL: Error restoring automation state", error);
    clearAllAutomationState();
  }
  
  // Always return to idle if no valid state found
  currentAutomationState = AUTOMATION_STATES.IDLE;
  debugLog("No valid state found, set to idle");
  return false;
}

// Helper function to get status message from state
function getStatusMessageFromState(state, automationState) {
  if (automationState === AUTOMATION_STATES.PAUSED) {
    return `Paused at: ${state.currentJob?.title || state.step || 'unknown step'}`;
  }
  
  if (state.step) {
    switch (state.step) {
      case "waiting_for_results":
        return "Searching for jobs...";
      case "results_ready":
        return "Found jobs, processing applications...";
      case "processing_job":
        return `Processing: ${state.currentJob?.title || 'job'}`;
      case "application_completed":
        return `Completed: ${state.currentJob?.title || 'job'}`;
      default:
        return `Step: ${state.step}`;
    }
  }
  
  return "Automation in progress...";
}

// FIXED: Event listeners with proper error handling
function setupEventListeners() {
  debugLog("Setting up event listeners...");
  
  try {
    // Four main control buttons with null checks
    if (startBtn) {
      startBtn.addEventListener('click', startAutoApplying);
      debugLog("Start button listener attached");
    } else {
      debugLog("ERROR: Start button not found!");
    }
    
    if (pauseBtn) {
      pauseBtn.addEventListener('click', pauseAutomation);
      debugLog("Pause button listener attached");
    } else {
      debugLog("ERROR: Pause button not found!");
    }
    
    if (resumeBtn) {
      resumeBtn.addEventListener('click', resumeAutomation);
      debugLog("Resume button listener attached");
    } else {
      debugLog("ERROR: Resume button not found!");
    }
    
    if (stopBtn) {
      stopBtn.addEventListener('click', stopAutomation);
      debugLog("Stop button listener attached");
    } else {
      debugLog("ERROR: Stop button not found!");
    }
    
    // Email and job count listeners
    if (emailInput) {
      emailInput.addEventListener('blur', async () => {
        const email = emailInput.value.trim();
        if (email && email.includes('@')) {
          localStorage.setItem('jobblixor_email', email);
          await loadUserProfile(email);
        }
      });
    }

    if (jobCountInput) {
      jobCountInput.addEventListener('input', () => {
        const jobCount = parseInt(jobCountInput.value) || 10;
        if (targetJobsEl) targetJobsEl.textContent = jobCount;
        localStorage.setItem('jobblixor_job_count', jobCount.toString());
      });
      
      // Load saved job count
      const savedJobCount = localStorage.getItem('jobblixor_job_count');
      if (savedJobCount) {
        jobCountInput.value = savedJobCount;
        if (targetJobsEl) targetJobsEl.textContent = savedJobCount;
      }
    }
    
    debugLog("Event listeners setup complete");
  } catch (error) {
    debugLog("CRITICAL: Error setting up event listeners", error);
  }
}

// FIXED: Start automation with comprehensive error handling and logging
async function startAutoApplying() {
  const email = emailInput.value.trim();
  const jobCount = parseInt(jobCountInput.value) || 10;
  
  debugLog("FIXED: Start button clicked", { email, jobCount, currentState: currentAutomationState });
  
  try {
    if (!email || !email.includes('@')) {
      updateStatus('Please enter a valid email address.');
      debugLog("Invalid email provided:", email);
      return;
    }

    // Load user profile first
    if (!userProfile) {
      debugLog("Loading user profile...");
      await loadUserProfile(email);
    }

    // Check application limit
    const appsLeft = userProfile?.free_uses_left || 100;
    if (appsLeft <= 0) {
      updateStatus('No applications left. Please upgrade your plan.');
      debugLog("No applications left:", appsLeft);
      return;
    }

    // FIXED: Set running state BEFORE any async operations
    debugLog("Setting automation state to RUNNING");
    setAutomationState(AUTOMATION_STATES.RUNNING);
    updateStatus('Detecting page and starting automation...');

    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentUrl = tab.url;
    
    debugLog("Current tab details", { tabId: tab.id, url: currentUrl });
    
    // BULLETPROOF PAGE DETECTION AND ROUTING
    if (currentUrl.includes('smartapply.indeed.com') || currentUrl.includes('us.smartapply.indeed.com')) {
      // PHASE 1: Easy Apply form page
      debugLog("===== PHASE 1 DETECTED: Easy Apply Form =====");
      updateStatus('Phase 1: Starting form autofill...');
      
      const message = {
        type: "RUN_PHASE1_AUTOFILL",
        email: email,
        jobCount: jobCount
      };
      
      // FIXED: Wrap in try-catch with timeout
      const response = await sendMessageWithTimeout(tab.id, message, 10000);
      handleAutomationResponse(response, "Phase 1", tab.id);
      
    } else if (currentUrl.includes('indeed.com')) {
      // PHASE 2: Main Indeed page - search and apply
      debugLog("===== PHASE 2 DETECTED: Indeed Main Site =====");
      updateStatus('Phase 2: Starting job search and auto-apply...');
      
      const message = {
        type: "START_AUTO_APPLY",
        email: email,
        jobCount: jobCount,
        jobTitle: userProfile?.job_title || "software engineer",
        location: userProfile?.location || "New York, NY"
      };
      
      // FIXED: Wrap in try-catch with timeout
      const response = await sendMessageWithTimeout(tab.id, message, 10000);
      handleAutomationResponse(response, "Phase 2", tab.id);
      
    } else {
      // Not on Indeed
      updateStatus('Please navigate to Indeed.com first, then try again.');
      debugLog("Not on Indeed site:", currentUrl);
      setAutomationState(AUTOMATION_STATES.IDLE);
      return;
    }
    
  } catch (error) {
    debugLog("CRITICAL: Start automation error", error);
    updateStatus(`Error: Could not start automation - ${error.message}`);
    setAutomationState(AUTOMATION_STATES.IDLE);
  }
}

// FIXED: Send message with timeout and proper error handling
function sendMessageWithTimeout(tabId, message, timeoutMs = 10000) {
  return new Promise((resolve) => {
    debugLog(`Sending message to tab ${tabId}:`, message);
    
    let responseReceived = false;
    
    // Set up timeout
    const timeout = setTimeout(() => {
      if (!responseReceived) {
        responseReceived = true;
        debugLog(`Message timeout after ${timeoutMs}ms for tab ${tabId}`);
        resolve({
          success: false,
          error: `Communication timeout (${timeoutMs}ms)`,
          timeout: true
        });
      }
    }, timeoutMs);
    
    // Send the message
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (!responseReceived) {
        responseReceived = true;
        clearTimeout(timeout);
        
        // Check for Chrome runtime errors
        if (chrome.runtime.lastError) {
          debugLog(`Chrome runtime error for tab ${tabId}:`, chrome.runtime.lastError);
          resolve({
            success: false,
            error: chrome.runtime.lastError.message,
            chromeError: true
          });
          return;
        }
        
        debugLog(`Received response from tab ${tabId}:`, response);
        resolve(response || { success: false, error: "No response received" });
      }
    });
  });
}

// FIXED: Pause automation with enhanced error handling
async function pauseAutomation() {
  debugLog("FIXED: Pause button clicked - Current state:", currentAutomationState);
  
  try {
    setAutomationState(AUTOMATION_STATES.PAUSED);
    updateStatus('Pausing automation...');
    
    // Send pause message to all Indeed tabs with timeout
    const tabs = await chrome.tabs.query({});
    const indeedTabs = tabs.filter(tab => tab.url && tab.url.includes('indeed.com'));
    
    debugLog(`Sending pause to ${indeedTabs.length} Indeed tabs`);
    
    const promises = indeedTabs.map(tab => 
      sendMessageWithTimeout(tab.id, { type: "PAUSE_AUTO_APPLY" }, 5000)
    );
    
    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    
    updateStatus(`Automation paused. (${successCount}/${indeedTabs.length} tabs responded)`);
    debugLog("Pause results:", { total: indeedTabs.length, success: successCount });
    
  } catch (error) {
    debugLog("Error pausing automation:", error);
    updateStatus(`Pause error: ${error.message}`);
  }
}

// FIXED: Resume automation with enhanced error handling
async function resumeAutomation() {
  debugLog("FIXED: Resume button clicked - Current state:", currentAutomationState);
  
  try {
    setAutomationState(AUTOMATION_STATES.RUNNING);
    updateStatus('Resuming automation...');
    
    // Send resume message to all Indeed tabs with timeout
    const tabs = await chrome.tabs.query({});
    const indeedTabs = tabs.filter(tab => tab.url && tab.url.includes('indeed.com'));
    
    debugLog(`Sending resume to ${indeedTabs.length} Indeed tabs`);
    
    const promises = indeedTabs.map(tab => 
      sendMessageWithTimeout(tab.id, { type: "RESUME_AUTO_APPLY" }, 5000)
    );
    
    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    
    updateStatus(`Automation resumed. (${successCount}/${indeedTabs.length} tabs responded)`);
    debugLog("Resume results:", { total: indeedTabs.length, success: successCount });
    
  } catch (error) {
    debugLog("Error resuming automation:", error);
    updateStatus(`Resume error: ${error.message}`);
  }
}

// FIXED: Stop automation with comprehensive cleanup
async function stopAutomation() {
  debugLog("FIXED: Stop button clicked - Current state:", currentAutomationState);
  
  try {
    setAutomationState(AUTOMATION_STATES.STOPPING);
    updateStatus('Stopping automation...');
    
    // Send stop message to all Indeed tabs with timeout
    const tabs = await chrome.tabs.query({});
    const indeedTabs = tabs.filter(tab => tab.url && tab.url.includes('indeed.com'));
    
    debugLog(`Sending stop to ${indeedTabs.length} Indeed tabs`);
    
    const promises = indeedTabs.map(tab => 
      sendMessageWithTimeout(tab.id, { type: "STOP_AUTO_APPLY" }, 5000)
    );
    
    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    
    debugLog("Stop results:", { total: indeedTabs.length, success: successCount });
    
    // Clear all state
    clearAllAutomationState();
    setAutomationState(AUTOMATION_STATES.IDLE);
    updateStatus('Stopped. Ready to start new session.');
    
    // Reset session stats
    sessionStats = { applied: 0, startTime: null, apm: 0, jobsFound: 0 };
    saveSessionStats();
    updateDisplay();
    
    debugLog("Automation stopped successfully");
    
  } catch (error) {
    debugLog("Error stopping automation:", error);
    updateStatus(`Stop error: ${error.message}`);
    // Still clean up even if there were errors
    clearAllAutomationState();
    setAutomationState(AUTOMATION_STATES.IDLE);
  }
}

// FIXED: Set automation state with robust persistence
function setAutomationState(newState) {
  debugLog(`State change: ${currentAutomationState} -> ${newState}`);
  
  try {
    currentAutomationState = newState;
    
    // Update running/paused flags for backward compatibility
    isRunning = (newState === AUTOMATION_STATES.RUNNING || newState === AUTOMATION_STATES.PAUSED);
    isPaused = (newState === AUTOMATION_STATES.PAUSED);
    
    // Persist state immediately
    localStorage.setItem(AUTOMATION_STATE_KEY, newState);
    
    // Update session stats
    if (newState === AUTOMATION_STATES.RUNNING && !sessionStats.startTime) {
      sessionStats.startTime = Date.now();
      debugLog("Started session timer");
    }
    
    // CRITICAL: Always update display after state change
    updateDisplay();
    
    debugLog("Automation state set successfully:", newState);
  } catch (error) {
    debugLog("CRITICAL: Error setting automation state", error);
  }
}

// FIXED: All four buttons always visible and always functional
function updateButtonVisibility() {
  debugLog("Updating button states - All buttons functional at all times");
  
  try {
    // Verify all buttons exist
    const buttons = { startBtn, pauseBtn, resumeBtn, stopBtn };
    const missingButtons = [];
    
    Object.entries(buttons).forEach(([name, btn]) => {
      if (!btn) {
        missingButtons.push(name);
      }
    });
    
    if (missingButtons.length > 0) {
      debugLog("CRITICAL: Missing buttons:", missingButtons);
      return;
    }
    
    // Show all buttons and make them all functional
    [startBtn, pauseBtn, resumeBtn, stopBtn].forEach(btn => {
      if (btn) {
        btn.classList.remove('btn-hidden');
        btn.style.display = 'block';
        btn.disabled = false; // Always enabled
      }
    });
    
    debugLog("All buttons visible and functional - Current state:", currentAutomationState);
    
  } catch (error) {
    debugLog("CRITICAL: Error updating button visibility", error);
  }
}

// FIXED: Handle automation response with detailed logging
function handleAutomationResponse(response, phaseName, tabId) {
  debugLog(`${phaseName} response from tab ${tabId}:`, response);
  
  try {
    // Check for timeout or Chrome errors
    if (response?.timeout) {
      updateStatus(`${phaseName} Error: Communication timeout. Make sure you're on the correct page.`);
      setAutomationState(AUTOMATION_STATES.IDLE);
      return;
    }
    
    if (response?.chromeError) {
      updateStatus(`${phaseName} Error: ${response.error}. Try refreshing the page.`);
      setAutomationState(AUTOMATION_STATES.IDLE);
      return;
    }
    
    if (response?.success) {
      updateStatus(`${phaseName} automation started successfully!`);
      debugLog(`${phaseName} automation started successfully in tab ${tabId}`);
      // State should remain RUNNING
    } else {
      const errorMsg = response?.error || `Failed to start ${phaseName} automation`;
      updateStatus(`${phaseName} Error: ${errorMsg}`);
      setAutomationState(AUTOMATION_STATES.IDLE);
      debugLog(`${phaseName} start failed in tab ${tabId}:`, response);
    }
  } catch (error) {
    debugLog(`Error handling ${phaseName} response:`, error);
    updateStatus(`${phaseName} Error: ${error.message}`);
    setAutomationState(AUTOMATION_STATES.IDLE);
  }
}

// FIXED: Message listener with comprehensive error handling and logging
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog("Received message:", { type: message.type, sender: sender.tab?.id });
  
  try {
    if (message.type === "APPLICATION_COMPLETED") {
      sessionStats.applied++;
      
      // Decrement free uses left locally
      if (userProfile) {
        userProfile.free_uses_left = Math.max(0, (userProfile.free_uses_left || 0) - 1);
      }
      
      updateStatus(`Application #${sessionStats.applied} completed successfully!`);
      updateDisplay();
      debugLog("Application completed - Total:", sessionStats.applied);
      
    } else if (message.type === "APPLICATION_ERROR") {
      const errorMsg = message.error || 'Unknown error occurred';
      updateStatus(`Application error: ${errorMsg}`);
      debugLog("Application error:", errorMsg);
      
    } else if (message.type === "STATUS_UPDATE") {
      const statusMessage = message.status || message.message;
      if (statusMessage) {
        updateStatus(statusMessage);
      }
      
      // Update applied count if provided
      if (message.appliedCount !== undefined) {
        sessionStats.applied = message.appliedCount;
        updateDisplay();
        debugLog("Applied count updated:", message.appliedCount);
      }
      
    } else if (message.type === "APPLICATION_FLOW_COMPLETE") {
      // Bot finished the entire application process
      setAutomationState(AUTOMATION_STATES.IDLE);
      updateStatus(`Automation completed! Total applied: ${sessionStats.applied}`);
      
      // Clear automation state since it's complete
      clearAllAutomationState();
      debugLog("Application flow completed - Total applied:", sessionStats.applied);
      
    } else if (message.type === "AUTOMATION_PAUSED") {
      setAutomationState(AUTOMATION_STATES.PAUSED);
      updateStatus('Automation paused by content script.');
      debugLog("Automation paused by content script");
      
    } else if (message.type === "AUTOMATION_RESUMED") {
      setAutomationState(AUTOMATION_STATES.RUNNING);
      updateStatus('Automation resumed by content script.');
      debugLog("Automation resumed by content script");
      
    } else {
      debugLog("Unhandled message type:", message.type);
    }
    
    sendResponse({ success: true });
  } catch (error) {
    debugLog("CRITICAL: Error handling message", error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true;
});

// Load user profile function (unchanged but with better logging)
async function loadUserProfile(email) {
  debugLog("Loading user profile for:", email);
  
  try {
    if (statusEl) statusEl.textContent = 'Loading profile...';
    
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ 
        type: "FETCH_USER_DOC", 
        email 
      }, resolve);
    });

    if (response?.success && response.data) {
      userProfile = response.data;
      updateDisplay();
      if (statusEl) statusEl.textContent = 'Profile loaded successfully! Ready to start.';
      debugLog("Profile loaded successfully:", userProfile);
      return true;
    } else {
      // Use fallback profile
      userProfile = createFallbackProfile(email);
      if (statusEl) statusEl.textContent = 'Using default profile. Ready to start!';
      debugLog("Using fallback profile for:", email);
      return true;
    }
  } catch (error) {
    debugLog("Error loading profile, using fallback:", error);
    userProfile = createFallbackProfile(email);
    if (statusEl) statusEl.textContent = 'Using default profile. Ready to start!';
    return true;
  }
}

function createFallbackProfile(email) {
  return {
    free_uses_left: 100,
    first_name: "Test",
    last_name: "User",
    email: email,
    phone_number: "1234567890",
    job_title: "software engineer",
    location: "New York, NY",
    preferred_salary: "75000"
  };
}

// FIXED: Display update with button visibility and error handling
function updateDisplay() {
  debugLog("Updating display - Current state:", currentAutomationState);
  
  try {
    // CRITICAL: Update button visibility first
    updateButtonVisibility();
    
    // Update applications left with accurate color coding
    if (userProfile) {
      const appsLeft = userProfile.free_uses_left || 100;
      if (applicationsLeftEl) applicationsLeftEl.textContent = appsLeft;
      
      // Color coding based on applications left
      if (appsLeft <= 0) {
        if (applicationsLeftEl) applicationsLeftEl.className = 'stat-value danger';
        if (startBtn && currentAutomationState === AUTOMATION_STATES.IDLE) {
          startBtn.disabled = true;
          startBtn.textContent = 'No Applications Left';
        }
      } else if (appsLeft <= 5) {
        if (applicationsLeftEl) applicationsLeftEl.className = 'stat-value warning';
      } else {
        if (applicationsLeftEl) applicationsLeftEl.className = 'stat-value applications-left';
      }
    } else {
      if (applicationsLeftEl) {
        applicationsLeftEl.textContent = '100';
        applicationsLeftEl.className = 'stat-value applications-left';
      }
    }

    // Update session stats
    if (appliedCountEl) appliedCountEl.textContent = sessionStats.applied;
    
    const targetJobsValue = jobCountInput ? jobCountInput.value : '10';
    if (targetJobsEl) targetJobsEl.textContent = targetJobsValue;
    
    // FIXED: Update status with automation state
    if (currentStatusEl) {
      switch (currentAutomationState) {
        case AUTOMATION_STATES.RUNNING:
          currentStatusEl.textContent = 'Running';
          currentStatusEl.className = 'stat-value pulse';
          break;
        case AUTOMATION_STATES.PAUSED:
          currentStatusEl.textContent = 'Paused';
          currentStatusEl.className = 'stat-value paused-pulse warning';
          break;
        case AUTOMATION_STATES.STOPPING:
          currentStatusEl.textContent = 'Stopping';
          currentStatusEl.className = 'stat-value warning';
          break;
        default:
          currentStatusEl.textContent = 'Ready';
          currentStatusEl.className = 'stat-value';
          break;
      }
    }

    saveSessionStats();
    debugLog("Display update completed");
    
  } catch (error) {
    debugLog("CRITICAL: Error updating display", error);
  }
}

// Helper functions
function updateStatus(message) {
  try {
    if (statusEl) {
      const timestamp = new Date().toLocaleTimeString();
      statusEl.textContent = `[${timestamp}] ${message}`;
    }
    debugLog("Status update:", message);
  } catch (error) {
    debugLog("Error updating status:", error);
  }
}

function clearAllAutomationState() {
  debugLog("Clearing all automation state");
  
  try {
    localStorage.removeItem(STATE_STORAGE_KEY);
    localStorage.removeItem(AUTOMATION_STATE_KEY);
    debugLog("Cleared all automation state successfully");
  } catch (error) {
    debugLog("Error clearing automation state:", error);
  }
}

function saveSessionStats() {
  try {
    localStorage.setItem('jobblixor_session_stats', JSON.stringify(sessionStats));
  } catch (error) {
    debugLog("Error saving session stats:", error);
  }
}

function startStatsUpdating() {
  setInterval(() => {
    try {
      if (sessionStats.startTime && sessionStats.applied > 0) {
        const elapsedMinutes = (Date.now() - sessionStats.startTime) / (1000 * 60);
        sessionStats.apm = Math.round((sessionStats.applied / elapsedMinutes) * 10) / 10;
      }
      
      // Refresh automation state check every interval
      restoreAutomationState();
      updateDisplay();
    } catch (error) {
      debugLog("Error in stats updating:", error);
    }
  }, 2000);
}