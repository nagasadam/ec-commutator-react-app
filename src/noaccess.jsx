import { useCloud } from './cloud.jsx'

// Shown instead of the app when the signed-in account is not allowed to see the business data (for example a shop-floor
// scanner account). Nothing from the business is rendered here.
export default function NoAccess() {
  const cloud = useCloud()
  const checking = cloud.access === 'checking'
  const unknown = cloud.access === 'unknown'
  return (
    <div className="login">
      <div className="card" role="alert">
        <h1 className="na-t">{checking ? 'Checking access…' : unknown ? 'Could not check your access' : 'No access to this app'}</h1>
        <p className="sub-t">
          {checking
            ? 'One moment.'
            : unknown
              ? 'Connect to the internet and try again.'
              : `${cloud.user?.email} is not allowed to open this app. Shop-floor accounts can only use the Process Scan phone app. Sign in with an office account instead.`}
        </p>
        {!checking && (
          <div>
            {unknown && (
              <button className="btn block" onClick={cloud.recheckAccess}>
                Try again
              </button>
            )}
            <button className="btn ghost block" onClick={cloud.signOut}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
