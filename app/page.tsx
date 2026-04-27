import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-elder-3xl font-bold text-blue-900 mb-3">도트보팅</h1>
          <p className="text-elder-base text-gray-700">
            마을 워크숍에서
            <br />
            함께 결정하는 도구
          </p>
        </div>

        <div className="space-y-4">
          <Link href="/facilitator/new" className="btn-primary block w-full">
            새 워크숍 만들기
          </Link>

          <form action="/vote" method="get" className="bg-white rounded-2xl border-2 border-gray-200 p-6">
            <label htmlFor="code" className="block text-elder-sm text-gray-600 mb-2">
              참여 코드 입력
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              placeholder="0000"
              className="input-large text-center text-elder-3xl tracking-[0.5em] font-bold mb-4"
              required
            />
            <button type="submit" className="btn-secondary w-full">
              투표하러 가기
            </button>
          </form>
        </div>

        <p className="text-xs text-gray-400">
          농어촌 마을공동체를 위한 오픈소스 의사결정 도구
        </p>
      </div>
    </main>
  )
}
