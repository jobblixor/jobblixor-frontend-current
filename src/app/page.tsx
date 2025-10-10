/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, FormEvent } from "react";
import Image from 'next/image';

// --- NEW: Firebase imports ---
import { initializeApp, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';


// --- INSERT YOUR FIREBASE CONFIG BELOW ---
const firebaseConfig = {
  apiKey: "AIzaSyDwXqhRgDxWh3KMHvxcxBRy6L4h5imUIqo",
  authDomain: "jobblixor2.firebaseapp.com",
  projectId: "jobblixor2",
  storageBucket: "jobblixor2.firebasestorage.app",
  messagingSenderId: "437887766629",
  appId: "1:437887766629:web:882a686065fd6db189f68c"
};
// --- END FIREBASE CONFIG ---

// --- FIXED: Only initialize Firebase once ---
let app: FirebaseApp;
try {
  app = getApp();
} catch {
  app = initializeApp(firebaseConfig);
}
const db = getFirestore(app);
const auth = getAuth(app);

export default function Page() {
  const tabs = ['home', 'directions', 'subscriptions', 'check', 'about'] as const;
  type TabType = typeof tabs[number];
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [emailInput, setEmailInput] = useState('');
  const [applicationCount, setApplicationCount] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');

  const [showAutoApplyModal, setShowAutoApplyModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [billingEmail, setBillingEmail] = useState('');

  // NEW: Response Viewer + submitting state
  const [responseViewer, setResponseViewer] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // NEW: Stripe functions
  const startCheckout = async (priceId: string) => {
    try {
      console.log('Starting checkout with:', { priceId });
      
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_id: priceId }),
      });
      
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(`Failed to create checkout session: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout. Please try again.');
    }
  };

  const openPortal = async (email: string) => {
    console.log('=== OPENING PORTAL FOR EMAIL ===', email);
    try {
      const response = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      console.log('Portal response status:', response.status);
      const data = await response.json();
      console.log('Portal response data:', data);
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(`Failed to open billing portal: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Portal error:', error);
      alert('Failed to open billing portal. Please try again.');
    }
  };

  const handleSelectPlan = async (planType: 'starter' | 'pro' | 'elite') => {
    const priceIds = {
      starter: 'price_1R4v0mK9JWTYHthMSuE9TM4a',
      pro: 'price_1R4v1yK9JWTYHthMrpXJz3l6',
      elite: 'price_1R4v2sK9JWTYHthMoX4LB2P2'
    };

    startCheckout(priceIds[planType]);
  };

  const handleCancelSubscription = () => {
    console.log('=== MANAGE BILLING CLICKED ===');
    setShowEmailModal(true);
  };

  const handleEmailSubmit = () => {
    console.log('=== EMAIL SUBMIT CLICKED ===', billingEmail);
    
    if (!billingEmail.includes('@') || billingEmail.trim().length < 5) {
      alert('Please enter a valid email address.');
      return;
    }

    setShowEmailModal(false);
    openPortal(billingEmail.trim());
    setBillingEmail('');
  };

  const handleEmailCancel = () => {
    console.log('=== EMAIL CANCEL CLICKED ===');
    setShowEmailModal(false);
    setBillingEmail('');
  };

  // --- FORM SUBMISSION: Save to Firebase + localStorage ---
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  setSubmitting(true);
  setResponseViewer(["Creating/logging in to your account..."]);

  const formData = new FormData(e.currentTarget);
  const formEmail = (formData.get("email") as string)?.trim();
  const formPassword = (formData.get("password") as string)?.trim();

  if (!formEmail || !formPassword) {
    setResponseViewer(["⚠️ Please enter both email and password."]);
    setSubmitting(false);
    return;
  }

  if (formPassword.length < 6) {
    setResponseViewer(["⚠️ Password must be at least 6 characters."]);
    setSubmitting(false);
    return;
  }

  try {
    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, formEmail, formPassword);
      setResponseViewer(["Logged in successfully! Updating your profile..."]);
    } catch (signInError: any) {
      if (signInError.code === 'auth/user-not-found' || signInError.code === 'auth/wrong-password') {
        userCredential = await createUserWithEmailAndPassword(auth, formEmail, formPassword);
        setResponseViewer(["New account created! Setting up your profile..."]);
      } else {
        throw signInError;
      }
    }
    const user = userCredential.user;
    // Now save profile data using UID instead of email
    const userData: Record<string, any> = {};
    formData.forEach((value, key) => {
      if (key !== "resume" && key !== "password") {
        userData[key] = value;
      }
    });
    const existingUserDoc = await getDoc(doc(db, "users", user.uid));
    let existingData: any = {};
    if (existingUserDoc.exists()) {
      existingData = existingUserDoc.data();
    }
    const storage = getStorage(app);
    const resumeFile = formData.get("resume") as File | null;
    let resumeUrl = "";
    if (resumeFile && resumeFile.size > 0) {
      const resumeRef = ref(storage, `resumes/${user.uid}/${resumeFile.name}`);
      await uploadBytes(resumeRef, resumeFile);
      resumeUrl = await getDownloadURL(resumeRef);
      userData["resume"] = resumeUrl;
    } else if (existingData?.resume) {
      userData["resume"] = existingData.resume;
    }
    const nowIso = new Date().toISOString();
    userData.updated_at = nowIso;
    userData.email = formEmail;
    if (!existingUserDoc.exists()) {
      userData.application_count = 0;
      userData.created_at = nowIso;
      userData.free_uses_left = 5;
      userData.plan_id = "free";
      userData.subscription_status = "active";
    } else {
      userData.stripe_customer_id = existingData.stripe_customer_id || null;
      userData.plan_id = existingData.plan_id || "free";
      userData.subscription_status = existingData.subscription_status || "active";
      userData.application_count = existingData.application_count || 0;
      userData.free_uses_left = existingData.free_uses_left || 5;
      userData.created_at = existingData.created_at || nowIso;
      if (existingData.stripe_subscription_id) userData.stripe_subscription_id = existingData.stripe_subscription_id;
      if (existingData.stripe_price_id) userData.stripe_price_id = existingData.stripe_price_id;
    }
    await setDoc(doc(db, "users", user.uid), userData);
    // NEW: Save email_to_uid mapping
    await setDoc(doc(db, "email_to_uid", formEmail), {
      uid: user.uid,
      created_at: nowIso
    });
    localStorage.setItem("jobblixor_uid", user.uid);
    localStorage.setItem("email", formEmail);
    setResponseViewer([
      "✅ Account secured and info saved!",
      "Your data is now protected with your password.",
      "You can now run Jobblixor from Indeed using your email and password."
    ]);
    setShowAutoApplyModal(true);
  } catch (error: any) {
    console.error("Auth error:", error);
    if (error.code === 'auth/email-already-in-use') {
      setResponseViewer(["⚠️ Email already registered. Please sign in or use password reset."]);
    } else if (error.code === 'auth/weak-password') {
      setResponseViewer(["⚠️ Password too weak. Use at least 6 characters."]);
    } else {
      setResponseViewer([`⚠️ Error: ${error.message}`]);
    }
  }
  setSubmitting(false);
};

  // (Check applications from Firebase)
  const handleCheckApplications = async () => {
    if (!emailInput.trim()) {
      setCheckError('Please enter a valid email address.');
      return;
    }
    
    setChecking(true);
    setCheckError('');
    setApplicationCount(null);
    
    try {
      // First get UID from email mapping
      const emailDoc = await getDoc(doc(db, "email_to_uid", emailInput.trim()));
      if (!emailDoc.exists()) {
        setCheckError('No account found with this email address.');
        setChecking(false);
        return;
      }
      const uid = emailDoc.data().uid;
      // Then get user data by UID
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const freeUsesLeft = userData.free_uses_left || 0;
        setApplicationCount(freeUsesLeft);
      } else {
        setCheckError('User data not found.');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setCheckError('Failed to check applications. Please try again.');
    }
    
    setChecking(false);
  };

  return (
    <div className="flex flex-col items-center w-full min-h-screen bg-[rgba(0,123,255,0.7)] text-white">
      <div className="w-full flex justify-center py-6">
        <Image
          src="/jobblixor-logo.png"
          alt="Jobblixor Logo"
          width={192}
          height={48}
          className="w-48 h-auto"
        />
      </div>

      <nav className="flex gap-4 justify-center text-lg font-semibold mb-6 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-full ${activeTab === tab ? 'bg-white text-blue-700' : 'bg-blue-800 hover:bg-blue-900'}`}
          >
            {tab === 'check' ? 'Check Applications' : tab === 'directions' ? 'Directions' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {activeTab === 'home' && (
        <>
          <section className="w-full py-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold">Automate Your Job Search</h1>
            <p className="mt-4 text-lg md:text-xl max-w-2xl mx-auto">
              Streamline your job search with our Chrome extension! Jobblixor applies inside your browser while you browse. Click the directions button to get set up and see how it works. Have questions or feedback? Reach out anytime at jobblixor@gmail.com. I check emails daily.
            </p>
          </section>

          {/* --- FORM WITH SUBMITTING AND LOG OUTPUT --- */}
          <section className="bg-white/20 backdrop-blur-lg rounded-2xl p-8 w-full max-w-4xl mt-6 text-black shadow-xl">
            <h2 className="text-2xl font-bold text-white text-center mb-2">Automated Job Application Console</h2>
            <p className="text-center text-white mb-6">Enter your information and our chrome extension will apply to jobs for you</p>
            <p className="text-center text-white mb-6 text-sm">
              If you'd like to update your preferences at any time, simply re-enter your information in the console. Your previous data will be replaced automatically.<br />
              Please note: any fields left blank will be saved as blank in our system, so be sure to complete all sections you want included.
            </p>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Job Title', name: 'job_title', placeholder: 'Software Engineer', type: 'text' },
                { label: 'Location', name: 'location', placeholder: 'San Francisco, CA', type: 'text' },
                { label: 'Zip Code', name: 'zip_code', placeholder: '12345', type: 'text' },
                { label: 'Street Address', name: 'street_address', placeholder: '123 Main Street', type: 'text' },
                { label: 'First Name', name: 'first_name', placeholder: 'John', type: 'text' },
                { label: 'Last Name', name: 'last_name', placeholder: 'Doe', type: 'text' },
                { label: 'Phone Number', name: 'phone_number', placeholder: '(123) 456-7890', type: 'text' },
                { label: 'Email', name: 'email', placeholder: 'example@email.com', type: 'email' },
                { label: 'Password', name: 'password', type: 'password', placeholder: 'Enter secure password' },
                { label: 'Preferred Salary', name: 'preferred_salary', placeholder: '$80,000', type: 'text' },
                { label: 'Job Title Relevant Experience', name: 'job_title_relevant_experience', placeholder: 'IT Technician', type: 'text' },
                { label: 'Company Relevant Experience', name: 'company_relevant_experience', placeholder: 'Microsoft', type: 'text' },
              ].map(({ label, name, type, placeholder }) => (
                <div key={name}>
                  <label className="block text-white mb-1">{label}</label>
                  <input name={name} type={type || 'text'} placeholder={placeholder} className="w-full p-3 rounded-lg bg-blue-100 text-black" />
                </div>
              ))}

              {/* New fields for extra employer questions */}
              <div>
                <label className="block text-white mb-1">Are you over 18?</label>
                <select name="over_18" className="w-full p-3 rounded-lg bg-blue-100 text-black">
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="block text-white mb-1">Authorized to work in the US?</label>
                <select name="authorized_us" className="w-full p-3 rounded-lg bg-blue-100 text-black">
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="block text-white mb-1">Require Sponsorship?</label>
                <select name="require_sponsorship" className="w-full p-3 rounded-lg bg-blue-100 text-black">
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="block text-white mb-1">Gender</label>
                <select name="gender" className="w-full p-3 rounded-lg bg-blue-100 text-black">
                  <option value="">Select</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="block text-white mb-1">Ethnicity</label>
                <select name="ethnicity" className="w-full p-3 rounded-lg bg-blue-100 text-black">
                  <option value="">Select</option>
                  <option value="not_declared">Not Declared</option>
                  <option value="asian">Asian</option>
                  <option value="black">Black or African American</option>
                  <option value="hispanic">Hispanic or Latino</option>
                  <option value="white">White</option>
                  <option value="native">Native American</option>
                  <option value="pacific">Pacific Islander</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-white mb-1">Years of Experience</label>
                <select name="years_experience" className="w-full p-3 rounded-lg bg-blue-100 text-black">
                  <option value="">Select</option>
                  <option value="0">0</option>
                  <option value="1+">1+</option>
                  <option value="2+">2+</option>
                  <option value="5+">5+</option>
                  <option value="10+">10+</option>
                </select>
              </div>
              <div>
                <label className="block text-white mb-1">Veteran Status</label>
                <select name="veteran_status" className="w-full p-3 rounded-lg bg-blue-100 text-black">
                  <option value="">Select</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="block text-white mb-1">Answer Diversity Questions, or Always Skip?</label>
                <select name="answer_diversity_questions" className="w-full p-3 rounded-lg bg-blue-100 text-black">
                  <option value="">Select</option>
                  <option value="answer">Answer</option>
                  <option value="skip">Always Skip</option>
                </select>
              </div>

              {/* Resume upload field only */}
              <div>
                <label className="block text-white mb-1">Resume (PDF)</label>
                <input name="resume" type="file" accept="application/pdf" className="w-full p-3 rounded-lg bg-blue-100 text-black" />
              </div>
              
              <div className="md:col-span-2 flex justify-center">
                <button
                  type="submit"
                  className="mt-4 bg-blue-800 text-white px-8 py-3 rounded-xl shadow-lg hover:bg-blue-900"
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Save Preferences"}
                </button>
              </div>
            </form>
          </section>

          <section className="mt-10 w-full max-w-4xl p-6 bg-white/10 backdrop-blur-md rounded-xl text-white">
            <h3 className="text-lg font-semibold mb-2">Response Viewer</h3>
            <p className="text-sm mb-2">View job application results from the automated process</p>
            <div className="bg-gray-100 text-gray-800 p-4 rounded-lg whitespace-pre-line max-h-96 overflow-auto">
              {responseViewer.length === 0
                ? <code>When you're ready, fill out the form and click Save Preferences. Your next steps will appear here.</code>
                : responseViewer.map((line, i) => <div key={i}>{line}</div>)
              }
            </div>
          </section>

          <section className="text-center mt-16 mb-10">
            <h2 className="text-2xl font-bold">Ready to supercharge your job search?</h2>
            <p className="mt-2">Try Jobblixor with 5 free applications, then subscribe for up to 3,000 applications monthly.</p>
            <button 
              onClick={() => setActiveTab('subscriptions')}
              className="mt-4 bg-white text-blue-700 px-6 py-3 rounded-xl font-semibold shadow-md hover:shadow-lg"
            >
              Subscribe Now
            </button>
          </section>
        </>
      )}

      {activeTab === 'directions' && (
        <section className="mt-8 w-full max-w-4xl p-8 bg-white/20 backdrop-blur-lg rounded-xl text-white">
          <h2 className="text-3xl font-bold mb-8 text-center">How Jobblixor Works</h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-3">Step 1 - Sign up on Jobblixor</h3>
              <p className="text-lg mb-4">
                Create your account and save your job titles, location, salary range, and resume link.
              </p>
              <p className="text-sm italic text-gray-200">(Stored securely in Jobblixor.)</p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-3">Step 2 - Log in to Indeed</h3>
              <p className="text-lg mb-4">
                Open Indeed in a tab and sign in. Your login stays in your browser and Jobblixor never sees it.
              </p>
              <button 
                onClick={() => window.open('https://indeed.com', '_blank')}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-semibold"
              >
                Open Indeed
              </button>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-3">Step 3 - Install the Chrome Extension</h3>
              <p className="text-lg mb-4">
                Add the Jobblixor extension to Chrome (one-time install).
              </p>
              <button 
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-semibold"
              >
                Install Extension
              </button>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-3">Step 4 - Run it from Indeed (Updated)</h3>
              <p className="text-lg mb-4">
                Open an Indeed job page, click the Jobblixor extension icon, then press Start Auto-Applying.
              </p>
              <p className="text-lg mb-4">
                Keep the job tab open while it runs. You do not need Jobblixor.com open.
              </p>
            </div>
          </div>

          <div className="mt-8 p-6 bg-white/10 rounded-lg">
            <p className="text-lg">
              <strong>Note:</strong> Jobblixor uses your saved preferences from your account and applies to jobs inside your browser while you are logged in.
            </p>
          </div>
        </section>
      )}

      {activeTab === 'subscriptions' && (
        <section className="w-full max-w-4xl p-6 bg-white/10 backdrop-blur-md rounded-xl">
          <h2 className="text-2xl font-bold mb-6 text-white text-center">Subscription Plans</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: 'Starter', price: '$9.99/mo', count: '500', type: 'starter' as const }, 
              { title: 'Pro', price: '$19.99/mo', count: '1500', type: 'pro' as const }, 
              { title: 'Elite', price: '$29.99/mo', count: '3000', type: 'elite' as const }
            ].map(plan => (
              <div key={plan.title} className="bg-white text-center text-black p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-bold mb-2">{plan.title}</h3>
                <p className="text-lg mb-1">{plan.price}</p>
                <p className="mb-4">{plan.count} applications/month</p>
                <button 
                  onClick={() => handleSelectPlan(plan.type)}
                  className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-800"
                >
                  Select
                </button>
              </div>
            ))}
          </div>
          <div className="text-center mt-6">
            <button 
              onClick={handleCancelSubscription}
              className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700"
            >
              Manage Billing
            </button>
          </div>
        </section>
      )}

      {activeTab === 'check' && (
        <section className="mt-8 w-full max-w-xl p-6 bg-white/20 backdrop-blur-lg rounded-xl text-white">
          <h2 className="text-2xl font-bold mb-4">Check Your Application Balance</h2>
          <p className="mb-2">Enter your email to check how many applications you have left.</p>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="Enter your email"
            className="w-full p-3 rounded-lg bg-blue-100 text-black mb-4"
          />
          <button onClick={handleCheckApplications} className="bg-blue-800 px-4 py-2 rounded-md hover:bg-blue-900">
            {checking ? 'Checking...' : 'Check Now'}
          </button>
          {applicationCount !== null && (
            <div className="mt-4 text-lg">You have <strong>{applicationCount}</strong> applications left.</div>
          )}
          {checkError && <div className="mt-4 text-red-300 font-semibold">{checkError}</div>}
        </section>
      )}

      {activeTab === 'about' && (
        <section className="mt-8 w-full max-w-3xl p-6 bg-white/20 backdrop-blur-lg rounded-xl text-white">
          <h2 className="text-2xl font-bold mb-4">About Jobblixor</h2>
          <p>
            Jobblixor is a fully automated job application platform designed to streamline the hiring process for job seekers.<br />
            Instead of spending hours searching, filling out forms, and writing the same details repeatedly, users simply enter their information once and Jobblixor takes care of the rest.<br />
            Our system intelligently applies to hundreds of relevant job opportunities on the users behalf, tracks application progress, and delivers results faster while saving users time, energy, and stress.<br />
            But Jobblixor is not just about convenience. It was created from firsthand experience with the broken job hunt process built by someone who lived through it and decided to fix it.<br />
            We believe access to opportunity should be efficient, fair, and frictionless whether you are a recent grad, a career changer, or someone fighting to get noticed. Jobblixor levels the playing field.<br />
            Our mission is simple:<br />
            To empower job seekers with automation, efficiency, and control and to give them back their time.
          </p>
        </section>
      )}

      {showAutoApplyModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.7)",
          zIndex: 10000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <div style={{
            background: "#fff",
            color: "#222",
            padding: 32,
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            textAlign: "center",
            maxWidth: 400
          }}>
            <h2 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8 }}>
              Your info has been saved!
            </h2>
            <p style={{ fontSize: 18, marginBottom: 20 }}>
              Ready to start auto-applying on Indeed?
            </p>
            <button
              onClick={() => {
                setShowAutoApplyModal(false);
                window.open('https://indeed.com', '_blank');
              }}
              style={{
                background: "#0070f3",
                color: "#fff",
                padding: "14px 32px",
                border: "none",
                borderRadius: 6,
                fontWeight: "bold",
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              Start Auto-Applying
            </button>
          </div>
        </div>
      )}

      {showEmailModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)",
          zIndex: 10000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <div style={{
            background: "#fff",
            color: "#222",
            padding: 32,
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            textAlign: "center",
            maxWidth: 400,
            width: "90%"
          }}>
            <h2 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8 }}>
              Access Billing Portal
            </h2>
            <p style={{ fontSize: 16, marginBottom: 20, color: "#666" }}>
              Enter your email address to manage your subscription
            </p>
            <input
              type="email"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: "100%",
                padding: "12px",
                border: "2px solid #ddd",
                borderRadius: 6,
                fontSize: 16,
                marginBottom: 20,
                outline: "none",
                boxSizing: "border-box"
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleEmailSubmit();
                }
              }}
            />
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={handleEmailCancel}
                style={{
                  background: "#f5f5f5",
                  color: "#333",
                  padding: "12px 24px",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: "bold",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleEmailSubmit}
                style={{
                  background: "#0070f3",
                  color: "#fff",
                  padding: "12px 24px",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: "bold",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}