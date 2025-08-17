import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

// Initialize Stripe directly in the route (more reliable than importing)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET() {
  return NextResponse.json({ message: 'Portal route exists!' });
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    console.log('Portal request for email:', email);

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Check if Stripe secret key is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY not found in environment variables');
      return NextResponse.json({ error: 'Stripe configuration error' }, { status: 500 });
    }

    // Find customer by email
    const customers = await stripe.customers.list({ 
      email: email.trim(),
      limit: 1 
    });
    
    console.log('Found customers:', customers.data.length);

    if (customers.data.length === 0) {
      return NextResponse.json({ 
        error: 'No subscription found for this email address. Please make sure you have an active subscription.' 
      }, { status: 404 });
    }

    const customer = customers.data[0];
    console.log('Customer ID:', customer.id);

    // Get the origin for return URL
    const origin = request.headers.get('origin') || 'https://your-domain.vercel.app';
    const returnUrl = `${origin}?tab=subscriptions`;

    console.log('Creating portal session with return URL:', returnUrl);

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl,
    });

    console.log('Portal session created:', session.id);

    return NextResponse.json({ url: session.url });
    
  } catch (error) {
    console.error('Portal session error:', error);
    
    // More detailed error handling
    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json({ 
        error: `Stripe error: ${error.message}` 
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      error: 'Failed to create portal session. Please try again.' 
    }, { status: 500 });
  }
}