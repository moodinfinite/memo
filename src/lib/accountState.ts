// Reset in-memory state synchronously when the authenticated account changes.
const resets = new Set<() => void>()
let accountId: string | null = null
export function registerAccountReset(reset: () => void) { resets.add(reset) }
export function changeAccount(id: string | null) {
  if (id === accountId) return
  accountId = id
  for (const reset of resets) reset()
}
