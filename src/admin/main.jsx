import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '../styles/tokens.css'
import { AuthProvider } from '../shared/auth'
import { ToastProvider } from '../shared/ui'
import AdminApp from './App'
import { ErrorBoundary } from '../shared/errors'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary><HashRouter>
      <AuthProvider>
        <ToastProvider>
          <AdminApp />
        </ToastProvider>
      </AuthProvider>
    </HashRouter></ErrorBoundary>
  </React.StrictMode>,
)
