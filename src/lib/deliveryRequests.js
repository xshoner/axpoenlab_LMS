// Only use for reads or delivery operations whose draft/path makes retries idempotent.
export async function retryDeliveryRequest(operation, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await operation()
      if (result?.error) throw result.error
      return result
    } catch (error) {
      const status = Number(error?.statusCode || error?.status || error?.context?.status)
      const transient = [408, 429, 500, 502, 503, 504].includes(status) ||
        /fetch|network|HTTP 50[0234]|timed?\s*out|timeout|abort/i.test(error?.message || error?.name || '')
      if (!transient || attempt >= 2) throw error
      await wait(1000 * (attempt + 1))
    }
  }
}
