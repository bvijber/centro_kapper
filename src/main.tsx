import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { AppointmentProvider } from './auth/AppointmentContext'
import { WaitingListProvider } from './auth/WaitingListContext'
import './styles/theme.css'

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><AuthProvider><AppointmentProvider><WaitingListProvider><App /></WaitingListProvider></AppointmentProvider></AuthProvider></BrowserRouter></StrictMode>)
