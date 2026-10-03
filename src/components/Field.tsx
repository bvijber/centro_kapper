import { useId, type InputHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'
export function Field({ icon: Icon, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: LucideIcon }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return <label className="field" htmlFor={inputId}><Icon size={22} aria-hidden="true" /><input id={inputId} {...props} /></label>
}
