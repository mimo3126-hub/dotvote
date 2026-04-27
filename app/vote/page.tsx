import { redirect } from 'next/navigation'

export default function VoteRedirect({
  searchParams,
}: {
  searchParams: { code?: string }
}) {
  const code = (searchParams.code ?? '').trim()
  if (/^\d{4}$/.test(code)) {
    redirect(`/vote/${code}`)
  }
  redirect('/')
}
