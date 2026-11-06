import { light as logoLight, dark as logoDark } from './assets/logos.js'

export function Logo({ big }) {
  const c = 'logo' + (big ? ' big' : '')
  const sizes = big ? '72px' : '34px'
  return (
    <span className={'logo-wrap' + (big ? ' big' : '')} aria-hidden="true">
      <img className={c + ' lt'} src={logoLight.src} srcSet={logoLight.srcSet} sizes={sizes} alt="" decoding="async" />
      <img className={c + ' dk'} src={logoDark.src} srcSet={logoDark.srcSet} sizes={sizes} alt="" decoding="async" />
    </span>
  )
}

export function Sec({ tone, icon, title, hint, children }) {
  return (
    <section className={'mgr-sec' + (tone ? ' ' + tone : '')}>
      <header>
        <span className="mgr-ico" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h4>{title}</h4>
          {hint && <p className="muted">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

