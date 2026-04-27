import { renderToBuffer } from '@react-pdf/renderer'
import { BallotSheetPdf } from '@/lib/pdf/ballot-sheet'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

function qrCodeUrl(text: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`
}

export async function GET(
  _req: Request,
  { params }: { params: { roomCode: string } },
) {
  const supabase = createClient()

  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .select('id, room_code, topic')
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const voteUrl = `${baseUrl}/vote/${room.room_code}`

  const buffer = await renderToBuffer(
    <BallotSheetPdf
      ballot={{
        title: ballot.title,
        description: ballot.description ?? undefined,
        options: ballot.options,
        total_dots: ballot.total_dots,
      }}
      topic={room.topic}
      roomCode={room.room_code}
      qrDataUrl={qrCodeUrl(voteUrl)}
      voteUrl={voteUrl}
    />,
  )

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="dotvote-${room.room_code}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
