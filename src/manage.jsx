import { useState } from 'react'
import { useStore } from './lib/store.jsx'
import { mkBiz } from './lib/model.js'
import { demoBiz } from './lib/seed.js'
import { Field, Modal, useDialog } from './ui.jsx'
import { useToast } from './toast.jsx'
import { useCloud } from './cloud.jsx'
import { exportJson, mergeBackup, parseBackup } from './lib/backup.js'
import { bizNameTaken, kindSwitchError } from './lib/rules.js'
import { uid } from './lib/format.js'
import { Sec } from './shellui.jsx'

export function Settings() {
  const { S, b, updB } = useStore()
  const { tell } = useDialog()
  const [name, setName] = useState(b.name)
  const [kind, setKind] = useState(b.kind)
  const [sc, setSc] = useState(b.stateCode)
  const [err, setErr] = useState('')
  const dirty = name !== b.name || kind !== b.kind || sc !== b.stateCode

  const save = (e) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setErr('Enter a name for the business.')
    if (bizNameTaken(S.biz, n, b.id)) return setErr(`Another business is already named "${n}". Use a different name.`)
    if (kind !== b.kind) {
      const bad = kindSwitchError(b, kind)
      if (bad) return tell(bad)
    }
    updB((x) => {
      x.name = n
      x.kind = kind
      x.stateCode = sc
    })
    setName(n)
    setErr('')
  }
  return (
    <Sec icon="⚙" title={b.name} hint="Settings for this business">
      <form onSubmit={save}>
        <Field label="Business name">
          <input value={name} onChange={(e) => (setName(e.target.value), setErr(''))} aria-invalid={!!err} />
        </Field>
        {err && <p className="mgr-err" role="alert">{err}</p>}
        <Field label="Business type">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="person">Person based (BILL, cash/GPay and firms)</option>
            <option value="firm">Firm based (firms with GSTIN, bank only)</option>
          </select>
        </Field>
        <Field label="Your GST state code (first 2 digits of your GSTIN)">
          <input value={sc} maxLength={2} onChange={(e) => setSc(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <p className="muted">Sales to a customer with the same state code get CGST + SGST; otherwise IGST.</p>
        <div className="mgr-acts">
          <button className="btn" disabled={!dirty}>Save changes</button>
          {dirty && (
            <button type="button" className="btn ghost" onClick={() => (setName(b.name), setKind(b.kind), setSc(b.stateCode), setErr(''))}>
              Discard
            </button>
          )}
        </div>
      </form>
    </Sec>
  )
}


export function Manage({ onClose }) {
  const { S, upd, b, updB } = useStore()
  const { ask, tell } = useDialog()
  const toast = useToast()
  const cloud = useCloud()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('person')
  const [typed, setTyped] = useState('')
  const [addErr, setAddErr] = useState('')

  const add = (e) => {
    e.preventDefault()
    if (!name.trim()) return setAddErr('Enter a name for the business.')
    if (bizNameTaken(S.biz, name)) return setAddErr(`A business named "${name.trim()}" already exists. Use a different name.`)
    upd((s) => {
      const nb = mkBiz(name.trim(), kind)
      s.biz.push(nb)
      s.cur = nb.id
    })
    onClose()
  }
  const demo = () => {
    const dn = demoBiz().name
    if (bizNameTaken(S.biz, dn)) return setAddErr(`A business named "${dn}" already exists, so the demo data was not added.`)
    upd((s) => {
      const d = demoBiz()
      s.biz.push(d)
      s.cur = d.id
    })
    onClose()
  }
  const [loadingBig, setLoadingBig] = useState(false)
  // 3,000 test records (invoices, purchases, payments...) as a separate business, for trying the app at scale.
  const bigSample = async () => {
    setAddErr('')
    setLoadingBig(true)
    try {
      const { bigSampleBiz } = await import('./lib/sample.js')
      const nb = bigSampleBiz()
      if (bizNameTaken(S.biz, nb.name)) return setAddErr(`A business named "${nb.name}" already exists, so the test records were not added.`)
      upd((s) => {
        s.biz.push(nb)
        s.cur = nb.id
      })
      onClose()
    } finally {
      setLoadingBig(false)
    }
  }
  const reset = () =>
    ask(
      `Reset "${b.name}"? All its entries are cleared and items go back to the defaults.`,
      () => {
        updB((x) => {
          const fresh = mkBiz(x.name, x.kind)
          fresh.id = x.id
          delete x.demo
          Object.assign(x, fresh)
        })
        onClose()
      },
      'Reset',
    )
  const del = () => {
    if (S.biz.length < 2) return tell('You cannot delete the only business.')
    if (typed !== b.name) return tell('Type the business name exactly to confirm.')
    upd((s) => {
      s.biz = s.biz.filter((x) => x.id !== s.cur)
      s.cur = s.biz[0].id
    })
    onClose()
  }

  const doExport = () => {
    const url = URL.createObjectURL(new Blob([exportJson(S)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `ec-commutator-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast.push('Backup file created', 'ok')
  }
  const doImport = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const r = parseBackup(await f.text())
    if (r.error) return toast.push('Import failed: ' + r.error, 'err')
    upd((s) => Object.assign(s, mergeBackup(s, r.S, uid)))
    toast.push(`Imported ${r.S.biz.length} business${r.S.biz.length === 1 ? '' : 'es'}`, 'ok')
  }

  return (
    <Modal title="Businesses" onClose={onClose} wide>
      <div className="mgr">
        <div className="mgr-list" role="group" aria-label="Switch business">
          {S.biz.map((x) => (
            <button key={x.id} type="button" className={'mgr-biz' + (x.id === S.cur ? ' on' : '')} onClick={() => x.id !== S.cur && upd((s) => (s.cur = x.id), { quiet: true })}>
              <span className="avatar" aria-hidden="true">{initials(x.name)}</span>
              <span>
                {x.name}
                <small>{x.kind === 'firm' ? 'Firm based' : 'Person based'}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="mgr-cols">
          <Sec icon="＋" title="Add business" hint="Start a separate set of books">
            <form onSubmit={add}>
              <Field label="Name">
                <input value={name} onChange={(e) => (setName(e.target.value), setAddErr(''))} aria-invalid={!!addErr} />
              </Field>
              {addErr && <p className="mgr-err" role="alert">{addErr}</p>}
              <Field label="Type">
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="person">Person based (BILL, cash/GPay and firms)</option>
                  <option value="firm">Firm based</option>
                </select>
              </Field>
              <div className="mgr-acts">
                <button className="btn">Add</button>
                <button type="button" className="btn ghost" onClick={demo}>Load E.C Commutators demo data</button>
                <button type="button" className="btn ghost" onClick={bigSample} disabled={loadingBig}>{loadingBig ? 'Adding…' : 'Load 3,000 test records'}</button>
              </div>
            </form>
          </Sec>

          <Settings key={b.id} />

          <Sec icon="⇅" title="Backup" hint="Download everything, or bring a backup back in">
            <div className="mgr-acts">
              <button type="button" className="btn ghost" onClick={doExport}>Export all data (JSON)</button>
              <label className="btn ghost">
                Import backup
                <input type="file" accept="application/json,.json" hidden onChange={doImport} />
              </label>
            </div>
          </Sec>

          {cloud.configured && cloud.user && (
            <Sec icon="☁" title="Cloud" hint={`Signed in as ${cloud.user.email}`}>
              <div className="mgr-acts">
                <button type="button" className="btn ghost" onClick={cloud.syncNow}>Sync now</button>
                <button type="button" className="btn ghost" onClick={() => cloud.signOut().then(onClose)}>Sign out</button>
              </div>
            </Sec>
          )}
        </div>

        <Sec tone="danger" icon="!" title="Danger zone" hint="These cannot be undone">
          <div className="mgr-danger">
            <div>
              <button className="btn ghost" onClick={reset}>
                Reset this business
              </button>
              <p className="muted">Clears all entries and restores the default items.</p>
            </div>
            <div>
              <Field label={`Delete this business — type "${b.name}"`}>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} />
              </Field>
              <button className="btn danger" onClick={del}>
                Delete this business
              </button>
            </div>
          </div>
        </Sec>
      </div>
    </Modal>
  )
}


export const initials = (n) => {
  const w = (n || '').replace(/\./g, '').split(/\s+/).filter(Boolean)
  return ((w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)) || '?').toUpperCase()
}
