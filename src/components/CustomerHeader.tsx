import { Bell, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import logo from '../assets/logo_centro_kapper.jpeg'
export function CustomerHeader() { return <header className="topbar"><Link to="/home" className="brand"><img src={logo} alt="Centro Kapper" /><span>Centro <b>Kapper</b></span></Link><Bell size={22} /></header> }
