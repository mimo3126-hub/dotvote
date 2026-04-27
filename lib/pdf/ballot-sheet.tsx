import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer'
import type { Ballot } from '@/lib/types/ballot'

// 한글 폰트: GitHub raw에서 NanumGothic TTF 로드 (cold start 시 1회)
Font.register({
  family: 'NanumGothic',
  fonts: [
    {
      src: 'https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf',
    },
    {
      src: 'https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Bold.ttf',
      fontWeight: 'bold',
    },
  ],
})

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'NanumGothic',
    fontSize: 11,
    backgroundColor: '#ffffff',
  },
  header: {
    borderBottom: '2 solid #1e3a8a',
    paddingBottom: 12,
    marginBottom: 16,
  },
  topic: {
    fontSize: 10,
    color: '#666',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e3a8a',
  },
  description: {
    fontSize: 11,
    color: '#444',
    marginTop: 6,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
  },
  metaLeft: { flex: 1 },
  metaLabel: { fontSize: 9, color: '#666', marginBottom: 2 },
  metaValue: { fontSize: 14, fontWeight: 'bold' },
  qrBox: { width: 90, height: 90, marginLeft: 12 },
  instructions: {
    backgroundColor: '#fef3c7',
    padding: 10,
    marginBottom: 16,
    borderRadius: 4,
    fontSize: 10,
    lineHeight: 1.5,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottom: '1 solid #e5e7eb',
    minHeight: 60,
  },
  optionTextBox: { flex: 1, paddingRight: 12 },
  optionLabel: { fontSize: 14, fontWeight: 'bold', marginBottom: 3 },
  optionDescription: { fontSize: 10, color: '#666' },
  stickerBox: {
    flexDirection: 'row',
    gap: 8,
  },
  sticker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    border: '1.5 dashed #cbd5e1',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    fontSize: 8,
    color: '#999',
    textAlign: 'center',
  },
})

interface Props {
  ballot: Ballot
  topic: string
  roomCode: string
  qrDataUrl: string
  voteUrl: string
}

export function BallotSheetPdf({ ballot, topic, roomCode, qrDataUrl, voteUrl }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.topic}>워크숍 주제: {topic}</Text>
          <Text style={styles.title}>{ballot.title}</Text>
          {ballot.description && <Text style={styles.description}>{ballot.description}</Text>}
        </View>

        <View style={styles.meta}>
          <View style={styles.metaLeft}>
            <Text style={styles.metaLabel}>참여 코드</Text>
            <Text style={styles.metaValue}>{roomCode}</Text>
            <Text style={[styles.metaLabel, { marginTop: 8 }]}>QR 또는 주소</Text>
            <Text style={{ fontSize: 9 }}>{voteUrl}</Text>
            <Text style={[styles.metaLabel, { marginTop: 8 }]}>1인 도트 수</Text>
            <Text style={styles.metaValue}>{ballot.total_dots}개</Text>
          </View>
          {qrDataUrl && <Image src={qrDataUrl} style={styles.qrBox} />}
        </View>

        <View style={styles.instructions}>
          <Text>
            ① 아래 항목 중 가장 중요하다고 생각하는 곳에 스티커를 붙이세요.{'\n'}
            ② 한 항목에 여러 장 붙여도 됩니다. 총 {ballot.total_dots}장만 사용하세요.{'\n'}
            ③ 다 붙인 시트는 진행자에게 제출해주세요.
          </Text>
        </View>

        {ballot.options.map((opt) => (
          <View key={opt.id} style={styles.optionRow}>
            <View style={styles.optionTextBox}>
              <Text style={styles.optionLabel}>{opt.label}</Text>
              {opt.description && <Text style={styles.optionDescription}>{opt.description}</Text>}
            </View>
            <View style={styles.stickerBox}>
              {Array.from({ length: ballot.total_dots }).map((_, i) => (
                <View key={i} style={styles.sticker} />
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.footer}>도트보팅 · {roomCode}</Text>
      </Page>
    </Document>
  )
}
