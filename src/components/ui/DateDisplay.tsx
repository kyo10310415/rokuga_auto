import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface Props {
  date: string | Date
  showTime?: boolean
}

export default function DateDisplay({ date, showTime = true }: Props) {
  const d = typeof date === 'string' ? new Date(date) : date
  
  if (isNaN(d.getTime())) return <span className="text-gray-400">-</span>
  
  const formatted = showTime
    ? format(d, 'M/d (EEE) HH:mm', { locale: ja })
    : format(d, 'M/d (EEE)', { locale: ja })
  
  return <span className="text-sm">{formatted}</span>
}
