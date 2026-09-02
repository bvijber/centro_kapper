import { ArrowLeft, LockKeyhole, Mail } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import logo from '../assets/logo_centro_kapper.jpeg'
import { useAuth } from '../auth/AuthContext'
export function Login() { const navigate = useNavigate(); const { signIn } = useAuth(); const loginAs = (role: 'customer' | 'staff') => { signIn(role); navigate(role === 'staff' ? '/staff' : '/home') }; return <main className="auth page"><Link className="back" to="/home"><ArrowLeft /></Link><img className="auth-logo" src={logo} alt="Centro Kapper" /><p className="eyebrow">WELKOM BIJ CENTRO KAPPER</p><h1>Jouw stijl,<br /><em>jouw moment.</em></h1><p className="lead">Boek eenvoudig je volgende knipbeurt bij Centro Kapper.</p><div className="form"><Field icon={Mail} type="email" placeholder="E-mailadres" /><Field icon={LockKeyhole} type="password" placeholder="Wachtwoord" /><Button onClick={() => loginAs('customer')}>Inloggen</Button></div><div className="mock-login"><small>Tijdelijke ontwikkel-login</small><button onClick={() => loginAs('customer')}>Login als klant</button><button onClick={() => loginAs('staff')}>Login als medewerker</button></div><p className="auth-switch">Nog geen account? <Link to="/create-account">Account maken</Link></p></main> }
