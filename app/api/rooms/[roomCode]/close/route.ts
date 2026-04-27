import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(
  _req: Request,
  { params }: { params: { roomCode: string } },
) {
  const supabase = createClient()
  const { error } = await supabase
    .from('rooms')
    .update({ is_closed: true, expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString() })
    .eq('room_code', params.roomCode)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
