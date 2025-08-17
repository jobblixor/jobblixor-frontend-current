import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

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

    console.log('Searching for customer with email:', email);

    // Find customer by email
    const customers = await stripe.customers.list({ 
      email: email.trim(),
      limit: 1 
    });
    
    console.log('Customers found:', customers.data.length);
    console.log('Customer data:', customers.data);

    if (customers.data.length === 0) {
      return NextResponse.json({ 
        error: 'No subscription found for this email address. Please make sure you have an active subscription.' 
      }, { status: 404 });
    }

    const customer = customers.data[0];
    console.log('Using customer:', customer.id);

    // Get the origin for return URL
    const origin = request.headers.get('origin') || request.headers.get('host');
    const returnUrl = `${origin}?tab=subscriptions`;

    console.log('Return URL:', returnUrl);

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
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