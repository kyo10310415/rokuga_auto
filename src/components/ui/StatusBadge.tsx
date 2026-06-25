import { JobStatus, DetectionStatus, GoogleAccountStatus } from '@prisma/client'

interface StatusBadgeProps {
  status: JobStatus | DetectionStatus | GoogleAccountStatus | string
  type?: 'job' | 'detection' | 'google'
}

const jobStatusConfig: Record<string, { label: string; className: string }> = {
  PENDING:  { label: '待機中', className: 'badge-gray' },
  RUNNING:  { label: '実行中', className: 'badge-blue' },
  SUCCESS:  { label: '成功', className: 'badge-success' },
  FAILED:   { label: '失敗', className: 'badge-danger' },
  RETRYING: { label: 'リトライ中', className: 'badge-warning' },
  SKIPPED:  { label: 'スキップ', className: 'badge-gray' },
}

const detectionStatusConfig: Record<string, { label: string; className: string }> = {
  DETECTED:          { label: '検知済み', className: 'badge-blue' },
  MEET_PENDING:      { label: 'Meet待ち', className: 'badge-warning' },
  READY:             { label: '補正済み', className: 'badge-success' },
  SKIPPED:           { label: 'スキップ', className: 'badge-gray' },
  CORRECTION_FAILED: { label: '補正失敗', className: 'badge-danger' },
}

const googleStatusConfig: Record<string, { label: string; className: string }> = {
  ACTIVE:        { label: '連携中', className: 'badge-success' },
  TOKEN_EXPIRED: { label: 'トークン期限切れ', className: 'badge-warning' },
  REVOKED:       { label: '取り消し済み', className: 'badge-danger' },
  ERROR:         { label: 'エラー', className: 'badge-danger' },
}

export default function StatusBadge({ status, type = 'job' }: StatusBadgeProps) {
  let config: { label: string; className: string } | undefined
  
  if (type === 'detection') {
    config = detectionStatusConfig[status]
  } else if (type === 'google') {
    config = googleStatusConfig[status]
  } else {
    config = jobStatusConfig[status]
  }
  
  if (!config) {
    return <span className="badge-gray">{status}</span>
  }
  
  return <span className={config.className}>{config.label}</span>
}
