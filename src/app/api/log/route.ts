
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const body = await request.json();
    console.log('[CLIENT LOG]:', body.message);
    return NextResponse.json({ success: true });
}
