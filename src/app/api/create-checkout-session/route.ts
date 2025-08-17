import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function GET() {
  return NextResponse.json({ message: 'Checkout route exists!' });
}

export async function POST(request: NextRequest) {
  try {
    const { price_id } = await request.json();

    console.log('Received request:', { price_id });

    if (!price_id) {
      return NextResponse.json({ error: 'Missing price_id' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: `${request.headers.get('origin')}/subscriptions`,
      cancel_url: `${request.headers.get('origin')}/subscriptions`,
      allow_promotion_codes: true,
    });

    console.log('Created session:', session.url);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}