import { Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'

/** Password input with a show/hide toggle (same control as the login page). */
export function PasswordInput({ id, ...props }: ComponentProps<typeof Input> & { id: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="pr-10"
        {...props}
      />
      <button
        type="button"
        aria-pressed={show}
        aria-controls={id}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setShow((v) => !v)}
        className="focus-ring absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-control text-ink-3 transition-colors duration-150 hover:text-ink"
      >
        {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        <span className="sr-only">{show ? 'Hide password' : 'Show password'}</span>
      </button>
    </div>
  )
}
