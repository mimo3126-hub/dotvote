import { renderToBuffer } from '@react-pdf/renderer'
import { MinutesSheetPdf } from '@/lib/pdf/minutes-sheet'
import { createClient } from '@/lib/supabase/server'
import type { AggregatedResult, BallotOption, VoteCount } from '@/lib/types/ballot'

export const runtime = 'nodejs'
export const maxDuration = 30

interface MinutesRequest {
  notes?: string
  nextSteps?: string
  attendees?: string
}

function formatKoreanDate(d: Date): string {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = days[d.getDay()]
  const h = d.getHours()
  const min = d.getMinutes().toString().padStart(2, '0')
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${y}년 ${m}월 ${day}일 (${dow}) ${ampm} ${h12}:${min}`
}

export async function POST(
  req: Request,
  { params }: { params: { roomCode: string } },
) {
  let body: MinutesRequest = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const supabase = createClient()

  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .select('id, room_code, topic, created_at')
    .eq('room_code', params.roomCode)
    .single()
  if (roomErr || !room) {
    return new Response('룸을 찾을 수 없습니다', { status: 404 })
  }

  const { data: ballot, error: ballotErr } = await supabase
    .from('ballots')
    .select('title, description, options, total_dots')
    .eq('room_id', room.id)
    .single()
  if (ballotErr || !ballot) {
    return new Response('투표안을 찾을 수 없습니다', { status: 404 })
  }

  const { data: counts } = await supabase
    .from('vote_counts')
    .select('option_id, channel, total_dots, vote_count')
    .eq('room_id', room.id)

  const options = ballot.options as BallotOption[]
  const map = new Map<string, AggregatedResult>(
    options.map((o) => [
      o.id,
      { option_id: o.id, label: o.label, digital: 0, analog: 0, total: 0 },
    ]),
  )
  for (const row of (counts ?? []) as VoteCount[]) {
    const cur = map.get(row.option_id)
    if (!cur) continue
    const dots = Number(row.total_dots ?? 0)
    if (row.channel === 'digital') cur.digital = dots
    else cur.analog = dots
    cur.total = cur.digital + cur.analog
  }
  const results = Array.from(map.values()).sort((a, b) => b.total - a.total)

  const buffer = await renderToBuffer(
    <MinutesSheetPdf
      topic={room.topic}
      roomCode={room.room_code}
      ballot={{
        title: ballot.title,
        description: ballot.description ?? undefined,
        options,
        total_dots: ballot.total_dots,
      }}
      results={results}
      notes={(body.notes ?? '').trim()}
      nextSteps={(body.nextSteps ?? '').trim()}
      attendees={(body.attendees ?? '').trim()}
      meetingDateText={formatKoreanDate(new Date(room.created_at))}
    />,
  )

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="dotvote-minutes-${room.room_code}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
