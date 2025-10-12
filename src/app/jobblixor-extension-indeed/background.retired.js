import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

// Initialize Firebase in the background
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Listen for messages from content.js
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === "FETCH_USER_DOC") {
    try {
      const userDocRef = doc(db, "users", message.email);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        sendResponse({ success: true, data: userDocSnap.data() });
      } else {
        sendResponse({ success: false, error: "User not found" });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    // This line is needed for async sendResponse:
    return true;
  }
});
