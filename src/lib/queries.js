export async function readAll(makeQuery, signal) {
  const rows = [], size = 200
  for (let offset = 0; ; offset += size) {
    let query = makeQuery().range(offset, offset + size - 1)
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < size) return rows
  }
}
