import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ message: 'Checkout route exists!' });
}

export async function POST() {
  return NextResponse.json({ message: 'Checkout POST working!' });
}