// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// Validaciones del alta (spec 002). Los mensajes son los textos literales de la spec.
import { z } from "zod";

// R-002.3: mientras el prototipo use solo datos sintéticos, solo correos .test (C-07).
export const CorreoPrueba = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("En este prototipo solo se aceptan correos que terminan en .test."))
  .refine((c) => c.endsWith(".test"), "En este prototipo solo se aceptan correos que terminan en .test.");

export const NuevoAcompanamiento = z.object({
  type: z.enum(["inclusion", "workplace_support"], { error: "Elige el tipo de acompañamiento." }),
  nombrePila: z.string().trim().min(1, "Escribe el nombre de pila de la persona.").max(60),
  email: CorreoPrueba,
});

// R-002.7: solo dígitos, sin espacios al inicio ni al final ("solo dígitos" es suposición, F-027).
export const Cedula = z
  .string()
  .trim()
  .regex(/^\d{1,20}$/, "Escribe la cédula profesional. Solo números.");

export const Verificacion = z.object({
  revisoDocumento: z.literal(true, { error: "Marca las dos casillas para guardar la verificación." }),
  consultoSep: z.literal(true, { error: "Marca las dos casillas para guardar la verificación." }),
  cedula: Cedula,
});
