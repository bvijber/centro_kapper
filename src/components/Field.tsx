import type { InputHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'
export function Field({ icon: Icon, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: LucideIcon }) { return <label className="field"><Icon size={22} /><input {...props} /></label> }
