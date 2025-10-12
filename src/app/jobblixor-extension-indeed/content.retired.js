// == Jobblixor Chrome Extension - content.js ==

import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, addDoc } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- The rest of your code ---

(async function () {
  let userEmail = localStorage.getItem("jobblixor_user_email"); // Store at login
  if (!userEmail) {
    alert("Please log in via jobblixor.com first.");
    return;
  }

  // Fetch user doc from Firestore
  const userDocRef = doc(db, "users", userEmail);
  const userDocSnap = await getDoc(userDocRef);
  if (!userDocSnap.exists()) {
    alert("User data not found! Please finish setup on jobblixor.com.");
    return;
  }
  const user = userDocSnap.data();

  function findJobCards() {
    return Array.from(document.querySelectorAll("a[data-hide-spinner='true']"));
  }

  function isEasilyApply(jobCard) {
    return jobCard.innerText.toLowerCase().includes("easily apply");
  }

  async function autoApply(jobCard) {
    try {
      jobCard.click();
      await new Promise(resolve => setTimeout(resolve, 1000));
      const nameField = document.querySelector("input[name='applicant.name']");
      const emailField = document.querySelector("input[type='email']");
      const phoneField = document.querySelector("input[type='tel']");
      const resumeUpload = document.querySelector("input[type='file']");
      if (nameField) nameField.value = `${user.first_name} ${user.last_name}`;
      if (emailField) emailField.value = user.email;
      if (phoneField) phoneField.value = user.phone;
      if (resumeUpload && user.resumeUrl) {
        // Simulate file upload (not possible via browser JS alone)
      }
      const submitButton = document.querySelector("button[type='submit'], button[aria-label='Submit']");
      if (submitButton) {
        submitButton.click();
      }
      // Add job application record to Firestore
      const jobsColRef = collection(db, "users", userEmail, "applied_jobs");
      await addDoc(jobsColRef, {
        job_title: jobCard.innerText,
        company: "N/A",
        applied_at: new Date().toISOString(),
        status: "applied"
      });
    } catch (err) {
      console.error("Auto-apply failed:", err);
    }
  }

  async function runAutoApply() {
    const jobs = findJobCards().filter(isEasilyApply);
    for (let jobCard of jobs) {
      await autoApply(jobCard);
    }
  }

  if (
    window.location.hostname === "www.indeed.com" &&
    window.location.pathname.startsWith("/jobs")
  ) {
    runAutoApply();
  }
})();


