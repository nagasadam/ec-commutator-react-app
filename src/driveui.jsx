import { useState } from 'react'
import { Icon } from './icons.jsx'
import { useStore } from './lib/store.jsx'
import { useToast } from './toast.jsx'
import { downloadPdf, getToken, listPdfs, parseFolderId } from './lib/drive.js'
import { importFile } from './lib/pdfimport.js'
import { dmy } from './lib/format.js'

const CLIENT_ID = (import.meta.env || {}).VITE_GOOGLE_CLIENT_ID
const LABEL = { sale: 'invoices', purchase: 'purchases' }

// Import PDFs from a Google Drive folder. One folder for invoices and a separate one for purchases,
// each remembered per business. mode: 'sale' | 'purchase'.
export default function DriveImport({ mode, auto, busy, onOpen }) {
  const { b, updB, getS } = useStore()
  const toast = useToast()
  const getB = () => getS().biz.find((x) => x.id === getS().cur)
  const folder = b.drive?.[mode] || ''
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [files, setFiles] = useState(null)
  const [pick, setPick] = useState({})
  const [res, setRes] = useState({}) // fileId -> { kind, text }
  const [work, setWork] = useState('') // '', 'list', 'import'
  const [opening, setOpening] = useState(null) // file being downloaded and read for the form
  const [show, setShow] = useState(false) // panel open state, kept in React so re-renders do not close it
  const done = (id) => b.dimp.find((m) => m.id === id)

  const saveFolder = () => {
    const id = parseFolderId(text)
    if (!id) return setErr('That does not look like a Google Drive folder link.')
    setErr('')
    updB((x) => (x.drive[mode] = id))
    setText('')
    setFiles(null)
  }
  const clearFolder = () => {
    updB((x) => (x.drive[mode] = ''))
    setFiles(null)
  }

  const fail = (e) => {
    setErr(e.message)
    toast.push(e.message, 'err')
  }

  const list = async () => {
    setWork('list')
    setErr('')
    try {
      const token = await getToken(CLIENT_ID)
      setFiles(await listPdfs(folder, token))
      setPick({})
      setRes({})
    } catch (e) {
      fail(e)
    } finally {
      setWork('')
    }
  }

  const open = async (f) => {
    setWork('open')
    setOpening(f)
    setErr('')
    try {
      await onOpen(await downloadPdf(f, await getToken(CLIENT_ID)), { id: f.id, name: f.name })
    } catch (e) {
      fail(e)
    } finally {
      setWork('')
      setOpening(null)
    }
  }

  const importMany = async (list2) => {
    setWork('import')
    setErr('')
    let saved = 0
    let review = 0
    let failed = 0
    let reviewFile = null
    try {
      for (const f of list2) {
        if (done(f.id) || getB().dimp.some((m) => m.id === f.id)) continue
        try {
          const file = await downloadPdf(f, await getToken(CLIENT_ID))
          const r = await importFile(file, { mode, getB, updB, auto: true, mark: { id: f.id, name: f.name } })
          if (r.status === 'saved') {
            saved++
            setRes((o) => ({ ...o, [f.id]: { kind: 'ok', text: `Saved ${r.nos.join(', ')}` } }))
          } else {
            review++
            reviewFile = { file, mark: { id: f.id, name: f.name } }
            setRes((o) => ({ ...o, [f.id]: { kind: 'warn', text: 'Needs review: ' + r.issues.join(' ') } }))
          }
        } catch (e) {
          if (e.code === 'expired' || e.code === 'denied' || e.code === 'offline') throw e
          failed++
          setRes((o) => ({ ...o, [f.id]: { kind: 'err', text: e.message } }))
        }
      }
      toast.push(`${saved} saved, ${review} need review${failed ? `, ${failed} unreadable` : ''}`, saved || !review ? 'ok' : 'info', { ms: 5000 })
      // A single file that needs a check goes straight into the form, filled with what was read from it.
      if (list2.length === 1 && review === 1 && reviewFile) await onOpen(reviewFile.file, reviewFile.mark)
    } catch (e) {
      fail(e)
    } finally {
      setWork('')
    }
  }

  const fresh = (files || []).filter((f) => !done(f.id))
  const chosen = fresh.filter((f) => pick[f.id])
  const disabled = busy || !!work

  return (
    <details className="drive" open={show} onToggle={(e) => setShow(e.currentTarget.open)}>
      <summary>
        <span className="dico"><Icon n="gdrive" duo /></span>
        Google Drive folder for {LABEL[mode]}
      </summary>
      {!CLIENT_ID ? (
        <p className="muted">Drive import is not set up on this site yet (needs VITE_GOOGLE_CLIENT_ID, see DEPLOY.md).</p>
      ) : (
        <>
          {folder ? (
            <p className="muted">
              Folder saved: <code>{folder.slice(0, 12)}…</code>{' '}
              <button type="button" className="btn ghost" onClick={clearFolder}>
                Change
              </button>
            </p>
          ) : (
            // not a <form>: this panel sits inside the invoice/purchase form, and forms cannot nest
            <div className="drivef">
              <input
                value={text}
                placeholder="Paste the Drive folder link"
                aria-label={`Drive folder link for ${LABEL[mode]}`}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), saveFolder())}
              />
              <button type="button" className="btn ghost" onClick={saveFolder}>
                Save folder
              </button>
            </div>
          )}
          {err && <div className="err" role="alert">{err}</div>}
          {folder && (
            <button type="button" className="btn ghost" disabled={disabled} onClick={list}>
              {work === 'list' ? 'Reading folder…' : files ? 'Refresh list' : 'Connect Google Drive & list PDFs'}
            </button>
          )}
          {files && (
            <>
              {files.length === 0 ? (
                <p className="muted">No PDFs in this folder.</p>
              ) : (
                <>
                  <div className="tw">
                    <table>
                      <thead>
                        <tr>
                          <th />
                          <th>File</th>
                          <th className="hidem">Modified</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {files.map((f) => {
                          const m = done(f.id)
                          const r = res[f.id]
                          return (
                            <tr key={f.id}>
                              <td>{!m && <input type="checkbox" aria-label={`Select ${f.name}`} checked={!!pick[f.id]} onChange={(e) => setPick({ ...pick, [f.id]: e.target.checked })} />}</td>
                              <td>{f.name}</td>
                              <td className="nw dim hidem">{dmy(f.modified)}</td>
                              <td>
                                {m ? <span className="pill ok">Imported{m.ref ? ' · ' + m.ref : ''}</span> : r ? <span className={'pill ' + (r.kind === 'ok' ? 'ok' : 'warn')} title={r.text}>{r.text.length > 60 ? r.text.slice(0, 58) + '…' : r.text}</span> : <span className="pill warn">New</span>}
                              </td>
                              <td className="r nw">
                                {!m && (
                                  <button type="button" className="btn ghost" disabled={disabled} onClick={() => open(f)}>
                                    {opening?.id === f.id ? (
                                      <>
                                        <span className="spinner" aria-hidden="true" /> Opening…
                                      </>
                                    ) : (
                                      'Open in form'
                                    )}
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {opening && (
                    <p className="muted loading" role="status">
                      <span className="spinner" aria-hidden="true" /> Reading {opening.name}… this can take a few seconds.
                    </p>
                  )}
                  <div className="pdfbar">
                    <button type="button" className="btn" disabled={disabled || !auto || !chosen.length} onClick={() => importMany(chosen)}>
                      Import selected ({chosen.length})
                    </button>
                    <button type="button" className="btn ghost" disabled={disabled || !auto || !fresh.length} onClick={() => importMany(fresh)}>
                      Import all new ({fresh.length})
                    </button>
                    {!auto && <span className="muted">Turn on Save automatically to import several at once. Open in form works either way.</span>}
                  </div>
                  <p className="muted">Files that are incomplete, duplicates or short of stock are left in the list as "Needs review"; use Open in form to fix them.</p>
                </>
              )}
            </>
          )}
        </>
      )}
    </details>
  )
}
