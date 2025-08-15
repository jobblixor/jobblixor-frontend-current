import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebaseAdmin';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const { email, count } = await request.json();

    if (!email || !count || count <= 0) {
      return NextResponse.json({ error: 'Missing or invalid email/count' }, { status: 400 });
    }

    // Optional: JWT verification for additional security
    if (process.env.JWT_SECRET) {
      const authHeader = request.headers.get('authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Missing or invalid token' }, { status: 401 });
      }
      
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET) as { email: string };
        if (decoded.email !== email) {
          return NextResponse.json({ error: 'Token email mismatch' }, { status: 401 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }

    const db = getDb();
    
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(email);
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const userData = userDoc.data()!;
      
      if (userData.subscription_status !== 'active') {
        throw new Error('Subscription not active');
      }

      const currentUsage = userData.applications_used_this_period || 0;
      const quota = userData.application_quota_monthly || 0;
      
      if (currentUsage + count > quota) {
        throw new Error('Quota exceeded');
      }

      transaction.update(userRef, {
        applications_used_this_period: currentUsage + count,
        updated_at: new Date(),
      });

      return { 
        ok: true, 
        remaining: quota - (currentUsage + count),
        used: currentUsage + count,
        quota: quota
      };
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Decrement error:', error);
    
    if ((error as Error).message === 'User not found') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    if ((error as Error).message === 'Subscription not active' || (error as Error).message === 'Quota exceeded') {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}