export function normalizeNumber(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, 12)
}

export function sanitizeStatus(status: string | undefined): 'won' | 'lost' | 'error' | 'checking' | 'idle' {
  return ['won', 'lost', 'error', 'checking', 'idle'].includes(status ?? '')
    ? (status as 'won' | 'lost' | 'error' | 'checking' | 'idle')
    : 'idle'
}

function createTicketId(index: number, value: string) {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `ticket-${Date.now()}-${index}-${String(value ?? '').slice(0, 16)}`
}

type ImportedTicketValue = string | number | null | undefined

type ImportedTicketObject = {
  id?: string
  label?: string
  name?: string
  cimke?: string
  number?: ImportedTicketValue
  ticketNumber?: ImportedTicketValue
  betetkonyvszam?: ImportedTicketValue
  value?: ImportedTicketValue
  status?: string
  lastChecked?: string | null
  result?: Record<string, unknown> | null
}

export type Ticket = {
  id: string
  label: string
  number: string
  status: 'won' | 'lost' | 'error' | 'checking' | 'idle'
  lastChecked: string | null
  result: Record<string, unknown> | null
}

function normalizeImportedItem(item: ImportedTicketValue | ImportedTicketObject | null | undefined, index: number): Ticket | null {
  if (typeof item === 'string' || typeof item === 'number') {
    const number = normalizeNumber(item)
    if (!number) {
      return null
    }

    return {
      id: createTicketId(index, number),
      label: `Betétkönyv ${index + 1}`,
      number,
      status: 'idle',
      lastChecked: null,
      result: null,
    }
  }

  if (!item || typeof item !== 'object') {
    return null
  }

  const number = normalizeNumber(
    item.number ?? item.betetkonyvszam ?? item.ticketNumber ?? item.value,
  )

  if (!number) {
    return null
  }

  const label = String(item.label ?? item.name ?? item.cimke ?? '').trim() || `Betétkönyv ${index + 1}`

  return {
    id: item.id ?? createTicketId(index, number),
    label,
    number,
    status: sanitizeStatus(item.status),
    lastChecked: item.lastChecked ?? null,
    result: item.result ?? null,
  }
}

export function parseImportedTickets(rawText: string): { tickets: Ticket[]; error?: string } {
  const text = String(rawText ?? '').trim()

  if (!text) {
    return { tickets: [], error: 'Üres import mező.' }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    const fallbackNumbers = text
      .split(/[\r\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)

    if (fallbackNumbers.length === 0) {
      return { tickets: [], error: 'Nem értelmezhető import adat. Adj meg JSON tömböt vagy számlistát.' }
    }

    const tickets = fallbackNumbers
      .map((item, index) => normalizeImportedItem(item, index))
      .filter((value): value is Ticket => value !== null)

    if (tickets.length === 0) {
      return { tickets: [], error: 'A bevitt számok közül egyik sem érvényes.' }
    }

    return { tickets }
  }

  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { tickets?: unknown[] }).tickets)) {
    parsed = (parsed as { tickets: unknown[] }).tickets
  }

  if (!Array.isArray(parsed)) {
    return { tickets: [], error: 'A JSON tömbnek kell lennie, vagy a számok listájának.' }
  }

  const tickets = parsed
    .map((item, index) => normalizeImportedItem(item as ImportedTicketValue | ImportedTicketObject, index))
    .filter((value): value is Ticket => value !== null)

  if (tickets.length === 0) {
    return { tickets: [], error: 'A bevitt JSON-ben nincs érvényes betétkönyv szám.' }
  }

  return { tickets }
}

export function buildExportPayload(tickets: Ticket[]) {
  return tickets.map((ticket) => ({
    id: ticket?.id ?? null,
    label: String(ticket?.label ?? 'Névtelen').trim() || 'Névtelen',
    number: normalizeNumber(ticket?.number ?? ''),
    status: sanitizeStatus(ticket?.status),
    lastChecked: ticket?.lastChecked ?? null,
    result: ticket?.result ?? null,
  }))
}

export function downloadTicketsAsJson(tickets: Ticket[]) {
  const payload = buildExportPayload(tickets)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'betetkonyv-szamok.json'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
