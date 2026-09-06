import { useEffect, useRef, useState } from 'react'
import './App.css'
import { downloadTicketsAsJson, parseImportedTickets, type Ticket } from './ticketImportExport'

const STORAGE_KEY = 'car-sweepstakes-tickets-v1'
const DEFAULT_TICKETS: Ticket[] = [
  { id: 'demo-1', number: '550467611', label: 'Példa szám', status: 'idle', lastChecked: null, result: null },
]
const OTP_CHECK_API = '/api/otp-check'

type Draft = {
  id: string | null
  label: string
  number: string
}

const emptyDraft: Draft = { id: null, label: '', number: '' }

function normalizeNumber(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, 12)
}

function formatStatus(status?: Ticket['status']) {
  switch (status) {
    case 'won':
      return 'Nyert'
    case 'lost':
      return 'Nem nyert'
    case 'error':
      return 'Hiba'
    case 'checking':
      return 'Ellenőrzés...'
    default:
      return 'Még nincs ellenőrizve'
  }
}

function isSameWeek(dateValue: string, baseDate = new Date()) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) {
    return false
  }

  const base = new Date(baseDate)
  const monday = new Date(base)
  const day = monday.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() + diffToMonday)

  const weekStart = new Date(monday)
  const weekEnd = new Date(monday)
  weekEnd.setDate(weekEnd.getDate() + 7)

  return date >= weekStart && date < weekEnd
}

function App() {
  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)

    if (!saved) {
      return DEFAULT_TICKETS
    }

    try {
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TICKETS
    } catch {
      return DEFAULT_TICKETS
    }
  })
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [error, setError] = useState('')
  const [checkingAll, setCheckingAll] = useState(false)
  const [importText, setImportText] = useState('')
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets))
  }, [tickets])

  const handleDraftChange = (field: keyof Draft, value: string) => {
    setDraft((previous) => ({
      ...previous,
      [field]: value,
    }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const number = normalizeNumber(draft.number)
    if (!number) {
      setError('Adj meg egy érvényes számot.')
      return
    }

    const nextTicket: Ticket = {
      id: draft.id ?? crypto.randomUUID(),
      number,
      label: draft.label.trim() || 'Névtelen',
      status: 'idle',
      lastChecked: null,
      result: null,
    }

    setTickets((previous) => {
      if (draft.id) {
        return previous.map((ticket) =>
          ticket.id === draft.id ? { ...ticket, ...nextTicket } : ticket,
        )
      }

      return [nextTicket, ...previous]
    })

    setDraft(emptyDraft)
    setIsFormOpen(false)
    setError('')
  }

  const handleDelete = (id: string) => {
    setTickets((previous) => previous.filter((ticket) => ticket.id !== id))
  }

  const handleEdit = (ticket: Ticket) => {
    setDraft({
      id: ticket.id,
      label: ticket.label,
      number: ticket.number,
    })
    setIsFormOpen(true)
    setError('')
  }

  const checkTicket = async (ticket: Ticket): Promise<Ticket> => {
    const response = await fetch(`${OTP_CHECK_API}/${encodeURIComponent(ticket.number)}`)

    if (!response.ok) {
      throw new Error(`A szerver hibát jelzett (${response.status}).`)
    }

    const payload = (await response.json()) as Record<string, unknown> & { sweepstakes?: unknown[] }
    const won = Array.isArray(payload.sweepstakes) && payload.sweepstakes.length > 0

    return {
      ...ticket,
      status: won ? 'won' : 'lost',
      lastChecked: new Date().toISOString(),
      result: payload,
    }
  }

  const handleCheckAll = async () => {
    if (tickets.length === 0) {
      setError('Nincs mentett szám a ellenőrzéshez.')
      return
    }

    setCheckingAll(true)
    setError('')

    const checkedById = new Map<string, Ticket>()

    for (const ticket of tickets) {
      try {
        const updatedTicket: Ticket = {
          ...ticket,
          status: 'checking',
        }
        checkedById.set(ticket.id, updatedTicket)

        const result = await checkTicket(ticket)
        checkedById.set(ticket.id, result)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Ismeretlen hiba.'
        checkedById.set(ticket.id, {
          ...ticket,
          status: 'error',
          lastChecked: new Date().toISOString(),
          result: { error: message },
        })
      }
    }

    setTickets((previous) =>
      previous.map((ticket) => checkedById.get(ticket.id) ?? ticket),
    )
    setCheckingAll(false)
  }

  const handleCheckSingle = async (ticket: Ticket) => {
    setError('')

    try {
      const updatedTicker = await checkTicket(ticket)
      setTickets((previous) =>
        previous.map((item) => (item.id === ticket.id ? updatedTicker : item)),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ismeretlen hiba.'
      const failedTicket: Ticket = {
        ...ticket,
        status: 'error',
        lastChecked: new Date().toISOString(),
        result: { error: message },
      }
      setTickets((previous) =>
        previous.map((item) => (item.id === ticket.id ? failedTicket : item)),
      )
      setError(message)
    }
  }

  const handleExport = () => {
    downloadTicketsAsJson(tickets)
    setError('')
  }

  const handleImportText = () => {
    const { tickets: importedTickets, error: importError } = parseImportedTickets(importText)

    if (importError) {
      setError(importError)
      return
    }

    setTickets((previous) => {
      const deduplicated = importedTickets.filter(
        (ticket) => !previous.some((existing) => existing.number === ticket.number),
      )

      return [...deduplicated, ...previous]
    })
    setImportText('')
    setIsImportOpen(false)
    setError('')
  }

  const hasWinnerInList = tickets.some((ticket) => ticket.status === 'won')
  const allCheckedThisWeek =
    tickets.length > 0 && tickets.every((ticket) => ticket.lastChecked && isSameWeek(ticket.lastChecked))

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const { tickets: importedTickets, error: importError } = parseImportedTickets(text)

      if (importError) {
        setError(importError)
        return
      }

      setTickets((previous) => {
        const deduplicated = importedTickets.filter(
          (ticket) => !previous.some((existing) => existing.number === ticket.number),
        )

        return [...deduplicated, ...previous]
      })
      setError('')
    } catch (err) {
      console.error(err)
      setError('A fájl beolvasása sikertelen.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">OTP nyeremény ellenőrzés</p>
            <h1>OTP Gépkocsinyeremény-betét számok</h1>
          </div>
          <button type="button" className="primary-button" onClick={handleCheckAll} disabled={checkingAll}>
            {checkingAll ? 'Ellenőrzés...' : 'Mindet ellenőrizze'}
          </button>
        </div>

        <div className="toolbar-row">
          <div className="mini-summary" aria-live="polite">
            <span className={`mini-pill ${hasWinnerInList ? 'winner' : allCheckedThisWeek ? 'plain' : 'pending'}`}>
              {hasWinnerInList ? 'Van nyertes' : allCheckedThisWeek ? 'Nincs nyertes' : 'Ellenőrzésre vár'}
            </span>
            {allCheckedThisWeek && <span className="mini-check" title="Minden szám ellenőrizve ezen a héten">✓</span>}
          </div>

          <div className="action-buttons-group">
            <button
              type="button"
              className="toggle-form-button"
              onClick={() => {
                if (draft.id) {
                  setIsFormOpen((open) => !open)
                  return
                }
                setIsFormOpen((open) => !open)
                if (!isFormOpen) {
                  setDraft(emptyDraft)
                }
              }}
              aria-label={isFormOpen ? 'Form bezárása' : 'Szám hozzáadása'}
              title={isFormOpen ? 'Form bezárása' : 'Szám hozzáadása'}
            >
              {draft.id ? '✎' : '+'}
            </button>

            <button type="button" className="icon-button import-button" onClick={() => setIsImportOpen((open) => !open)} aria-label="Importálandó adatok megnyitása" title="Importálandó adatok megnyitása">
              ⬇️
            </button>
            <button type="button" className="icon-button export-button" onClick={handleExport} aria-label="Exportálás JSON fájlba" title="Exportálás JSON fájlba">
              ⬆️
            </button>
            <button type="button" className="icon-button" onClick={() => fileInputRef.current?.click()} aria-label="JSON fájl importálása" title="JSON fájl importálása">
              📁
            </button>
            <input ref={fileInputRef} type="file" accept="application/json,.json,.txt" hidden onChange={handleImportFile} />
          </div>
        </div>

        {isFormOpen && (
          <form className="ticket-form" onSubmit={handleSubmit}>
            <label>
              <span>Címke</span>
              <input
                type="text"
                value={draft.label}
                onChange={(event) => handleDraftChange('label', event.target.value)}
                placeholder="Pl. autó, gyűjtés, ..."
              />
            </label>

            <label>
              <span>Betétkönyv szám</span>
              <input
                type="text"
                inputMode="numeric"
                value={draft.number}
                onChange={(event) => handleDraftChange('number', normalizeNumber(event.target.value))}
                placeholder="550467611"
              />
            </label>

            <div className="actions">
              <button type="submit" className="secondary-button">
                {draft.id ? 'Mentés' : 'Szám hozzáadása'}
              </button>
              {draft.id && (
                <button type="button" className="ghost-button" onClick={() => {
                  setDraft(emptyDraft)
                  setIsFormOpen(false)
                }}>
                  Mégse
                </button>
              )}
            </div>
          </form>
        )}

        {isImportOpen && (
          <div className="import-box">
            <label htmlFor="import-text">Import JSON vagy számlista</label>
            <textarea
              id="import-text"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder='[
  {"label": "Autó", "number": "550467611"}
]
 vagy
 550467611
 550467612'
            />
            <button type="button" className="secondary-button" onClick={handleImportText}>
              Importálás
            </button>
          </div>
        )}

        {error && <p className="error-message">{error}</p>}
      </section>

      <section className="panel list-panel">
        <div className="list-header">
          <h2>Mentett számok</h2>
          <span>{tickets.length} db</span>
        </div>

        {tickets.length === 0 ? (
          <p className="empty-state">Még nincs mentett szám.</p>
        ) : (
          <ul className="ticket-list">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="ticket-item">
                <div className="ticket-main">
                  <div>
                    <strong>{ticket.label}</strong>
                    <p>{ticket.number}</p>
                  </div>
                  <span className={`status ${ticket.status ?? 'idle'}`}>
                    {formatStatus(ticket.status)}
                  </span>
                </div>

                <div className="ticket-meta">
                  <small>
                    {ticket.lastChecked
                      ? `Utolsó ellenőrzés: ${new Date(ticket.lastChecked).toLocaleString('hu-HU')}`
                      : 'Még nem ellenőrizték'}
                  </small>
                  {ticket.result && typeof ticket.result === 'object' && 'sweepstakes' in ticket.result && Array.isArray(ticket.result.sweepstakes) && (
                    <small>
                      {ticket.result.sweepstakes.length > 0
                        ? `${ticket.result.sweepstakes.length} nyerési elem`
                        : 'Nincs nyeremény'}
                    </small>
                  )}
                </div>

                <div className="ticket-actions">
                  <button type="button" className="tiny-button" onClick={() => handleCheckSingle(ticket)}>
                    Ellenőrzés
                  </button>
                  <button type="button" className="tiny-button secondary" onClick={() => handleEdit(ticket)}>
                    Szerkesztés
                  </button>
                  <button type="button" className="tiny-button danger" onClick={() => handleDelete(ticket.id)}>
                    Törlés
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default App
