import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function GET() {
  return NextResponse.json({ message: 'Checkout route exists!' });
}

export async function POST(request: NextRequest) {
  try {
    const { email, price_id } = await request.json();

    console.log('Received request:', { email, price_id });

    if (!email || !price_id) {
      return NextResponse.json({ error: 'Missing email or price_id' }, { status: 400 });
    }

    // Find or create customer
    const existingCustomers = await stripe.customers.list({ email, limit: 1 });
    let customer;
    
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({ email });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: `${request.headers.get('origin')}/subscriptions?success=true`,
      cancel_url: `${request.headers.get('origin')}/subscriptions`,
    });

    console.log('Created session:', session.url);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}