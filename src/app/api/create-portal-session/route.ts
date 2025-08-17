import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

// Firebase config - same as in your page.tsx
const firebaseConfig = {
  apiKey: "AIzaSyDwXqhRgDxWh3KMHvxcxBRy6L4h5imUIqo",
  authDomain: "jobblixor2.firebaseapp.com",
  projectId: "jobblixor2",
  storageBucket: "jobblixor2.firebasestorage.app",
  messagingSenderId: "437887766629",
  appId: "1:437887766629:web:882a686065fd6db189f68c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Debug environment variables
console.log('STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
console.log('STRIPE_SECRET_KEY starts with sk_:', process.env.STRIPE_SECRET_KEY?.startsWith('sk_'));

// Initialize Stripe with better error handling
let stripe: Stripe;
try {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  console.log('Stripe initialized successfully');
} catch (error) {
  console.error('Failed to initialize Stripe:', error);
  throw error;
}

export async function GET() {
  return NextResponse.json({ message: 'Portal route exists!' });
}

export async function POST(request: NextRequest) {
  console.log('=== PORTAL SESSION REQUEST START ===');
  
  try {
    // Check if Stripe is initialized
    if (!stripe) {
      console.error('Stripe not initialized');
      return NextResponse.json({ error: 'Stripe configuration error' }, { status: 500 });
    }

    const body = await request.json();
    console.log('Request body:', body);
    
    const { email } = body;

    if (!email || !email.includes('@')) {
      console.log('Invalid email provided:', email);
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // First, check if user exists in Firebase
    console.log('Checking Firebase for user:', email);
    const userDoc = await getDoc(doc(db, "users", email.trim()));
    
    if (!userDoc.exists()) {
      console.log('User not found in Firebase');
      return NextResponse.json({ 
        error: 'No account found with this email address.' 
      }, { status: 404 });
    }

    const userData = userDoc.data();
    console.log('Firebase user data:', userData);

    // Check if user has a subscription
    if (!userData.stripe_customer_id) {
      console.log('User has no Stripe customer ID');
      return NextResponse.json({ 
        error: 'No subscription found. Please subscribe to a plan first.' 
      }, { status: 404 });
    }

    console.log('Using Stripe customer ID:', userData.stripe_customer_id);

    // Get the origin for return URL  
    const origin = request.headers.get('origin') || 'https://jobblixor.com';
    const returnUrl = `${origin}/?tab=subscriptions`;

    console.log('Return URL:', returnUrl);

    // Create billing portal session using the stored customer ID
    const session = await stripe.billingPortal.sessions.create({
      customer: userData.stripe_customer_id,
      return_url: returnUrl,
    });

    console.log('Portal session created successfully:', session.id);
    console.log('Portal URL:', session.url);

    return NextResponse.json({ url: session.url });
    
  } catch (error) {
    console.error('=== PORTAL SESSION ERROR ===');
    console.error('Error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // More detailed error handling
    if (error instanceof Stripe.errors.StripeError) {
      console.error('Stripe error type:', error.type);
      console.error('Stripe error message:', error.message);
      return NextResponse.json({ 
        error: `Stripe error: ${error.message}` 
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      error: 'Failed to create portal session. Please try again.',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    console.log('=== PORTAL SESSION REQUEST END ===');
  }
}