import { google } from 'googleapis'
import { getAuthenticatedClient } from './oauth-client'
import { createLogger } from '@/lib/logger'
import { addDays, subMinutes } from 'date-fns'

const log = createLogger({ module: 'calendar-service' })

export interface CalendarEventData {
  id: string
  calendarId: string
  title: string
  description?: string
  startTime: Date
  endTime: Date
  meetLink?: string
  organizerEmail?: string
  attendees?: Array<{ email: string; name?: string }>
  rawData: Record<string, unknown>
}

/**
 * 指定ユーザーの今後のイベントを取得
 * @param userId - ユーザーID
 * @param daysAhead - 何日先まで取得するか（デフォルト: 7日）
 */
export async function fetchUpcomingEvents(
  userId: string,
  daysAhead = 7
): Promise<CalendarEventData[]> {
  const logCtx = createLogger({ module: 'calendar-service', userId })
  
  const { client } = await getAuthenticatedClient(userId)
  const calendar = google.calendar({ version: 'v3', auth: client })
  
  const now = new Date()
  const timeMax = addDays(now, daysAhead)
  
  // 直近のイベントも含めて少し前から取得（処理漏れ防止）
  const timeMin = subMinutes(now, 30)
  
  logCtx.info({ timeMin, timeMax }, 'Calendarイベント取得開始')
  
  const events: CalendarEventData[] = []
  
  // プライマリカレンダーのみスキャン（必要なら複数カレンダー対応可）
  let pageToken: string | undefined
  
  do {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,     // 繰り返しイベントを展開
      orderBy: 'startTime',
      maxResults: 100,
      pageToken,
    })
    
    const items = response.data.items || []
    
    for (const event of items) {
      if (!event.id) continue
      
      // キャンセル済みイベントをスキップ
      if (event.status === 'cancelled') continue
      
      // Google Meetリンクを取得
      const meetLink = event.hangoutLink || 
        event.conferenceData?.entryPoints?.find(
          (ep) => ep.entryPointType === 'video'
        )?.uri
      
      const startTime = event.start?.dateTime
        ? new Date(event.start.dateTime)
        : event.start?.date
          ? new Date(event.start.date + 'T00:00:00')
          : null
      
      const endTime = event.end?.dateTime
        ? new Date(event.end.dateTime)
        : event.end?.date
          ? new Date(event.end.date + 'T23:59:59')
          : null
      
      if (!startTime || !endTime) continue
      
      events.push({
        id: event.id,
        calendarId: 'primary',
        title: event.summary || '(タイトルなし)',
        description: event.description || undefined,
        startTime,
        endTime,
        meetLink: meetLink || undefined,
        organizerEmail: event.organizer?.email,
        attendees: event.attendees?.map((a) => ({
          email: a.email || '',
          name: a.displayName,
        })),
        rawData: event as Record<string, unknown>,
      })
    }
    
    pageToken = response.data.nextPageToken || undefined
  } while (pageToken)
  
  logCtx.info({ count: events.length }, 'Calendarイベント取得完了')
  return events
}

/**
 * 予約スケジュール（Appointment Schedule）経由のイベントか判定
 * 
 * Google Calendar予約スケジュール由来の特徴:
 * - eventType: 'appointmentWindow' または通常のイベントでも可能
 * - 予約者がattendeesに含まれる
 * - 作成ソースが'appointment_slot'
 * 
 * 注意: APIで100%確実に識別する標準フィールドがないため、
 * ヒューリスティックで判定する。
 * 誤判定リスクを考慮し、Meet付きイベント全件を対象とする設計とする。
 */
export function isBookingScheduleEvent(
  event: CalendarEventData
): boolean {
  const raw = event.rawData as {
    eventType?: string
    source?: { title?: string; url?: string }
    extendedProperties?: {
      private?: Record<string, string>
      shared?: Record<string, string>
    }
    guestsCanModify?: boolean
    transparency?: string
  }
  
  // eventTypeが'appointmentWindow'の場合は確実に予約スケジュール由来
  if (raw.eventType === 'appointmentWindow') {
    return true
  }
  
  // sourceにscheduling/appointmentが含まれる場合
  if (raw.source?.url?.includes('scheduling') ||
      raw.source?.url?.includes('appointment')) {
    return true
  }
  
  // extendedPropertiesに予約関連のキーがある場合
  const privateProps = raw.extendedProperties?.private || {}
  const sharedProps = raw.extendedProperties?.shared || {}
  
  if (
    privateProps['appointmentScheduleId'] ||
    sharedProps['appointmentScheduleId'] ||
    privateProps['scheduledBy'] ||
    sharedProps['scheduledBy']
  ) {
    return true
  }
  
  return false
}
