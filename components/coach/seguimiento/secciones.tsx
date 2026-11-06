// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Secciones de seguimiento de la página del acompañamiento (spec 004): propuestas sin revisar,
// sesiones sin propuesta, acciones sobre una señal, alertas fuertes e historiales. Todo es del coach.
// De la spec 005: los comentarios de la persona sin revisar (R-005.25).
import Link from "next/link";
import { RESPONSABLE_ALERTAS } from "@/lib/followup/aprobacion";
import type { DatosSeguimiento, FilaAlerta } from "@/lib/followup/lectura";
import { etiquetaEstadoAvance } from "@/lib/followup/schema";
import { opcionesDeCierre, type DatosCierre, type OpcionCierre } from "@/lib/persona/cierre-comentario";
import { ETIQUETA_ORIGEN_COMENTARIO, origenDe, sobreComentario, textoAvisoComentarios } from "@/lib/persona/comentarios";
import { etiquetaSenal, type ProfileEventPayload, type TipoSenal } from "@/lib/profile/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatFecha, textoTipoSesion } from "../labels";
import { AccionConDialogo, BotonPedirPropuesta } from "./acciones";
import { CerrarComentario } from "./cerrar-comentario";

const ID_SENALES = "senales-activas";
const ID_ALERTAS = "alertas-fuertes";

const sinPunto = (texto: string) => texto.trim().replace(/[.\s]+$/, "");

// R-004.26 y R-004.31.
export function PropuestasPendientes({ datos, engagementId }: { datos: DatosSeguimiento; engagementId: string }) {
  if (datos.pendientes.length === 0 && datos.sinPropuesta.length === 0) return null;
  return (
    <section aria-labelledby="pendientes" className="flex flex-col gap-3">
      <h2 id="pendientes" className="text-xl font-semibold">
        Pendiente de revisar
      </h2>
      <ul className="flex flex-col gap-3">
        {datos.pendientes.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <p>Propuesta sin revisar de la sesión del {p.fecha ? formatFecha(p.fecha) : "día registrado"}.</p>
            <Button asChild size="sm">
              <Link href={`/coach/engagements/${engagementId}/proposals/${p.id}`}>Revisar propuesta</Link>
            </Button>
          </li>
        ))}
        {datos.sinPropuesta.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <p>La sesión del {formatFecha(s.fecha)} no tiene propuesta.</p>
            <BotonPedirPropuesta engagementId={engagementId} sessionId={s.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function textoOpcion(o: OpcionCierre): string {
  if (o.tipo === "plan") return `Versión ${o.version}, aprobada el ${formatFecha(o.fecha)}`;
  return `Propuesta aprobada el ${formatFecha(o.fecha)}, con ${o.cambios} ${o.cambios === 1 ? "cambio" : "cambios"} al perfil`;
}

type EventoComentario = { id: string; status: "proposed" | "approved" | "rejected"; payload: ProfileEventPayload; createdAt: Date };

// R-005.25, R-005.26 y R-005.34. idFoco: el título que recibe el foco al cerrar, porque el botón desaparece.
export function ComentariosSinRevisar({
  eventos,
  cierre,
  nombre,
  idFoco,
}: {
  eventos: EventoComentario[];
  cierre: DatosCierre;
  nombre: string;
  idFoco: string;
}) {
  const pendientes = eventos.flatMap((e) =>
    e.status === "proposed" && e.payload.tipo === "no_me_representa" ? [{ ...e, payload: e.payload }] : [],
  );
  if (pendientes.length === 0) return null;
  return (
    <section aria-labelledby="comentarios-sin-revisar" className="flex flex-col gap-3">
      <h2 id="comentarios-sin-revisar" className="text-xl font-semibold">
        {textoAvisoComentarios(nombre, pendientes.length)}
      </h2>
      <ul className="flex flex-col gap-3">
        {pendientes.map((c) => {
          const origen = origenDe(c.payload);
          return (
            <li key={c.id} className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
              <p>
                <Badge variant="outline" className="h-auto">
                  {ETIQUETA_ORIGEN_COMENTARIO[origen]}
                </Badge>
              </p>
              <p className="prose-measure">
                <span className="font-medium">Sobre:</span> {sobreComentario(c.payload, cierre.planesPersona)}
              </p>
              <p>
                <span className="font-medium">Fecha:</span> {formatFecha(c.createdAt)}
              </p>
              {c.payload.comentario ? (
                <blockquote className="prose-measure border-l-4 border-border pl-3">“{c.payload.comentario}”</blockquote>
              ) : (
                <p className="text-muted-foreground">No dejó comentario.</p>
              )}
              {/* R-005.47: el cierre de estos comentarios se construye con 006. */}
              {origen === "cierre" ? (
                <p>Este comentario se revisa desde el resumen de cierre.</p>
              ) : (
                <div>
                  <CerrarComentario
                    eventId={c.id}
                    nombre={nombre}
                    origen={origen}
                    opciones={opcionesDeCierre(cierre, origen, c.createdAt).map((o) => ({ id: o.id, texto: textoOpcion(o) }))}
                    idFoco={idFoco}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Botones de una señal activa, con el texto fijo de emergencias junto al de alerta (R-004.19).
export function AccionesSenal({
  tipo,
  engagementId,
  nombre,
  conAlertaVigente,
}: {
  tipo: TipoSenal;
  engagementId: string;
  nombre: string;
  conAlertaVigente: boolean;
}) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <AccionConDialogo
          boton="Ya no está activa"
          titulo="¿Marcar esta señal como no activa?"
          texto="La señal sale de Señales activas y queda en el historial. El perfil no cambia."
          etiquetaNota="Motivo (opcional, solo lo ves tú)"
          campoNota="motivo"
          confirmar="Marcar como no activa"
          url={`/api/engagements/${engagementId}/signals/${tipo}/close`}
          metodo="POST"
          cuerpo={{}}
          idFoco={ID_SENALES}
        />
        {conAlertaVigente ? null : (
          <AccionConDialogo
            boton="Marcar como alerta fuerte"
            titulo="¿Marcar esta señal como alerta fuerte?"
            texto={`La alerta queda en tu lista de Alertas fuertes. La app no le avisa a nadie: pásala tú a ${RESPONSABLE_ALERTAS} por el canal que usa Specialisterne. ${nombre} no recibe ningún aviso. La empresa tampoco.`}
            etiquetaNota="Nota (opcional, solo la ves tú)"
            campoNota="nota"
            confirmar="Marcar como alerta fuerte"
            url={`/api/engagements/${engagementId}/alerts`}
            metodo="POST"
            cuerpo={{ tipoSenal: tipo }}
            idFoco={ID_ALERTAS}
          />
        )}
      </div>
      {conAlertaVigente ? <p className="text-sm">Esta señal ya tiene una alerta. Mírala en Alertas fuertes.</p> : null}
      {/* Pendiente del partner: el texto final depende de su protocolo. */}
      <p className="prose-measure text-sm text-muted-foreground">
        Esta herramienta no atiende emergencias. Si hay riesgo inmediato, sigue el protocolo de Specialisterne.
      </p>
    </div>
  );
}

function EstadoAlerta({ alerta }: { alerta: FilaAlerta }) {
  if (alerta.estado === "abierta") return <p>Abierta: falta pasarla a {RESPONSABLE_ALERTAS}.</p>;
  return (
    <>
      {alerta.escaladaEn ? <p>La pasaste el {formatFecha(alerta.escaladaEn)}.</p> : null}
      {alerta.notaEscalada ? <p className="prose-measure text-muted-foreground">{alerta.notaEscalada}</p> : null}
      {alerta.atendidaEn ? <p>Atendida el {formatFecha(alerta.atendidaEn)}.</p> : null}
    </>
  );
}

// R-004.16 y R-004.42.
export function AlertasFuertes({ alertas }: { alertas: FilaAlerta[] }) {
  return (
    <section aria-labelledby={ID_ALERTAS} className="flex flex-col gap-4">
      <h2 id={ID_ALERTAS} tabIndex={-1} className="foco-destino text-xl font-semibold">
        Alertas fuertes
      </h2>
      <p className="prose-measure text-sm text-muted-foreground">Solo tú ves esta sección. La persona no la ve.</p>
      {alertas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay alertas fuertes.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {alertas.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
              <h3 className="font-medium">
                {etiquetaSenal(a.tipoSenal)}, marcada el {formatFecha(a.marcadaEn)}.
              </h3>
              {a.nota ? <p className="prose-measure text-muted-foreground">{a.nota}</p> : null}
              <EstadoAlerta alerta={a} />
              {a.estado === "abierta" ? (
                <div>
                  <AccionConDialogo
                    boton="Ya la pasé"
                    titulo="¿Ya la pasaste?"
                    texto="Esto no se puede deshacer."
                    etiquetaNota="Nota (opcional, solo la ves tú)"
                    campoNota="notaEscalada"
                    confirmar="Ya la pasé"
                    url={`/api/alerts/${a.id}`}
                    metodo="PATCH"
                    cuerpo={{ estado: "escalada" }}
                    idFoco={ID_ALERTAS}
                  />
                </div>
              ) : null}
              {a.estado === "escalada" ? (
                <div>
                  <AccionConDialogo
                    boton="Atendida"
                    titulo="¿Marcar como atendida?"
                    texto="Esto no se puede deshacer."
                    confirmar="Marcar como atendida"
                    url={`/api/alerts/${a.id}`}
                    metodo="PATCH"
                    cuerpo={{ estado: "atendida" }}
                    idFoco={ID_ALERTAS}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Historial({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-lg font-semibold">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

// Los cuatro historiales (R-004.10, R-004.13, R-004.23).
export function Historiales({ datos, nombre }: { datos: DatosSeguimiento; nombre: string }) {
  const { sesiones, avance, avanceFuera, estadosSenal, quitado } = datos;
  return (
    <div className="flex flex-col gap-6">
      <Historial id="historial-sesiones" titulo="Sesiones">
        {sesiones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay sesiones.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {sesiones.map((s) => (
              <li key={s.id}>
                {textoTipoSesion(s.tipo, nombre)}, el {formatFecha(s.realizadaEn)}.
              </li>
            ))}
          </ul>
        )}
      </Historial>

      {avance.length + avanceFuera.length > 0 ? (
        <Historial id="historial-avance" titulo="Avance del plan">
          <ul className="flex flex-col gap-3 text-sm">
            {[...avance, ...avanceFuera].map((a) => (
              <li key={a.id} className="flex flex-col gap-1">
                <h4 className="prose-measure font-medium">{a.descripcion}</h4>
                {avanceFuera.includes(a) ? <p className="text-muted-foreground">Ya no está en el plan vigente.</p> : null}
                {a.historial.length === 0 ? (
                  <p className="text-muted-foreground">Sin avance registrado.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {a.historial.map((h, i) => (
                      <li key={i}>
                        {etiquetaEstadoAvance(h.estado)}, el {formatFecha(h.approvedAt)}, aprobado por {h.aprobadoPor ?? "Sin dato"}.
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Historial>
      ) : null}

      <Historial id="historial-senales" titulo="Señales anteriores">
        {estadosSenal.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay señales anteriores.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {estadosSenal.map((e) => (
              <li key={e.id} className="prose-measure">
                {etiquetaSenal(e.tipo)}: {e.estado === "cerrada" ? "ya no está activa" : "activa otra vez"}, el {formatFecha(e.createdAt)}, por{" "}
                {e.por ?? "Sin dato"}. {e.motivo ?? ""}
              </li>
            ))}
          </ul>
        )}
      </Historial>

      <Historial id="historial-quitado" titulo="Ya no aplica">
        {quitado.length === 0 ? (
          <p className="text-sm text-muted-foreground">No has quitado nada.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {quitado.map((c) => (
              <li key={c.id} className="prose-measure">
                {sinPunto(c.texto)}. Lo quitó {c.quitadaPor ?? "Sin dato"} el {c.quitadaEn ? formatFecha(c.quitadaEn) : "día registrado"}.
              </li>
            ))}
          </ul>
        )}
      </Historial>
    </div>
  );
}
