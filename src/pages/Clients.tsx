import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type ClientType = 'business' | 'individual'
type ClientStatus = 'active' | 'waiting' | 'onboarding'
type Program = 'h2a' | 'h2b' | 'eb3'

type Client = {
  id: number
  name: string
  type: ClientType
  industry?: string
  location: string
  primaryContact: string
  status: ClientStatus
  programs: Program[]
  openTasks: number
  lastActivity: string
}

// Shape of one client as the API returns it (snake_case, straight from PostgreSQL)
type ApiClient = {
  id: number
  name: string
  type: ClientType
  industry: string | null
  location: string | null
  status: ClientStatus
  primary_contact: string | null
  primary_email: string | null
  primary_phone: string | null
  programs: string | null // e.g. "h2a, h2b"
  open_tasks: number
}

// What the Add Client form sends to POST /api/clients
type NewClient = {
  name: string
  type: ClientType
  industry: string | null
  location: string
  status: ClientStatus
  primary_contact: string
  programs: Program[]
}

// Converts an API row into the Client shape the table uses
function toClient(row: ApiClient): Client {
  const contact =
    row.type === 'business'
      ? row.primary_contact
      : row.primary_email ?? row.primary_phone

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    industry: row.industry ?? undefined,
    location: row.location ?? '',
    primaryContact: contact ?? '—',
    status: row.status,
    programs: row.programs ? (row.programs.split(', ') as Program[]) : [],
    openTasks: Number(row.open_tasks),
    lastActivity: '—', // not tracked yet
  }
}

// Gets every client from the API
async function fetchClients(): Promise<Client[]> {
  const response = await fetch('/api/clients')
  if (!response.ok) throw new Error(`Server error (${response.status})`)
  const rows = (await response.json()) as ApiClient[]
  return rows.map(toClient)
}

const allPrograms: Program[] = ['h2a', 'h2b', 'eb3']

const programLabels: Record<Program, string> = {
  h2a: 'H-2A',
  h2b: 'H-2B',
  eb3: 'EB-3',
}

const statusLabels: Record<ClientStatus, string> = {
  active: 'Active',
  waiting: 'Waiting on client',
  onboarding: 'Onboarding',
}

type AddClientModalProps = {
  onClose: () => void
  onSave: (client: NewClient) => Promise<void>
}

function AddClientModal({ onClose, onSave }: AddClientModalProps) {
  const [clientType, setClientType] = useState<ClientType>('business')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = new FormData(event.currentTarget)

    const newClient: NewClient = {
      name: String(form.get('name')).trim(),
      type: clientType,
      industry: clientType === 'business' ? String(form.get('industry') ?? '').trim() || null : null,
      location: String(form.get('location')).trim(),
      status: form.get('status') as ClientStatus,
      primary_contact: String(form.get('contact')).trim(),
      programs: form.getAll('programs') as Program[],
    }

    setIsSaving(true)
    setError(null)
    try {
      await onSave(newClient)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the client')
      setIsSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-client-title">
        <div className="modal-header">
          <h3 id="add-client-title">Add client</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-field">
              <span className="form-label">Client type</span>
              <div className="type-toggle">
                <button
                  type="button"
                  className={clientType === 'business' ? 'active' : ''}
                  onClick={() => setClientType('business')}
                >
                  Business
                </button>
                <button
                  type="button"
                  className={clientType === 'individual' ? 'active' : ''}
                  onClick={() => setClientType('individual')}
                >
                  Individual
                </button>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="client-name">
                {clientType === 'business' ? 'Company name' : 'Full name'}
              </label>
              <input id="client-name" name="name" type="text" required autoFocus />
            </div>

            {clientType === 'business' && (
              <div className="form-field">
                <label htmlFor="client-industry">Industry</label>
                <input id="client-industry" name="industry" type="text" placeholder="e.g. Agriculture" />
              </div>
            )}

            <div className="form-field">
              <label htmlFor="client-location">Location</label>
              <input id="client-location" name="location" type="text" placeholder="City, State" required />
            </div>

            <div className="form-field">
              <label htmlFor="client-contact">
                {clientType === 'business' ? 'Primary contact' : 'Email or phone'}
              </label>
              <input id="client-contact" name="contact" type="text" required />
            </div>

            <fieldset className="form-field program-options">
              <legend className="form-label">Programs</legend>
              {allPrograms.map((program) => (
                <label className="checkbox-option" key={program}>
                  <input type="checkbox" name="programs" value={program} />
                  {programLabels[program]}
                </label>
              ))}
            </fieldset>

            <div className="form-field">
              <label htmlFor="client-status">Status</label>
              <select id="client-status" name="status" defaultValue="onboarding">
                <option value="onboarding">Onboarding</option>
                <option value="active">Active</option>
                <option value="waiting">Waiting on client</option>
              </select>
            </div>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="modal-footer">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Add client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [activeProgram, setActiveProgram] = useState<Program | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<ClientType | 'all'>('all')
  const [searchText, setSearchText] = useState('')

  const search = searchText.trim().toLowerCase()

  // The clients to show in the table: a client must pass every filter
  const visibleClients = clients.filter((client) => {
    const matchesProgram = activeProgram === 'all' || client.programs.includes(activeProgram)
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter
    const matchesType = typeFilter === 'all' || client.type === typeFilter
    const matchesSearch =
      search === '' ||
      client.name.toLowerCase().includes(search) ||
      client.primaryContact.toLowerCase().includes(search) ||
      client.location.toLowerCase().includes(search) ||
      (client.industry ?? '').toLowerCase().includes(search)

    return matchesProgram && matchesStatus && matchesType && matchesSearch
  })

  // Load the clients once, when the page opens
  useEffect(() => {
    fetchClients()
      .then(setClients)
      .catch(() => setLoadError('Could not load clients. Is the API running?'))
      .finally(() => setIsLoading(false))
  }, [])

  // Sends the new client to the API (which calls clients_create in the database),
  // then reloads the table so the new client shows up
  async function handleSave(newClient: NewClient) {
    const response = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newClient),
    })

    if (!response.ok) {
      throw new Error(`Could not save the client (${response.status})`)
    }

    setClients(await fetchClients())
    setIsModalOpen(false)
  }

  return (
    <div className="clients-page">

      <div className="page-header">
        <p className="page-description">
          Businesses and individuals you work with, by program.
        </p>

        <button onClick={() => setIsModalOpen(true)}>+ Add Client</button>
      </div>

      <div className="page-toolbar">
        <div className="status-tabs">
          <button
            className={activeProgram === 'all' ? 'status-tab active' : 'status-tab'}
            onClick={() => setActiveProgram('all')}
          >
            All clients <span className="tab-count">{clients.length}</span>
          </button>

          {allPrograms.map((program) => (
            <button
              className={activeProgram === program ? 'status-tab active' : 'status-tab'}
              onClick={() => setActiveProgram(program)}
              key={program}
            >
              {programLabels[program]}{' '}
              <span className="tab-count">
                {clients.filter((client) => client.programs.includes(program)).length}
              </span>
            </button>
          ))}
        </div>

        <div className="toolbar-filters">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ClientStatus | 'all')}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="waiting">Waiting on client</option>
            <option value="onboarding">Onboarding</option>
          </select>

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as ClientType | 'all')}
            aria-label="Filter by client type"
          >
            <option value="all">All types</option>
            <option value="business">Businesses</option>
            <option value="individual">Individuals</option>
          </select>

          <input
            type="text"
            placeholder="Search clients..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            aria-label="Search clients"
          />
        </div>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Programs</th>
              <th>Primary contact</th>
              <th>Status</th>
              <th>Open tasks</th>
              <th>Last activity</th>
            </tr>
          </thead>

          <tbody>
            {visibleClients.map((client) => (
              <tr key={client.id}>
                <td>
                  <div className="client-name">{client.name}</div>
                  <div className="client-meta">
                    {client.type === 'business'
                      ? `Business, ${client.industry ? client.industry + ', ' : ''}${client.location}`
                      : `Individual, ${client.location}`}
                  </div>
                </td>

                <td>
                  <div className="program-tags">
                    {client.programs.map((program) => (
                      <span className={`program-tag program-${program}`} key={program}>
                        {programLabels[program]}
                      </span>
                    ))}
                  </div>
                </td>

                <td>{client.primaryContact}</td>

                <td>
                  <span className={`status-badge status-${client.status}`}>
                    {statusLabels[client.status]}
                  </span>
                </td>

                <td>{client.openTasks}</td>
                <td>{client.lastActivity}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && <p className="empty-state">Loading clients...</p>}
        {loadError && <p className="empty-state">{loadError}</p>}
        {!isLoading && !loadError && visibleClients.length === 0 && (
          <p className="empty-state">No clients match these filters.</p>
        )}
      </div>

      {isModalOpen && (
        <AddClientModal
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
        />
      )}

    </div>
  )
}

export default Clients