import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import type { AggregatedResult, Ballot } from '@/lib/types/ballot'

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
    padding: 40,
    fontFamily: 'NanumGothic',
    fontSize: 11,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  header: { borderBottom: '2 solid #1e3a8a', paddingBottom: 12, marginBottom: 18 },
  badge: { fontSize: 9, color: '#666', letterSpacing: 1 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1e3a8a', marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: 14, marginTop: 8, fontSize: 10, color: '#444' },
  section: { marginBottom: 18 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1e3a8a',
    marginBottom: 6,
    paddingBottom: 3,
    borderBottom: '1 solid #e5e7eb',
  },
  questionTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 4 },
  description: { fontSize: 10, color: '#666', marginBottom: 8 },
  resultRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottom: '1 solid #f3f4f6',
    alignItems: 'center',
  },
  rank: { width: 36, fontSize: 11, fontWeight: 'bold', color: '#1e3a8a' },
  resultLabel: { flex: 1, fontSize: 11, paddingRight: 8 },
  resultDots: { fontSize: 11, fontWeight: 'bold', minWidth: 50, textAlign: 'right' },
  channelDots: { fontSize: 9, color: '#666', marginLeft: 8, minWidth: 90, textAlign: 'right' },
  totals: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    fontSize: 11,
  },
  totalsHint: { fontSize: 9, color: '#666', marginTop: 3 },
  notesBox: {
    padding: 12,
    border: '1 solid #d1d5db',
    borderRadius: 4,
    minHeight: 60,
    fontSize: 10,
    lineHeight: 1.6,
  },
  emptyNote: { color: '#9ca3af' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
    borderTop: '1 solid #e5e7eb',
    paddingTop: 6,
  },
})

interface Props {
  topic: string
  roomCode: string
  ballot: Ballot
  results: AggregatedResult[]
  notes: string
  nextSteps: string
  attendees: string
  meetingDateText: string
}

export function MinutesSheetPdf({
  topic,
  roomCode,
  ballot,
  results,
  notes,
  nextSteps,
  attendees,
  meetingDateText,
}: Props) {
  const sumDigital = results.reduce((s, r) => s + r.digital, 0)
  const sumAnalog = results.reduce((s, r) => s + r.analog, 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.badge}>워크숍 회의록</Text>
          <Text style={styles.title}>{topic}</Text>
          <View style={styles.metaRow}>
            <Text>일시 {meetingDateText}</Text>
            <Text>코드 {roomCode}</Text>
            {attendees ? <Text>참여자 {attendees}</Text> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>1. 안건</Text>
          <Text style={styles.questionTitle}>{ballot.title}</Text>
          {ballot.description ? <Text style={styles.description}>{ballot.description}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>2. 도트 투표 결과</Text>
          {results.length === 0 ? (
            <Text style={styles.emptyNote}>(투표 기록 없음)</Text>
          ) : (
            results.map((r, idx) => (
              <View key={r.option_id} style={styles.resultRow}>
                <Text style={styles.rank}>{idx + 1}위</Text>
                <Text style={styles.resultLabel}>{r.label}</Text>
                <Text style={styles.resultDots}>{r.total} 도트</Text>
                <Text style={styles.channelDots}>(폰 {r.digital} · 종이 {r.analog})</Text>
              </View>
            ))
          )}
          <View style={styles.totals}>
            <Text>
              합계: 폰 {sumDigital} + 종이 {sumAnalog} = 총 {sumDigital + sumAnalog} 도트
            </Text>
            <Text style={styles.totalsHint}>1인당 {ballot.total_dots} 도트 기준</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>3. 토론 내용</Text>
          <View style={styles.notesBox}>
            {notes ? (
              <Text>{notes}</Text>
            ) : (
              <Text style={styles.emptyNote}>(기록 없음)</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>4. 다음 단계 / 합의 사항</Text>
          <View style={styles.notesBox}>
            {nextSteps ? (
              <Text>{nextSteps}</Text>
            ) : (
              <Text style={styles.emptyNote}>(기록 없음)</Text>
            )}
          </View>
        </View>

        <Text style={styles.footer}>도트보팅 · {roomCode} · 자동 생성</Text>
      </Page>
    </Document>
  )
}
