/** Caller supplies a stable unique ordering. A partial result must never replace a full cache. */
export async function readAllRows<T>(page: (from: number, to: number, signal: AbortSignal) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  const rows: T[] = []
  try {
    for (;;) {
      const { data, error } = await page(rows.length, rows.length + 499, controller.signal)
      if (error) return { data: null, error }
      if (controller.signal.aborted) throw new Error('Read timed out')
      if (!data?.length) return { data: rows, error: null }
      rows.push(...data)
    }
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Read failed' } }
  } finally { clearTimeout(timer) }
}
