/**
 * 模型配置服务端获取与同步路由
 * @author hubin
 */

import { NextResponse } from 'next/server';
import { getServerModelSettings, setServerModelSettings, AppModelSettings } from '@/lib/modelSettings';

export async function GET() {
  const current = getServerModelSettings();
  // 对敏感密钥做脱敏处理，绝不对外暴露明文 API Key
  const safeSettings = {
    ...current,
    llm: {
      ...current.llm,
      apiKey: current.llm.apiKey ? '••••••••' : '',
    },
    jev: {
      ...current.jev,
      apiKey: current.jev.apiKey ? '••••••••' : '',
    },
  };
  return NextResponse.json(safeSettings);
}

export async function POST(request: Request) {
  try {
    const newSettings = (await request.json()) as AppModelSettings;
    if (newSettings && newSettings.llm) {
      const current = getServerModelSettings();
      // 避免占位符掩码覆盖原有的有效真实密钥
      if (newSettings.jev && newSettings.jev.apiKey === '••••••••') {
        newSettings.jev.apiKey = current.jev.apiKey;
      }
      if (newSettings.llm && newSettings.llm.apiKey === '••••••••') {
        newSettings.llm.apiKey = current.llm.apiKey;
      }
      setServerModelSettings(newSettings);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Invalid settings payload' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update settings' }, { status: 500 });
  }
}
