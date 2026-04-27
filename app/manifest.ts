import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '도트보팅 - 마을 워크숍 의사결정',
    short_name: '도트보팅',
    description: '농어촌 마을 워크숍을 위한 하이브리드 도트보팅 도구. 폰과 종이 스티커가 함께 작동합니다.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1E1A14',
    theme_color: '#1E1A14',
    lang: 'ko',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
    categories: ['productivity', 'utilities', 'social'],
  }
}
