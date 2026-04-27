import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '도트보팅 - 마을 워크숍 의사결정 도구',
  description: '농어촌 워크숍을 위한 하이브리드 도트보팅 도구. 폰과 종이 스티커가 함께 작동합니다.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#1E1A14',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-white">{children}</body>
    </html>
  )
}
