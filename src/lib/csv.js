export function csvCell(value) {
  let s = value == null ? '' : String(value)
  // Quoting alone does not stop spreadsheet formula execution.
  let start = 0
  while (start < s.length && (s.charCodeAt(start) <= 32 || /\s/.test(s[start]))) start++
  if ('=+@-'.includes(s[start] || '\0') || /^[\t\r]/.test(s)) s = "'" + s
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function csvText(rows) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') }
