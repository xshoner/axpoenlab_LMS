import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '../styles/tokens.css'
import { AuthProvider } from '../shared/auth'
import { ToastProvider } from '../shared/ui'
import AdminApp from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <ToastProvider>
          <AdminApp />
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
)
