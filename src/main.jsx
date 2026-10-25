import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StoreProvider } from './lib/store.jsx'
import { ToastProvider } from './toast.jsx'
import { CloudProvider } from './cloud.jsx'
import { DialogProvider } from './ui.jsx'
import { Motion } from './motion.jsx'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <StoreProvider>
        <CloudProvider>
          <DialogProvider>
            <Motion>
              <App />
            </Motion>
          </DialogProvider>
        </CloudProvider>
      </StoreProvider>
    </ToastProvider>
  </StrictMode>,
)
