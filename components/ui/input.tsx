// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Generado con shadcn y ajustado a docs/DISENO.md (spec 012): borde --border-input (3:1, R-012.2), radio --radius-md,
// texto de al menos 16px y el foco de globals.css.
import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-12 w-full min-w-0 rounded-md border-(length:--border-w) border-input bg-card px-3 py-2 text-base text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-base file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
