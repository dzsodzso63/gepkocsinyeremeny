import { useEffect, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'car-sweepstakes-tickets-v1'
const DEFAULT_TICKETS = [
  { id: 'demo-1', number: '550467611', label: 'Példa szám', status: 'idle' },
]

const emptyDraft = { id: null, label: '', number: '' }

function normalizeNumber(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 12)
}

function formatStatus(status) {
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

function App() {
  const [tickets, setTickets] = useState(() => {
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
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState('')
  const [checkingAll, setCheckingAll] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets))
  }, [tickets])

  const handleDraftChange = (field, value) => {
    setDraft((previous) => ({
      ...previous,
      [field]: value,
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const number = normalizeNumber(draft.number)
    if (!number) {
      setError('Adj meg egy érvényes számot.')
      return
    }

    const nextTicket = {
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
    setError('')
  }

  const handleDelete = (id) => {
    setTickets((previous) => previous.filter((ticket) => ticket.id !== id))
  }

  const handleEdit = (ticket) => {
    setDraft({
      id: ticket.id,
      label: ticket.label,
      number: ticket.number,
    })
    setError('')
  }

  const checkTicket = async (ticket) => {
    const response = await fetch(`/otp-check/${encodeURIComponent(ticket.number)}`)

    if (!response.ok) {
      throw new Error(`A szerver hibát jelzett (${response.status}).`)
    }

    const payload = await response.json()
    const won = Array.isArray(payload?.sweepstakes) && payload.sweepstakes.length > 0

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

    const checkedById = new Map()

    for (const ticket of tickets) {
      try {
        const updatedTicket = {
          ...ticket,
          status: 'checking',
        }
        checkedById.set(ticket.id, updatedTicket)

        const result = await checkTicket(ticket)
        checkedById.set(ticket.id, result)
      } catch (err) {
        checkedById.set(ticket.id, {
          ...ticket,
          status: 'error',
          lastChecked: new Date().toISOString(),
          result: { error: err.message },
        })
      }
    }

    setTickets((previous) =>
      previous.map((ticket) => checkedById.get(ticket.id) ?? ticket),
    )
    setCheckingAll(false)
  }

  const handleCheckSingle = async (ticket) => {
    setError('')

    try {
      const updatedTicker = await checkTicket(ticket)
      setTickets((previous) =>
        previous.map((item) => (item.id === ticket.id ? updatedTicker : item)),
      )
    } catch (err) {
      const failedTicket = {
        ...ticket,
        status: 'error',
        lastChecked: new Date().toISOString(),
        result: { error: err.message },
      }
      setTickets((previous) =>
        previous.map((item) => (item.id === ticket.id ? failedTicket : item)),
      )
      setError(err.message)
    }
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">OTP nyeremény ellenőrzés</p>
            <h1>Gépkocsi nyeremény betétkönyv számok</h1>
          </div>
          <button type="button" className="primary-button" onClick={handleCheckAll} disabled={checkingAll}>
            {checkingAll ? 'Ellenőrzés...' : 'Mindet ellenőrizze'}
          </button>
        </div>

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
              <button type="button" className="ghost-button" onClick={() => setDraft(emptyDraft)}>
                Mégse
              </button>
            )}
          </div>
        </form>

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
                  {ticket.result && ticket.result.sweepstakes && (
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
