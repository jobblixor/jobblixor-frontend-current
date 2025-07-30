'use client';

import React, { useState, FormEvent } from "react";
import Image from 'next/image';

// --- NEW: Firebase imports ---
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// --- INSERT YOUR FIREBASE CONFIG BELOW ---
const firebaseConfig = {
  apiKey: "AIzaSyDwXqhRgDxWh3KMHvxcxBRy6L4h5imUIqo",
  authDomain: "jobblixor2.firebaseapp.com",
  projectId: "jobblixor2",
  storageBucket: "jobblixor2.appspot.com",
  messagingSenderId: "437887766629",
  appId: "1:437887766629:web:882a686065fd6db189f68c"
};
// --- END FIREBASE CONFIG ---

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function Page() {
  const tabs = ['home', 'dashboard', 'subscriptions', 'check', 'about'] as const;
  type TabType = typeof tabs[number];
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [emailInput, setEmailInput] = useState('');
  const [applicationCount, setApplicationCount] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [dashboardEmail, setDashboardEmail] = useState('');
  const [dashboardResults, setDashboardResults] = useState<Record<string, unknown>[] | null>(null);
  const [checkingDashboard, setCheckingDashboard] = useState(false);

  // NEW: Response Viewer + submitting state
  const [responseViewer, setResponseViewer] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Dummy/mock data for dashboard
  const mockApplications = [
    { jobTitle: 'Frontend Developer', company: 'TechCorp', link: 'https://example.com/job1' },
    { jobTitle: 'UX Designer', company: 'Designify', link: 'https://example.com/job2' },
    { jobTitle: 'Backend Engineer', company: 'APILogic', link: 'https://example.com/job3' }
  ];

  // --- FORM SUBMISSION: Save to Firebase + localStorage ---
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setResponseViewer(["Submitting your info..."]);

    const formData = new FormData(e.currentTarget);

    // Extract user data from form
    const userData: Record<string, any> = {};
    formData.forEach((value, key) => {
      userData[key] = value;
    });
    const formEmail = (formData.get('email') as string)?.trim();

    if (!formEmail) {
      setResponseViewer(["❌ Please enter a valid email."]);
      setSubmitting(false);
      return;
    }

    try {
      // Save to Firestore
      await setDoc(doc(db, "users", formEmail), userData);
      // Save email to localStorage (for Chrome extension)
      localStorage.setItem("email", formEmail);
      setResponseViewer([
        "✅ Info saved to Jobblixor! You're ready to use the Chrome Extension.",
        "You can now head to Indeed and start auto-applying!"
      ]);
      console.log("Jobblixor: Saved email to localStorage:", formEmail);
    } catch (error) {
      setResponseViewer(["❌ Failed to save info to Jobblixor. Try again."]);
    }

    setSubmitting(false);
  };

  // (no changes to dashboard/check tabs)
  const handleCheckApplications = () => {
    setChecking(true);
    setCheckError('');
    setTimeout(() => {
      setApplicationCount(3); // Just mock data for now
      setChecking(false);
    }, 1000);
  };
  const handleDashboardLookup = () => {
    setCheckingDashboard(true);
    setDashboardResults(null);
    setTimeout(() => {
      setDashboardResults(mockApplications);
      setCheckingDashboard(false);
    }, 1000);
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
            {tab === 'check' ? 'Check Applications' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {activeTab === 'home' && (
        <>
          <section className="w-full py-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold">Automate Your Job Search</h1>
            <p className="mt-4 text-lg md:text-xl max-w-2xl mx-auto">
              Streamline your job application process with AI-powered cover letters and application tracking
            </p>
          </section>

          {/* --- FORM WITH SUBMITTING AND LOG OUTPUT --- */}
          <section className="bg-white/20 backdrop-blur-lg rounded-2xl p-8 w-full max-w-4xl mt-6 text-black shadow-xl">
            <h2 className="text-2xl font-bold text-white text-center mb-2">Automated Job Application Console</h2>
            <p className="text-center text-white mb-6">Enter your information and our AI bot will apply to jobs for you</p>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Job Title', name: 'job_title', placeholder: 'Software Engineer' },
                { label: 'Location', name: 'location', placeholder: 'San Francisco, CA' },
                { label: 'First Name', name: 'first_name', placeholder: 'John' },
                { label: 'Last Name', name: 'last_name', placeholder: 'Doe' },
                { label: 'Phone Number', name: 'phone_number', placeholder: '(123) 456-7890' },
                { label: 'Email', name: 'email', placeholder: 'example@email.com' },
                { label: 'Password', name: 'password', type: 'password', placeholder: '••••••••' },
                { label: 'Confirm Password', name: 'confirm_password', type: 'password', placeholder: '••••••••' },
                { label: 'Preferred Salary', name: 'preferred_salary', placeholder: '120000' },
                { label: 'Number of Jobs (max 5)', name: 'num_jobs', placeholder: '1' },
              ].map(({ label, name, placeholder, type = 'text' }) => (
                <div key={name}>
                  <label className="block text-white mb-1">{label}</label>
                  <input name={name} type={type} placeholder={placeholder} className="w-full p-3 rounded-lg bg-blue-100 text-black" />
                </div>
              ))}
              <div>
                <label className="block text-white mb-1">Resume (PDF)</label>
                <input name="resume" type="file" accept="application/pdf" className="w-full p-3 rounded-lg bg-blue-100 text-black" />
              </div>
              <div>
                <label className="block text-white mb-1">Profile Photo</label>
                <input name="profilePhoto" type="file" accept="image/*" className="w-full p-3 rounded-lg bg-blue-100 text-black" />
              </div>
              <div className="md:col-span-2 flex justify-center">
                <button
                  type="submit"
                  className="mt-4 bg-blue-800 text-white px-8 py-3 rounded-xl shadow-lg hover:bg-blue-900"
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Start Applying"}
                </button>
              </div>
            </form>
          </section>

          <section className="mt-10 w-full max-w-4xl p-6 bg-white/10 backdrop-blur-md rounded-xl text-white">
            <h3 className="text-lg font-semibold mb-2">Response Viewer</h3>
            <p className="text-sm mb-2">View job application results from the automated process</p>
            <div className="bg-gray-100 text-gray-800 p-4 rounded-lg whitespace-pre-line max-h-96 overflow-auto">
              {responseViewer.length === 0
                ? <code>Response will appear here after applying to jobs</code>
                : responseViewer.map((line, i) => <div key={i}>{line}</div>)
              }
            </div>
          </section>

          <section className="text-center mt-16 mb-10">
            <h2 className="text-2xl font-bold">Ready to supercharge your job search?</h2>
            <p className="mt-2">Get started with our free plan or upgrade to a premium subscription for unlimited applications.</p>
            <button className="mt-4 bg-white text-blue-700 px-6 py-3 rounded-xl font-semibold shadow-md hover:shadow-lg">Subscribe Now</button>
          </section>
        </>
      )}

      {activeTab === 'dashboard' && (
        <section className="mt-8 w-full max-w-4xl p-6 bg-white/20 backdrop-blur-lg rounded-xl text-white">
          <h2 className="text-2xl font-bold mb-4">Dashboard</h2>
          <p className="mb-3">Enter your email to view your applied jobs:</p>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <input
              type="email"
              value={dashboardEmail}
              onChange={(e) => setDashboardEmail(e.target.value)}
              placeholder="Enter your email"
              className="flex-1 p-3 rounded-lg bg-blue-100 text-black"
            />
            <button
              onClick={handleDashboardLookup}
              className="bg-blue-800 px-6 py-2 rounded-lg hover:bg-blue-900">
              {checkingDashboard ? 'Loading...' : 'Check Applications'}
            </button>
          </div>
          {dashboardResults && dashboardResults.length > 0 ? (
            <ul className="space-y-4">
              {(dashboardResults as { jobTitle: string; company: string; link: string }[]).map((job, i) => (
                <li key={i} className="bg-white text-black p-4 rounded-lg shadow">
                  <p><strong>{job.jobTitle}</strong> at {job.company}</p>
                  <a href={job.link} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">View Application</a>
                </li>
              ))}
            </ul>
          ) : (
            checkingDashboard ? null : <p>No applications to show yet.</p>
          )}
        </section>
      )}

      {activeTab === 'subscriptions' && (
        <section className="w-full max-w-4xl p-6 bg-white/10 backdrop-blur-md rounded-xl">
          <h2 className="text-2xl font-bold mb-6 text-white text-center">Subscription Plans</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[{ title: 'Starter', price: '$9.99/mo', count: '300' }, { title: 'Pro', price: '$19.99/mo', count: '900' }, { title: 'Elite', price: '$29.99/mo', count: '1500' }].map(plan => (
              <div key={plan.title} className="bg-white text-center text-black p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-bold mb-2">{plan.title}</h3>
                <p className="text-lg mb-1">{plan.price}</p>
                <p className="mb-4">{plan.count} applications/month</p>
                <button className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-800">Select</button>
              </div>
            ))}
          </div>
          <div className="text-center mt-6">
            <button className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700">Cancel Subscription</button>
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
            Instead of spending hours searching, filling out forms, and writing the same details repeatedly, users simply enter their information once &ndash; and Jobblixor takes care of the rest.<br />
            Our system intelligently applies to hundreds of relevant job opportunities on the user&apos;s behalf, tracks application progress, and delivers results faster &mdash; all while saving users time, energy, and stress.<br />
            But Jobblixor isn&apos;t just about convenience. It was created from firsthand experience with the broken job hunt process &ndash; built by someone who lived through it and decided to fix it.<br />
            We believe access to opportunity should be efficient, fair, and frictionless &ndash; whether you&apos;re a recent grad, a career changer, or someone fighting to get noticed. Jobblixor levels the playing field.<br />
            Our mission is simple:<br />
            To empower job seekers with automation, efficiency, and control &ndash; and to give them back their time.
          </p>
        </section>
      )}
    </div>
  );
}


