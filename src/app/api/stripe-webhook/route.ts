import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getDb } from '@/lib/firebaseAdmin';
import Stripe from 'stripe';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = 'nodejs';

async function buffer(readable: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  const reader = readable.getReader();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  
  return Buffer.concat(chunks);
}

export async function POST(request: NextRequest) {
  const body = await buffer(request.body!);
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const db = getDb();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customer = await stripe.customers.retrieve(session.customer as string) as { id: string; email: string };
        
        if (session.mode === 'subscription') {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const lineItem = subscription.items.data[0];
          
          const quotaMap: Record<string, number> = {
            [process.env.PRICE_STARTER!]: 300,
            [process.env.PRICE_PRO!]: 900,
            [process.env.PRICE_ELITE!]: 1500,
          };

          const planMap: Record<string, string> = {
            [process.env.PRICE_STARTER!]: 'starter',
            [process.env.PRICE_PRO!]: 'pro',
            [process.env.PRICE_ELITE!]: 'elite',
          };

          await db.collection('users').doc(customer.email!).set({
            email: customer.email,
            stripe_customer_id: customer.id,
            subscription_status: subscription.status,
            plan_id: planMap[lineItem.price.id] || 'starter',
            price_id: lineItem.price.id,
            application_quota_monthly: quotaMap[lineItem.price.id] || 300,
            applications_used_this_period: 0,
            current_period_end: (subscription as any).current_period_end,
            updated_at: new Date(),
            created_at: new Date(),
          }, { merge: true });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string) as { id: string; email: string };
        const lineItem = subscription.items.data[0];
        
        const quotaMap: Record<string, number> = {
          [process.env.PRICE_STARTER!]: 300,
          [process.env.PRICE_PRO!]: 900,
          [process.env.PRICE_ELITE!]: 1500,
        };

        const planMap: Record<string, string> = {
          [process.env.PRICE_STARTER!]: 'starter',
          [process.env.PRICE_PRO!]: 'pro',
          [process.env.PRICE_ELITE!]: 'elite',
        };

        const userRef = db.collection('users').doc(customer.email!);
        const userDoc = await userRef.get();
        const currentData = userDoc.data();
        
        // Reset usage if period advanced
        const shouldResetUsage = !currentData || 
          currentData.current_period_end !== subscription.current_period_end;

        await userRef.set({
          email: customer.email,
          stripe_customer_id: customer.id,
          subscription_status: subscription.status,
          plan_id: planMap[lineItem.price.id] || 'starter',
          price_id: lineItem.price.id,
          application_quota_monthly: quotaMap[lineItem.price.id] || 300,
          applications_used_this_period: shouldResetUsage ? 0 : (currentData?.applications_used_this_period || 0),
          current_period_end: (subscription as any).current_period_end,
          updated_at: new Date(),
          created_at: currentData?.created_at || new Date(),
        }, { merge: true });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string) as { id: string; email: string };
        
        await db.collection('users').doc(customer.email!).update({
          subscription_status: 'canceled',
          updated_at: new Date(),
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customer = await stripe.customers.retrieve(invoice.customer as string) as { id: string; email: string };
        
        await db.collection('users').doc(customer.email!).update({
          subscription_status: 'past_due',
          updated_at: new Date(),
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}