/** Add `hours` to `HH:mm` (same calendar wrap mod 24h). */
export function addHoursToClockHm(time: string, hours: number): string {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return ''
  const h = Number(m[1])
  const min = Number(m[2])
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return ''
  let total = h * 60 + min + Math.round(hours * 60)
  total = ((total % 1440) + 1440) % 1440
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function photoPendingAlert(photoRequired: boolean, photoUploaded: boolean): string | null {
  if (photoRequired && !photoUploaded) return 'Photo required but not uploaded'
  return null
}
