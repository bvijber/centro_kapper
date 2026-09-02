import { ArrowLeft, LockKeyhole, Mail, Phone, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import { useAuth } from '../auth/AuthContext'
export function CreateAccount() { const navigate = useNavigate(); const { signIn } = useAuth(); return <main className="auth page account"><Link className="back" to="/login"><ArrowLeft /></Link><p className="eyebrow">MAAK EEN KLANTACCOUNT</p><h1>Maak jouw<br /><em>identiteit.</em></h1><div className="form"><Field icon={UserRound} placeholder="Volledige naam" /><Field icon={Mail} type="email" placeholder="E-mailadres" /><Field icon={Phone} type="tel" placeholder="Telefoonnummer" /><Field icon={LockKeyhole} type="password" placeholder="Wachtwoord" /><Button onClick={() => { signIn('customer'); navigate('/home') }}>Account maken</Button></div><p className="auth-switch">Al lid? <Link to="/login">Inloggen</Link></p></main> }
