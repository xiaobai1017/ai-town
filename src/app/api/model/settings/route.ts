/**
 * 模型配置服务端获取与同步路由
 * @author hubin
 */

import { NextResponse } from 'next/server';
import { getServerModelSettings, setServerModelSettings, AppModelSettings } from '@/lib/modelSettings';

export async function GET() {
  return NextResponse.json(getServerModelSettings());
}

export async function POST(request: Request) {
  try {
    const newSettings = (await request.json()) as AppModelSettings;
    if (newSettings && newSettings.llm) {
      setServerModelSettings(newSettings);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Invalid settings payload' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update settings' }, { status: 500 });
  }
}
