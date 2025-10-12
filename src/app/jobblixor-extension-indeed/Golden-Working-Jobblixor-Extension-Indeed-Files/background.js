console.log("[Jobblixor] background.js loaded");

import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, addDoc, updateDoc, increment } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Store user email globally for tab injection
let currentUserEmail = null;
let currentJobCount = 1;
let automationActive = false;

// ENHANCED: Automation state tracking
let automationState = 'idle'; // 'idle', 'running', 'paused', 'stopping'

// CRITICAL: Track Easy Apply tabs and their job titles for tab opening confirmation
let pendingEasyApplyTabs = new Map(); // tabId -> { jobTitle, jobId, email, startTime }

// Add orchestrator state persistence on START_AUTO_APPLY
let orchestratorResumeMessageSent = false;

// ADD these variables at the top:
let activeOrchestratorTabId = null;
let orchestratorTabDesignated = false;
let orchestratorTabId = null;

// Load automation state on service worker startup - MUST BE ASYNC
(async function initializeState() {
  try {
    const result = await chrome.storage.local.get(['automation_runtime_state']);
    if (result.automation_runtime_state) {
      currentUserEmail = result.automation_runtime_state.currentUserEmail;
      currentJobCount = result.automation_runtime_state.currentJobCount;
      automationActive = result.automation_runtime_state.automationActive;
      automationState = result.automation_runtime_state.automationState;
      console.log("[Background] Restored automation state from storage:", result.automation_runtime_state);
    } else {
      console.log("[Background] No saved automation state found");
    }
  } catch (error) {
    console.error("[Background] Failed to restore state:", error);
  }
})();

// === GLOBAL PAUSE STATE HELPERS ===
function setGlobalPhase2Paused(paused) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ jobblixor_phase2_paused: paused }, resolve);
  });
}

function getGlobalPhase2Paused() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['jobblixor_phase2_paused'], (result) => {
      resolve(!!result.jobblixor_phase2_paused);
    });
  });
}

// Add orchestrator state persistence on START_AUTO_APPLY
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Received message:", message.type);

  // Store user email when automation starts
  if (message.type === "START_AUTO_APPLY") {
    // Store the sender tab as the designated orchestrator
    activeOrchestratorTabId = sender.tab?.id;
    orchestratorTabDesignated = true;

    currentUserEmail = message.email;
    currentJobCount = message.jobCount || 1;
    automationActive = true;
    automationState = 'running';

    // CRITICAL: Also save to chrome.storage for persistence
    chrome.storage.local.set({
      automation_runtime_state: {
        currentUserEmail: message.email,
        currentJobCount: message.jobCount || 1,
        automationActive: true,
        automationState: 'running'
      },
      orchestrator_state: {
        isRunning: true,
        currentJobIndex: 0,
        targetJobs: message.jobCount,
        email: message.email,
        jobTitle: message.jobTitle,
        location: message.location,
        startTime: Date.now(),
        userProfile: {
          job_title: message.jobTitle,
          location: message.location,
          targetJobs: message.jobCount,
          email: message.email
        },
        designatedTabId: activeOrchestratorTabId  // Add this
      }
    });

    console.log("[Background] Designated orchestrator tab:", activeOrchestratorTabId);
    sendResponse({ success: true }); // Always respond to prevent unknown message log
    return true;
  }

  // NEW: Get tab count for new tab detection
  if (message.type === "GET_TAB_COUNT") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({});
        sendResponse({ success: true, tabCount: tabs.length });
      } catch (error) {
        console.error("[Background] Error getting tab count:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // NEW: Check if Easy Apply tab exists for a specific job
  if (message.type === "CHECK_EASY_APPLY_TAB_EXISTS") {
    (async () => {
      try {
        const jobId = message.jobId;
        console.log("[Background] Checking if Easy Apply tab exists for job:", jobId);
        
        // Check if we have a pending tab for this job
        const existingTab = Array.from(pendingEasyApplyTabs.values()).find(tab => 
          tab.jobId === jobId
        );
        
        if (existingTab) {
          // Verify the tab still exists and is an Easy Apply page
          try {
            const tab = await chrome.tabs.get(Object.keys(pendingEasyApplyTabs).find(key => 
              pendingEasyApplyTabs.get(parseInt(key))?.jobId === jobId
            ));
            
            const isEasyApplyPage = tab.url && (
              tab.url.includes('smartapply.indeed.com') || 
              tab.url.includes('us.smartapply.indeed.com')
            );
            
            if (isEasyApplyPage) {
              console.log("[Background] Confirmed: Easy Apply tab exists for job", jobId, "in tab", tab.id);
              sendResponse({ success: true, tabExists: true, tabId: tab.id });
            } else {
              console.log("[Background] Tab exists but is not Easy Apply page, cleaning up for job", jobId);
              pendingEasyApplyTabs.delete(tab.id);
              sendResponse({ success: true, tabExists: false });
            }
          } catch (tabError) {
            console.log("[Background] Tab no longer exists, cleaning up for job", jobId);
            // Clean up stale reference
            const staleTabId = Object.keys(pendingEasyApplyTabs).find(key => 
              pendingEasyApplyTabs.get(parseInt(key))?.jobId === jobId
            );
            if (staleTabId) {
              pendingEasyApplyTabs.delete(parseInt(staleTabId));
            }
            sendResponse({ success: true, tabExists: false });
          }
        } else {
          console.log("[Background] No Easy Apply tab found for job", jobId);
          sendResponse({ success: true, tabExists: false });
        }
      } catch (error) {
        console.error("[Background] Error checking Easy Apply tab existence:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // ENHANCED: Handle Easy Apply tab creation and management with tab opening confirmation
  // REMOVED: The OPEN_EASY_APPLY_TAB handler and all related manual tab creation logic

  // NEW: Force close all Easy Apply tabs
  if (message.type === "FORCE_CLOSE_ALL_EASY_APPLY_TABS") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({});
        const easyApplyTabs = tabs.filter(tab => 
          tab.url && (
            tab.url.includes('smartapply.indeed.com') || 
            tab.url.includes('us.smartapply.indeed.com')
          )
        );
        
        console.log("[Background] Closing", easyApplyTabs.length, "Easy Apply tabs");
        
        const closePromises = easyApplyTabs.map(tab => {
          pendingEasyApplyTabs.delete(tab.id); // Clean up tracking
          return chrome.tabs.remove(tab.id).catch(error => {
            console.error("[Background] Error closing tab", tab.id, ":", error);
          });
        });
        
        await Promise.all(closePromises);
        sendResponse({ success: true, closedTabs: easyApplyTabs.length });
      } catch (error) {
        console.error("[Background] Error closing Easy Apply tabs:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // ENHANCED: Handle pause automation
  if (message.type === "PAUSE_AUTO_APPLY") {
    automationState = 'paused';
    console.log("[Background] Automation paused globally");
    
    // Forward pause command to all Indeed tabs
    (async () => {
      try {
        const tabs = await chrome.tabs.query({});
        const indeedTabs = tabs.filter(tab => tab.url && tab.url.includes('indeed.com'));
        
        console.log("[Background] Forwarding pause to", indeedTabs.length, "Indeed tabs");
        
        const promises = indeedTabs.map(tab => 
          chrome.tabs.sendMessage(tab.id, { type: "PAUSE_AUTO_APPLY" }).catch(() => {
            // Ignore errors for tabs without content script
          })
        );
        
        await Promise.all(promises);
        sendResponse({ success: true, message: "Pause forwarded to all tabs" });
      } catch (error) {
        console.error("[Background] Error forwarding pause:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // ENHANCED: Handle resume automation
  if (message.type === "RESUME_AUTO_APPLY") {
    automationState = 'running';
    console.log("[Background] Automation resumed globally");
    
    // Forward resume command to all Indeed tabs
    (async () => {
      try {
        const tabs = await chrome.tabs.query({});
        const indeedTabs = tabs.filter(tab => tab.url && tab.url.includes('indeed.com'));
        
        console.log("[Background] Forwarding resume to", indeedTabs.length, "Indeed tabs");
        
        const promises = indeedTabs.map(tab => 
          chrome.tabs.sendMessage(tab.id, { type: "RESUME_AUTO_APPLY" }).catch(() => {
            // Ignore errors for tabs without content script
          })
        );
        
        await Promise.all(promises);
        sendResponse({ success: true, message: "Resume forwarded to all tabs" });
      } catch (error) {
        console.error("[Background] Error forwarding resume:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // ENHANCED: Handle stop automation
  if (message.type === "STOP_AUTO_APPLY") {
    automationActive = false;
    automationState = 'idle';
    currentUserEmail = null;
    console.log("[Background] Automation stopped globally, cleared user data");
    
    // Clear pending tab tracking
    pendingEasyApplyTabs.clear();
    
    // Reset orchestrator resume flag for next session
    orchestratorResumeMessageSent = false;
    
    // Forward stop command to all Indeed tabs AND close Easy Apply tabs
    (async () => {
      try {
        const tabs = await chrome.tabs.query({});
        const indeedTabs = tabs.filter(tab => tab.url && tab.url.includes('indeed.com'));
        const easyApplyTabs = tabs.filter(tab => 
          tab.url && (
            tab.url.includes('smartapply.indeed.com') || 
            tab.url.includes('us.smartapply.indeed.com')
          )
        );
        
        console.log("[Background] Forwarding stop to", indeedTabs.length, "Indeed tabs");
        console.log("[Background] Closing", easyApplyTabs.length, "Easy Apply tabs");
        
        // Forward stop messages
        const stopPromises = indeedTabs.map(tab => 
          chrome.tabs.sendMessage(tab.id, { type: "STOP_AUTO_APPLY" }).catch(() => {
            // Ignore errors for tabs without content script
          })
        );
        
        // Close Easy Apply tabs
        const closePromises = easyApplyTabs.map(tab => 
          chrome.tabs.remove(tab.id).catch(() => {
            // Ignore errors for already closed tabs
          })
        );
        
        await Promise.all([...stopPromises, ...closePromises]);
        sendResponse({ 
          success: true, 
          message: "Stop forwarded to all tabs", 
          closedTabs: easyApplyTabs.length 
        });
      } catch (error) {
        console.error("[Background] Error forwarding stop:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Fetch user profile from Firestore
  if (message.type === "FETCH_USER_DOC") {
    (async () => {
      try {
        const userDocRef = doc(db, "users", message.email);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          // CRITICAL: Store in chrome.storage.local first
          await chrome.storage.local.set({
            [`user_profile_${message.email}`]: userData
          });
          console.log("[Background] Stored profile in chrome.storage for:", message.email);
          console.log("[Background] Salary value:", userData.preferred_salary);
          // Now send minimal success response
          sendResponse({ success: true, data: userData }); // <-- FIXED: send 'data' not just 'cached'
        } else {
          sendResponse({ success: false, error: "User not found" });
        }
      } catch (error) {
        console.error("[Background] Firebase error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Log progress to Firestore
  if (message.type === "LOG_PROGRESS_UPDATE") {
    (async () => {
      try {
        const logsRef = collection(db, "users", message.email, "logs");
        await addDoc(logsRef, {
          message: message.message,
          timestamp: message.timestamp || Date.now(),
          type: "progress_update"
        });
        sendResponse({ success: true });
      } catch (error) {
        console.error("[Background] Error logging progress:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Application completion handler
  if (message.type === "APPLICATION_COMPLETED") {
    (async () => {
      try {
        console.log("[Background] Application completed for:", message.email);
        // Send JOB_DONE to orchestrator FIRST (if registered)
        if (orchestratorTabId) {
          try {
            await chrome.tabs.sendMessage(orchestratorTabId, { type: 'JOB_DONE' });
            console.log('[Background] Sent JOB_DONE to orchestrator tab:', orchestratorTabId);
          } catch (error) {
            console.error('[Background] Failed to send JOB_DONE to orchestrator:', error);
            orchestratorTabId = null; // Clear stale reference
          }
        } else {
          console.warn('[Background] No orchestrator registered - cannot send JOB_DONE');
        }
        // Then close the Easy Apply tab
        if (message.closeTabNow && message.tabId) {
          try {
            await chrome.tabs.remove(message.tabId);
            console.log('[Background] Closed Easy Apply tab:', message.tabId);
          } catch (error) {
            console.log('[Background] Could not close tab:', error.message);
          }
        }
        // Finally update database (don't block on this)
        const completionKey = message.completionKey;
        const processedKey = `processed_${completionKey}`;
        const alreadyProcessed = await new Promise(resolve => {
          chrome.storage.local.get([processedKey], result => resolve(result[processedKey]));
        });
        if (!alreadyProcessed) {
          chrome.storage.local.set({ [processedKey]: Date.now() });
          const userDocRef = doc(db, "users", message.email);
          await updateDoc(userDocRef, {
            free_uses_left: increment(-1),
            total_applications: increment(1)
          });
          const logsRef = collection(db, "users", message.email, "logs");
          await addDoc(logsRef, {
            message: "Application submitted successfully",
            timestamp: Date.now(),
            type: "application_completion"
          });
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error("[Background] Error handling application completion:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Application flow complete
  if (message.type === "APPLICATION_FLOW_COMPLETE") {
    automationActive = false;
    automationState = 'idle';
    console.log("[Background] Application flow complete, automation inactive");
    sendResponse({ success: true });
    return true;
  }

  // ENHANCED: Handle automation state messages from content scripts
  if (message.type === "AUTOMATION_PAUSED") {
    automationState = 'paused';
    console.log("[Background] Automation paused by content script");
    
    // Forward to popup if it's open
    chrome.runtime.sendMessage(message).catch(() => {
      // Ignore if popup is closed
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "AUTOMATION_RESUMED") {
    automationState = 'running';
    console.log("[Background] Automation resumed by content script");
    
    // Forward to popup if it's open
    chrome.runtime.sendMessage(message).catch(() => {
      // Ignore if popup is closed
    });
    sendResponse({ success: true });
    return true;
  }

  // Fetch resume file from Firebase Storage
  if (message.type === "FETCH_RESUME_FILE") {
    (async () => {
      try {
        const url = message.resumeUrl;
        if (!url) throw new Error("resumeUrl is required");

        console.log("[Background] Fetching resume from:", url);

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to fetch resume file: ${res.status}`);

        const contentType = res.headers.get("content-type") || "application/pdf";
        const ab = await res.arrayBuffer();
        const base64 = arrayBufferToBase64(ab);

        let filename = message.filename || "resume.pdf";

        console.log("[Background] Resume fetched successfully:", filename);
        sendResponse({
          success: true,
          base64,
          mimeType: contentType,
          filename
        });
      } catch (error) {
        console.error("[Background] Error fetching resume:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Get user stats
  if (message.type === "GET_USER_STATS") {
    (async () => {
      try {
        const userDocRef = doc(db, "users", message.email);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const stats = {
            free_uses_left: userData.free_uses_left || 0,
            total_applications: userData.total_applications || 0,
            plan_type: userData.plan_type || 'free'
          };
          sendResponse({ success: true, data: stats });
        } else {
          sendResponse({ success: false, error: "User not found" });
        }
      } catch (error) {
        console.error("[Background] Error getting user stats:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // Forward status updates to popup
  if (message.type === "STATUS_UPDATE") {
    // Forward to all tabs (popup will receive it)
    chrome.runtime.sendMessage(message).catch(() => {
      // Ignore errors if popup is closed
    });
    sendResponse({ success: true });
    return true;
  }

  // Get current tab ID for content scripts
  if (message.type === "GET_CURRENT_TAB_ID") {
    sendResponse({ id: sender.tab?.id });
    return true;
  }

  if (message.type === 'REGISTER_ORCHESTRATOR') {
    orchestratorTabId = message.tabId;
    console.log('[Background] Registered orchestrator tabId:', orchestratorTabId);
    sendResponse({ success: true });
    return true;
  }

  // Unknown message type
  console.warn("[Background] Unknown message type:", message.type);
  sendResponse({ success: false, error: "Unknown message type" });
  return false;
});

// CRITICAL: Send tab opening confirmation to content scripts when Easy Apply tab loads
async function sendTabOpeningConfirmation(tabId, jobTitle) {
  console.log("[Background] Sending tab opening confirmation for tab", tabId, "job:", jobTitle);
  
  try {
    // Get all tabs to send the confirmation message
    const tabs = await chrome.tabs.query({});
    const indeedTabs = tabs.filter(tab => 
      tab.url && tab.url.includes('indeed.com') && !tab.url.includes('smartapply')
    );
    
    console.log("[Background] Sending EASY_APPLY_TAB_OPENED to", indeedTabs.length, "Indeed tabs");
    
    // Send confirmation message to all Indeed tabs (content scripts waiting for this)
    const promises = indeedTabs.map(tab => 
      chrome.tabs.sendMessage(tab.id, {
        type: "EASY_APPLY_TAB_OPENED",
        tabId: tabId,
        jobTitle: jobTitle,
        timestamp: Date.now()
      }).catch(error => {
        console.log("[Background] Failed to send confirmation to tab", tab.id, ":", error.message);
      })
    );
    
    await Promise.all(promises);
    console.log("[Background] Tab opening confirmation sent to all Indeed tabs");
    
  } catch (error) {
    console.error("[Background] Error sending tab opening confirmation:", error);
  }
}

// NEW: Wait for tab to complete loading
async function waitForTabComplete(tabId, maxWait = 15000) {
  console.log("[Background] Waiting for tab", tabId, "to complete loading...");
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkTabStatus = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      
      try {
        const tab = await chrome.tabs.get(tabId);
        
        if (tab.status === 'complete' && tab.url && 
            (tab.url.includes('smartapply.indeed.com') || tab.url.includes('us.smartapply.indeed.com'))) {
          
          clearInterval(checkTabStatus);
          console.log("[Background] Tab", tabId, "loaded successfully (", elapsed, "ms)");
          resolve(true);
        } else if (elapsed >= maxWait) {
          clearInterval(checkTabStatus);
          console.error("[Background] Tab", tabId, "load timeout (", elapsed, "ms)");
          resolve(false);
        }
      } catch (error) {
        clearInterval(checkTabStatus);
        console.error("[Background] Tab", tabId, "no longer exists:", error);
        resolve(false);
      }
    }, 1000);
  });
}

// NEW: Monitor application completion
async function monitorApplicationCompletion(tabId, jobTitle, maxWait = 120000) {
  console.log("[Background] Monitoring application completion for", jobTitle, "in tab", tabId);
  const startTime = Date.now();
  return new Promise((resolve) => {
    const checkCompletion = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      try {
        const tab = await chrome.tabs.get(tabId);
        // Check for completion URLs
        if (tab.url && (
          tab.url.includes('application-submitted') ||
          tab.url.includes('thank-you') ||
          tab.url.includes('confirmation') ||
          tab.url.includes('success') ||
          tab.url.includes('/review') // ADD THIS - review page means ready to submit
        )) {
          clearInterval(checkCompletion);
          console.log("[Background] Application completed for", jobTitle);
          // Clean up and close tab
          pendingEasyApplyTabs.delete(tabId);
          await chrome.tabs.remove(tabId);
          resolve(true);
          return;
        }
        if (elapsed >= maxWait) {
          clearInterval(checkCompletion);
          resolve(false);
        }
      } catch (error) {
        clearInterval(checkCompletion);
        resolve(true);
      }
    }, 1000); // Check every second
  });
}

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(ab) {
  const bytes = new Uint8Array(ab);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// NEW: Helper function to send the resume message to all Indeed tabs
// Fix 1: Add aggressive retry logic and broaden delivery
async function sendPhase1DoneMessage() {
  const tabs = await chrome.tabs.query({});
  const indeedTabs = tabs.filter(tab => 
    tab.url && 
    tab.url.includes('indeed.com') && 
    !tab.url.includes('smartapply')
    // Removed the job search URL requirement
  );

  console.log(`[Background] ðŸ”¥ FORCING PHASE_1_DONE delivery to ${indeedTabs.length} Indeed tabs`);

  const promises = indeedTabs.map(async (tab) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "PHASE_1_DONE" });
        console.log(`[Background] âœ… PHASE_1_DONE sent successfully to tab ${tab.id} (attempt ${attempt + 1})`);
        return; // Success, exit retry loop
      } catch (error) {
        console.log(`[Background] âŒ Attempt ${attempt + 1} failed for tab ${tab.id}: ${error.message}`);
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        }
      }
    }
    console.log(`[Background] âŒ All retries failed for tab ${tab.id}`);
  });

  await Promise.all(promises);
}

// Add this function to background.js
async function waitForPageReadiness(tabId, maxWait = 15000) {
  console.log("[Background] Waiting for page readiness in tab", tabId);
  const startTime = Date.now();
  return new Promise((resolve) => {
    const checkReadiness = setInterval(async () => {
      try {
        const elapsed = Date.now() - startTime;
        // Execute a simple script to check if page is interactive
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            return {
              readyState: document.readyState,
              hasBody: !!document.body,
              hasInputs: document.querySelectorAll('input, button, select').length > 0,
              url: window.location.href
            };
          }
        });
        const pageInfo = results[0].result;
        if (pageInfo.readyState === 'complete' && 
            pageInfo.hasBody && 
            pageInfo.hasInputs && 
            (pageInfo.url.includes('smartapply') || pageInfo.url.includes('indeed'))) {
          clearInterval(checkReadiness);
          console.log("[Background] Page is ready for automation (", elapsed, "ms)");
          resolve(true);
        } else if (elapsed >= maxWait) {
          clearInterval(checkReadiness);
          console.log("[Background] Page readiness timeout (", elapsed, "ms)");
          resolve(false);
        }
      } catch (error) {
        // Tab might not be ready yet, continue checking
      }
    }, 1000);
  });
}

// ENHANCED Tab Update Handler with orchestrator state recovery
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act when tab finishes loading
  if (changeInfo.status !== 'complete') return;
  
  // Check if it's an Easy Apply page
  const isEasyApplyPage = tab.url && (
    tab.url.includes('smartapply.indeed.com') || 
    tab.url.includes('us.smartapply.indeed.com')
  );
  
  // Fix 3: Expand Indeed page detection to ALL Indeed pages except smartapply
  const isIndeedPage = tab.url && 
                       tab.url.includes('indeed.com') && 
                       !tab.url.includes('smartapply');

  if (isEasyApplyPage) {
    // REPLACED: SMART duplicate prevention - now URL-based, 10s window, fail-safe
    console.log("[Background] Easy Apply page detected:", tab.url);
    // --- Duplicate prevention block removed as per Fix 4 ---
    // ALWAYS load fresh state and send message
    const storageResult = await chrome.storage.local.get(['automation_runtime_state']);
    const runtimeState = storageResult.automation_runtime_state;
    if (runtimeState) {
      currentUserEmail = runtimeState.currentUserEmail;
      currentJobCount = runtimeState.currentJobCount;
      automationActive = runtimeState.automationActive;
      automationState = runtimeState.automationState;
      console.log("[Background] Refreshed state from storage:", runtimeState);
    }
    console.log(`[Background] Processing Easy Apply page in tab ${tabId}`);
    // FORCE message sending if we have email
    if (currentUserEmail) {
      console.log("[Background] FORCING RUN_PHASE1_AUTOFILL message to tab", tabId);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
        // Send with shorter delay and better error handling
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, {
            type: "RUN_PHASE1_AUTOFILL",
            email: currentUserEmail,
            jobCount: currentJobCount,
            url: tab.url,
            timestamp: Date.now()
          }).then(() => {
            console.log(`[Background] Ã¢Å“â€¦ RUN_PHASE1_AUTOFILL sent successfully to tab ${tabId}`);
          }).catch(error => {
            console.error(`[Background] Ã¢ÂÅ’ FAILED to send RUN_PHASE1_AUTOFILL to tab ${tabId}:`, error);
            // Retry once after 2 seconds
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, {
                type: "RUN_PHASE1_AUTOFILL",
                email: currentUserEmail,
                jobCount: currentJobCount
              }).catch(retryError => {
                console.error(`[Background] Ã¢ÂÅ’ RETRY FAILED for tab ${tabId}:`, retryError);
              });
            }, 2000);
          });
        }, 2000); // Reduced delay
      } catch (error) {
        console.error("[Background] Script injection failed:", error);
      }
    } else {
      console.error("[Background] Ã¢ÂÅ’ NO EMAIL - cannot send RUN_PHASE1_AUTOFILL");
      console.error("[Background] State check:", { currentUserEmail, automationActive, automationState });
    }
  }
  // For ALL regular Indeed pages, inject content script for potential state resumption
  else if (isIndeedPage) {
    console.log("[Background] Indeed page detected, ensuring content script:", tabId);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      console.log("[Background] Content script injected into Indeed page");
    } catch (error) {
      // Ignore injection errors for regular pages
      console.log("[Background] Content script injection failed (may already exist):", error.message);
    }
    // Only send RESUME_ORCHESTRATOR to the FIRST tab that loads (designated orchestrator)
    /*
    chrome.storage.local.get(['orchestrator_state'], (result) => {
      const state = result.orchestrator_state;
      if (state && state.isRunning && !orchestratorResumeMessageSent) {
        orchestratorResumeMessageSent = true; // Set flag IMMEDIATELY to prevent other tabs
        console.log(`[Background] Designating tab ${tabId} as the single orchestrator`);
        // Only send to THIS specific tab (first one to load)
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, {
            type: "RESUME_ORCHESTRATOR",
            orchestratorState: state
          }).catch(error => {
            console.error(`[Background] Failed to send RESUME_ORCHESTRATOR to designated tab ${tabId}:`, error);
          });
        }, 3000);
      } else if (state && state.isRunning && orchestratorResumeMessageSent) {
        console.log(`[Background] Tab ${tabId} ignored - orchestrator already designated to another tab`);
      }
    });
    */
  }
});

// ENHANCED Tab Creation Handler with state awareness
chrome.tabs.onCreated.addListener((tab) => {
  console.log("[Background] New tab created:", tab.id);
  
  // Only monitor for Easy Apply tabs if automation is active and running
  if (currentUserEmail && automationActive && automationState === 'running') {
    console.log("[Background] Automation is active, monitoring new tab for Easy Apply content");
    
    // Check the tab URL after it loads
    setTimeout(async () => {
      try {
        const updatedTab = await chrome.tabs.get(tab.id);
        
        if (updatedTab.url && (
          updatedTab.url.includes('smartapply.indeed.com') || 
          updatedTab.url.includes('us.smartapply.indeed.com')
        )) {
          console.log("[Background] New Easy Apply tab detected, preparing Phase 1");
          
          // This will be handled by the onUpdated listener when the page finishes loading
        }
      } catch (error) {
        console.error("[Background] Error checking new tab:", error);
      }
    }, 2000);
  } else if (automationState === 'paused') {
    console.log("[Background] Automation is paused, not monitoring new tabs");
  }
});

// ENHANCED: Tab removal handler to clean up pending tabs
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // Clean up any pending Easy Apply tab tracking
  if (pendingEasyApplyTabs.has(tabId)) {
    const tabInfo = pendingEasyApplyTabs.get(tabId);
    console.log(`[Background] Easy Apply tab ${tabId} closed for job: ${tabInfo.jobTitle}`);
    pendingEasyApplyTabs.delete(tabId);
    // IMMEDIATELY send PHASE_1_DONE when Easy Apply tab closes
    console.log(`[Background] Sending PHASE_1_DONE due to tab closure`);
    sendPhase1DoneMessage();
  }
  // ALSO check if ANY Easy Apply tab closed (even if not tracked)
  chrome.tabs.query({}, (tabs) => {
    const easyApplyTabs = tabs.filter(tab => 
      tab.url && (tab.url.includes('smartapply') || tab.url.includes('post-apply'))
    );
    // If we're in active automation and an Easy Apply tab just closed
    if (automationActive && easyApplyTabs.length === 0) {
      console.log(`[Background] Last Easy Apply tab closed, sending PHASE_1_DONE`);
      sendPhase1DoneMessage();
    }
  });
});

// ENHANCED: Reset automation state when extension is disabled/reloaded
chrome.runtime.onStartup.addListener(() => {
  currentUserEmail = null;
  currentJobCount = 1;
  automationActive = false;
  automationState = 'idle';
  pendingEasyApplyTabs.clear();
  orchestratorResumeMessageSent = false; // Reset flag on startup
  console.log("[Background] Extension startup - reset all automation state");
});

chrome.runtime.onInstalled.addListener(() => {
  currentUserEmail = null;
  currentJobCount = 1;
  automationActive = false;
  automationState = 'idle';
  pendingEasyApplyTabs.clear();
  orchestratorResumeMessageSent = false; // Reset flag on install/update
  console.log("[Background] Extension installed/updated - reset all automation state");
});