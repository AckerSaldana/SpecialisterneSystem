// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Generado con shadcn y ajustado a docs/DISENO.md (spec 012, R-012.3): solo tokens. El foco lo pinta
// :focus-visible de globals.css (anillo de 3px del acento); sin anillos extra, sin sombras y sin moverse al presionar.
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border-(length:--border-w) border-transparent bg-clip-padding text-base font-medium whitespace-nowrap transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        // Secundario de DISENO.md: transparente, con borde y texto en el color del texto.
        outline: "border-border bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary: "border-border bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
        ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive: "border-destructive bg-transparent text-destructive hover:bg-destructive/10",
        link: "text-foreground underline underline-offset-4",
      },
      size: {
        // DISENO.md: alto mínimo de 48px (3rem con 16px de base; crece con el tamaño que elige la persona).
        default: "min-h-12 gap-2 px-5 py-2",
        // Chips pequeños como "Ver detalle": en píldora.
        xs: "min-h-8 gap-1 rounded-full px-3 text-sm [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-10 gap-1.5 px-4 py-1.5",
        lg: "min-h-12 gap-2 px-6 py-2",
        icon: "size-12",
        "icon-xs": "size-8 rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-10",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
