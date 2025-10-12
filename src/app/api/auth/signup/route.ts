import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDwXqhRgDxWh3KMHvxcxBRy6L4h5imUIqo",
  authDomain: "jobblixor2.firebaseapp.com",
  projectId: "jobblixor2",
  storageBucket: "jobblixor2.firebasestorage.app",
  messagingSenderId: "437887766629",
  appId: "1:437887766629:web:882a686065fd6db189f68c"
};

let app;
try {
  app = getApp();
} catch {
  app = initializeApp(firebaseConfig);
}
const auth = getAuth(app);
const db = getFirestore(app);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, userData } = body;

    let userCredential;
    try {
      // Try sign in first
      userCredential = await signInWithEmailAndPassword(auth, email, password);
    } catch (signInError: any) {
      if (signInError.code === 'auth/user-not-found' || 
          signInError.code === 'auth/wrong-password' || 
          signInError.code === 'auth/invalid-credential') {
        // Create new user
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        throw signInError;
      }
    }

    const user = userCredential.user;
    
    // Save user data to Firestore
    const userDocRef = doc(db, "users", user.uid);
    const existingDoc = await getDoc(userDocRef);
    
    const dataToSave = {
      ...userData,
      email,
      updated_at: new Date().toISOString()
    };

    if (!existingDoc.exists()) {
      dataToSave.created_at = new Date().toISOString();
      dataToSave.free_uses_left = 5;
      dataToSave.plan_id = "free";
    }

    await setDoc(userDocRef, dataToSave, { merge: true });

    // Create email mapping
    await setDoc(doc(db, "email_to_uid", email), {
      uid: user.uid,
      created_at: new Date().toISOString()
    });

    return NextResponse.json({ 
      success: true, 
      uid: user.uid 
    });

  } catch (error: any) {
    console.error('Auth error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 400 });
  }
}