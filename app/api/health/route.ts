import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ヘルスチェック用エンドポイント (Docker の HEALTHCHECK などで使用)。
 * 内部情報やシークレットは一切返さない。
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      app: 'OpenZeta',
      uptime: Math.round(process.uptime()),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
