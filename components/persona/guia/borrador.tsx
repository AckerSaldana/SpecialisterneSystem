// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// El borrador de "Cómo trabajar conmigo" (spec 009, R-009.20 a R-009.33). La persona decide cada línea: incluir,
// editar, quitar, agregar las suyas, ver la vista previa, marcarla como lista o descartarla. Cada cambio se
// guarda al confirmarlo, no por tiempo (R-009.59). Una cosa a la vez: mientras hay un formulario abierto o un
// pedido en camino, lo demás espera.
//
// Cada respuesta de la ruta trae la guía completa, sin orígenes (R-009.33), y eso es lo que se pinta. También se
// refresca, para que la página guardada por el router no regrese decisiones viejas al volver con "Atrás".
//
// Nunca importa lib/guia/schema, lib/guia/terminos ni lib/profile/schema: llegarían al navegador de la persona
// con los nombres de dominios y señales (C-09). El bloqueo de R-009.24 lo decide el servidor y aquí se muestra.
// Una línea con un cambio sin decidir enseña lo que propone la regeneración y solo admite aceptarlo o rechazarlo
// (R-009.49). Mientras haya uno no se puede marcar lista.
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { MAX_NOMBRE_A_MOSTRAR, MAX_TEXTO_LINEA, SECCIONES_GUIA, type AccionLineaRequest, type GuiaVista, type LineaGuiaVista, type ListoRequest, type SeccionGuia } from "@/lib/guia/schema-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { enfocarDespues, useFocoPendiente } from "@/components/coach/plan/foco";
import { TituloEnfocable } from "@/components/coach/plan/titulo-enfocable";
import { llamarGuia } from "./api";
import { avisar } from "./aviso";
import { Confirmar } from "./confirmar";
import {
  AGREGAR,
  AYUDA_AGREGAR,
  BORRAR_LINEA,
  BOTONES_LINEA,
  CAMBIO_LINEA,
  CAMPO_NOMBRE,
  DEJAR_COMO_ESTABA,
  DESCARTAR,
  DIALOGO_DEJAR,
  DIALOGO_DESCARTAR,
  DIALOGO_LISTO,
  ESTADO_LINEA,
  etiquetaBoton,
  FORMULARIO_LINEA,
  GUARDAR_NOMBRE,
  ID_TITULO_BORRADOR,
  ID_TITULO_PEDIR,
  ID_TITULO_VERSIONES,
  idAgregar,
  idLinea,
  INSUMOS_CAMBIARON,
  LISTO,
  NOMBRE_SIN_GUARDAR,
  NOMBRE_VACIO,
  razonNoLista,
  RESULTADOS,
  rutaVistaPrevia,
  SECCION_VACIA,
  textoDescartes,
  textoOrigen,
  TITULO_BORRADOR,
  VER_VISTA_PREVIA,
} from "./textos";

type Abierto = { tipo: "editar"; lineaId: string } | { tipo: "agregar"; seccion: SeccionGuia } | null;

// Dónde se muestra un error: junto a lo que lo causó.
type ErrorGuia = { donde: string; texto: string } | null;

type Props = {
  guia: GuiaVista;
  // Las fechas llegan ya escritas desde el servidor, para que no cambien con la zona del navegador.
  fecha: string;
  pedidoPorMi: boolean;
  insumosCambiaron: boolean;
  versionSiguiente: number;
  hayListas: boolean;
};

export function BorradorGuia({ guia: inicial, fecha, pedidoPorMi, insumosCambiaron, versionSiguiente, hayListas }: Props) {
  const router = useRouter();
  const [guia, setGuia] = useState(inicial);
  const [nombre, setNombre] = useState(inicial.nombreAMostrar);
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [enviando, setEnviando] = useState(false);
  // "Listo" y descartar: el borrador está por irse, y hasta que se vaya ya no se decide nada.
  const [cerrando, iniciarCierre] = useTransition();
  const [error, setError] = useState<ErrorGuia>(null);

  const url = `/api/persona/shared-guides/${guia.id}`;
  const nombreSinGuardar = nombre.trim() !== guia.nombreAMostrar;
  const razon = razonNoLista(guia.lineas) ?? (nombreSinGuardar ? NOMBRE_SIN_GUARDAR : null);
  const ocupado = enviando || cerrando || abierto !== null;
  // Solo la regeneración deja cambios en una línea: "Hacer cambios" los limpia al copiar (R-009.32).
  const esRegeneracion = guia.lineas.some((l) => l.cambio !== null);

  // Una sola petición a la vez: cada respuesta trae la guía completa y no debe pisar una más nueva.
  async function pedir(ruta: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo: object | undefined, donde: string, alTerminar?: (nueva: GuiaVista) => void): Promise<boolean> {
    setEnviando(true);
    setError(null);
    avisar("");
    const r = await llamarGuia(ruta, metodo, cuerpo);
    setEnviando(false);
    if (!r.ok) {
      setError({ donde, texto: r.error });
      return false;
    }
    setGuia(r.guia);
    alTerminar?.(r.guia);
    router.refresh();
    return true;
  }

  async function decidir(linea: LineaGuiaVista, accion: Exclude<AccionLineaRequest["accion"], "editar">) {
    await pedir(`${url}/lineas/${linea.id}`, "PATCH", { accion } satisfies AccionLineaRequest, linea.id, () => enfocarDespues(idLinea(linea.id)));
  }

  async function guardarEdicion(linea: LineaGuiaVista, texto: string) {
    const listo = await pedir(`${url}/lineas/${linea.id}`, "PATCH", { accion: "editar", texto } satisfies AccionLineaRequest, `form-${linea.id}`, () => enfocarDespues(idLinea(linea.id)));
    if (listo) setAbierto(null);
  }

  async function guardarNueva(seccion: SeccionGuia, texto: string) {
    const listo = await pedir(`${url}/lineas`, "POST", { seccion, texto }, `form-${seccion}`, (nueva) => {
      const agregada = nueva.lineas[nueva.lineas.length - 1];
      if (agregada) enfocarDespues(idLinea(agregada.id));
      avisar(RESULTADOS.agregada);
    });
    if (listo) setAbierto(null);
  }

  async function guardarNombre() {
    const nombreAMostrar = nombre.trim();
    if (!nombreAMostrar) {
      setError({ donde: "nombre", texto: NOMBRE_VACIO });
      return;
    }
    await pedir(url, "PATCH", { nombreAMostrar }, "nombre", (nueva) => {
      setNombre(nueva.nombreAMostrar);
      avisar(RESULTADOS.nombre);
      // El botón se deshabilita porque ya no hay nada que guardar: el foco regresa al campo.
      document.getElementById("nombre-a-mostrar")?.focus();
    });
  }

  // Para los diálogos: devuelven el error para que se quede abierto con él.
  async function borrarPropia(linea: LineaGuiaVista): Promise<string | null> {
    avisar("");
    const r = await llamarGuia(`${url}/lineas/${linea.id}`, "DELETE");
    if (!r.ok) return r.error;
    setGuia(r.guia);
    avisar(RESULTADOS.borrada);
    router.refresh();
    return null;
  }

  async function marcarLista(): Promise<string | null> {
    avisar("");
    // La huella de lo que está en pantalla: si cambió en otra pestaña, la ruta no congela algo que ella no vio (R-009.29).
    const r = await llamarGuia(`${url}/listo`, "POST", { huella: guia.huella } satisfies ListoRequest);
    if (!r.ok) return r.error;
    avisar(RESULTADOS.lista(r.guia.version ?? versionSiguiente));
    iniciarCierre(() => router.refresh());
    return null;
  }

  async function descartar(): Promise<string | null> {
    avisar("");
    const r = await llamarGuia(`${url}/descartar`, "POST");
    if (!r.ok) return r.error;
    avisar(esRegeneracion ? RESULTADOS.dejado : RESULTADOS.descartado);
    iniciarCierre(() => router.refresh());
    return null;
  }

  return (
    <section aria-labelledby={ID_TITULO_BORRADOR} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <TituloEnfocable id={ID_TITULO_BORRADOR} nivel={2} className="text-xl font-semibold">
          {TITULO_BORRADOR}
        </TituloEnfocable>
        <p className="prose-measure">{textoOrigen(pedidoPorMi, fecha)}</p>
        {guia.descartadas > 0 ? <p className="prose-measure">{textoDescartes(guia.descartadas)}</p> : null}
        {insumosCambiaron ? (
          <p role="note" className="prose-measure rounded-lg border-2 border-primary bg-accent p-3 font-medium">
            {INSUMOS_CAMBIARON}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="nombre-a-mostrar">{CAMPO_NOMBRE}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="nombre-a-mostrar"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={MAX_NOMBRE_A_MOSTRAR}
            readOnly={enviando}
            aria-invalid={error?.donde === "nombre" || undefined}
            aria-describedby={error?.donde === "nombre" ? "nombre-error" : undefined}
            className="h-10 max-w-sm"
          />
          <Button type="button" variant="outline" disabled={ocupado || !nombreSinGuardar} onClick={guardarNombre}>
            {GUARDAR_NOMBRE}
          </Button>
        </div>
        {error?.donde === "nombre" ? <MensajeError id="nombre-error" texto={error.texto} /> : null}
      </div>

      {SECCIONES_GUIA.map(({ id, titulo }) => {
        const lineas = guia.lineas.filter((l) => l.seccion === id).sort((a, b) => a.orden - b.orden);
        return (
          <section key={id} aria-labelledby={`seccion-${id}`} className="flex flex-col gap-3">
            <h3 id={`seccion-${id}`} className="text-lg font-semibold">
              {titulo}
            </h3>
            {lineas.length === 0 ? <p className="prose-measure text-muted-foreground">{SECCION_VACIA}</p> : null}
            {lineas.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {lineas.map((linea) => (
                  <LineaDelBorrador
                    key={linea.id}
                    linea={linea}
                    editando={abierto?.tipo === "editar" && abierto.lineaId === linea.id}
                    ocupado={ocupado}
                    enviando={enviando}
                    error={error}
                    alEditar={() => {
                      setError(null);
                      setAbierto({ tipo: "editar", lineaId: linea.id });
                    }}
                    alCancelar={() => {
                      setError(null);
                      enfocarDespues(idLinea(linea.id));
                      setAbierto(null);
                    }}
                    alGuardar={(texto) => guardarEdicion(linea, texto)}
                    alDecidir={(accion) => decidir(linea, accion)}
                    alBorrar={() => borrarPropia(linea)}
                    idFocoAlBorrar={idAgregar(id)}
                  />
                ))}
              </ul>
            ) : null}
            {abierto?.tipo === "agregar" && abierto.seccion === id ? (
              <FormularioLinea
                idForm={`form-${id}`}
                etiqueta={FORMULARIO_LINEA.etiquetaNueva}
                inicial=""
                enviando={enviando}
                error={error?.donde === `form-${id}` ? error.texto : null}
                alGuardar={(texto) => guardarNueva(id, texto)}
                alCancelar={() => {
                  setError(null);
                  enfocarDespues(idAgregar(id));
                  setAbierto(null);
                }}
              />
            ) : (
              <BotonAgregar
                seccion={id}
                deshabilitado={ocupado}
                alAgregar={() => {
                  setError(null);
                  setAbierto({ tipo: "agregar", seccion: id });
                }}
              />
            )}
          </section>
        );
      })}

      <div className="flex flex-col gap-3">
        {razon ? (
          <p id="razon-no-lista" className="prose-measure font-medium">
            {razon}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {ocupado ? (
            <Button type="button" variant="outline" disabled>
              {VER_VISTA_PREVIA}
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={rutaVistaPrevia(guia.id)}>{VER_VISTA_PREVIA}</Link>
            </Button>
          )}
          <Confirmar
            boton={LISTO}
            variante="default"
            deshabilitado={ocupado || razon !== null}
            describedBy={razon ? "razon-no-lista" : undefined}
            titulo={DIALOGO_LISTO.titulo}
            texto={hayListas ? [DIALOGO_LISTO.texto(versionSiguiente), DIALOGO_LISTO.anteriores] : [DIALOGO_LISTO.texto(versionSiguiente)]}
            cancelar={DIALOGO_LISTO.cancelar}
            confirmar={DIALOGO_LISTO.confirmar}
            alConfirmar={marcarLista}
            idFoco={ID_TITULO_VERSIONES}
          />
          <Confirmar
            boton={esRegeneracion ? DEJAR_COMO_ESTABA : DESCARTAR}
            deshabilitado={ocupado}
            titulo={esRegeneracion ? DIALOGO_DEJAR.titulo : DIALOGO_DESCARTAR.titulo}
            texto={[esRegeneracion ? DIALOGO_DEJAR.texto : DIALOGO_DESCARTAR.texto]}
            cancelar={esRegeneracion ? DIALOGO_DEJAR.cancelar : DIALOGO_DESCARTAR.cancelar}
            confirmar={esRegeneracion ? DIALOGO_DEJAR.confirmar : DIALOGO_DESCARTAR.confirmar}
            alConfirmar={descartar}
            idFoco={versionSiguiente > 1 ? ID_TITULO_VERSIONES : ID_TITULO_PEDIR}
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Una línea
// ---------------------------------------------------------------------------

type PropsLinea = {
  linea: LineaGuiaVista;
  editando: boolean;
  ocupado: boolean;
  enviando: boolean;
  error: ErrorGuia;
  alEditar: () => void;
  alCancelar: () => void;
  alGuardar: (texto: string) => void;
  alDecidir: (accion: Exclude<AccionLineaRequest["accion"], "editar">) => void;
  alBorrar: () => Promise<string | null>;
  idFocoAlBorrar: string;
};

function LineaDelBorrador({ linea, editando, ocupado, enviando, error, alEditar, alCancelar, alGuardar, alDecidir, alBorrar, idFocoAlBorrar }: PropsLinea) {
  const textoRef = useRef<HTMLParagraphElement>(null);
  const id = idLinea(linea.id);
  // El botón pulsado desaparece al cambiar el estado: el foco va al texto de la línea, que siempre está.
  useFocoPendiente(id, textoRef);

  const boton = (texto: string, accion: () => void) => (
    <Button type="button" size="sm" variant="outline" disabled={ocupado} aria-label={etiquetaBoton(texto, linea.texto)} onClick={accion}>
      {texto}
    </Button>
  );
  const editar = boton(BOTONES_LINEA.editar, alEditar);
  const quitar = boton(BOTONES_LINEA.quitar, () => alDecidir("quitar"));
  const cambio = linea.cambio?.decision === "pendiente" ? linea.cambio : null;

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
      {cambio ? (
        <CambioPropuesto textoRef={textoRef} id={id} tipo={cambio.tipo} texto={linea.texto} textoAnterior={cambio.textoAnterior} antesQuitada={cambio.antesQuitada} eraEditada={linea.estado === "editada"} />
      ) : (
        <p ref={textoRef} id={id} tabIndex={-1} className="foco-destino prose-measure">
          {linea.texto}
        </p>
      )}
      {/* Cada resultado se anuncia aquí (CA-009.52). Sin decidir no hay resultado que anunciar. */}
      <p role="status" className="text-sm font-medium empty:-mb-2">
        {cambio ? "" : ESTADO_LINEA[linea.estado]}
      </p>

      {cambio ? (
        <div className="flex flex-wrap gap-2">
          {boton(CAMBIO_LINEA.aceptar, () => alDecidir("aceptar_cambio"))}
          {boton(CAMBIO_LINEA.rechazar, () => alDecidir("rechazar_cambio"))}
        </div>
      ) : editando ? (
        <FormularioLinea
          idForm={`form-${linea.id}`}
          etiqueta={FORMULARIO_LINEA.etiquetaEditar}
          inicial={linea.texto}
          enviando={enviando}
          error={error?.donde === `form-${linea.id}` ? error.texto : null}
          alGuardar={alGuardar}
          alCancelar={alCancelar}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {linea.estado === "pendiente" ? (
            <>
              {boton(BOTONES_LINEA.incluir, () => alDecidir("incluir"))}
              {editar}
              {quitar}
            </>
          ) : null}
          {linea.estado === "incluida" ? (
            <>
              {editar}
              {quitar}
            </>
          ) : null}
          {linea.estado === "editada" ? (
            <>
              {boton(BOTONES_LINEA.volverAlTextoIa, () => alDecidir("volver_al_texto_ia"))}
              {editar}
              {quitar}
            </>
          ) : null}
          {linea.estado === "quitada" ? boton(BOTONES_LINEA.volverAIncluir, () => alDecidir("volver_a_incluir")) : null}
          {linea.estado === "propia" ? (
            <>
              {editar}
              <Confirmar
                boton={BOTONES_LINEA.borrar}
                etiquetaBoton={etiquetaBoton(BOTONES_LINEA.borrar, linea.texto)}
                deshabilitado={ocupado}
                titulo={BORRAR_LINEA.titulo}
                texto={[BORRAR_LINEA.texto]}
                cancelar={BORRAR_LINEA.cancelar}
                confirmar={BORRAR_LINEA.confirmar}
                alConfirmar={alBorrar}
                idFoco={idFocoAlBorrar}
              />
            </>
          ) : null}
        </div>
      )}

      {error?.donde === linea.id ? <MensajeError texto={error.texto} /> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Lo que propone una regeneración sobre una línea (R-009.49, R-009.50)
// ---------------------------------------------------------------------------

type PropsCambio = {
  textoRef: RefObject<HTMLParagraphElement | null>;
  id: string;
  tipo: NonNullable<LineaGuiaVista["cambio"]>["tipo"];
  // En "cambia", lo que propone la IA. El texto de antes está en textoAnterior.
  texto: string;
  textoAnterior: string | null;
  antesQuitada: boolean;
  eraEditada: boolean;
};

// El primer párrafo es donde queda el foco. Al decidir, ese id pasa al texto de la línea.
function CambioPropuesto({ textoRef, id, tipo, texto, textoAnterior, antesQuitada, eraEditada }: PropsCambio) {
  const rotulo = (contenido: string) => (
    <p ref={textoRef} id={id} tabIndex={-1} className="foco-destino prose-measure text-sm font-medium">
      {contenido}
    </p>
  );
  if (tipo === "nueva") {
    return (
      <>
        {rotulo(CAMBIO_LINEA.nueva)}
        <p className="prose-measure">{texto}</p>
        {antesQuitada ? <p className="prose-measure text-sm">{CAMBIO_LINEA.antesQuitada}</p> : null}
      </>
    );
  }
  if (tipo === "sale") {
    return (
      <>
        {rotulo(CAMBIO_LINEA.sale)}
        <p className="prose-measure">{texto}</p>
      </>
    );
  }
  return (
    <>
      {rotulo(eraEditada ? CAMBIO_LINEA.tuTexto : CAMBIO_LINEA.ahoraDice)}
      <p className="prose-measure">{textoAnterior}</p>
      <p className="prose-measure text-sm font-medium">{CAMBIO_LINEA.iaPropone}</p>
      <p className="prose-measure">{texto}</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Formulario de una línea: editar o agregar
// ---------------------------------------------------------------------------

type PropsFormulario = {
  idForm: string;
  etiqueta: string;
  inicial: string;
  enviando: boolean;
  error: string | null;
  alGuardar: (texto: string) => void;
  alCancelar: () => void;
};

function FormularioLinea({ idForm, etiqueta, inicial, enviando, error, alGuardar, alCancelar }: PropsFormulario) {
  const [texto, setTexto] = useState(inicial);
  const [vacia, setVacia] = useState(false);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const idError = `${idForm}-error`;
  const idAyuda = `${idForm}-ayuda`;
  const mensaje = vacia ? FORMULARIO_LINEA.vacia : error;

  // Al abrir, el foco va al campo. Es una consecuencia de pulsar "Editar" o "Agregar".
  useEffect(() => {
    campoRef.current?.focus();
  }, []);

  function guardar() {
    const limpio = texto.trim();
    setVacia(!limpio);
    if (limpio) alGuardar(limpio);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={idForm}>{etiqueta}</Label>
      <Textarea
        ref={campoRef}
        id={idForm}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        readOnly={enviando}
        maxLength={MAX_TEXTO_LINEA}
        rows={3}
        aria-invalid={mensaje ? true : undefined}
        aria-describedby={mensaje ? `${idError} ${idAyuda}` : idAyuda}
      />
      <p id={idAyuda} className="prose-measure text-sm text-muted-foreground">
        {AYUDA_AGREGAR} {FORMULARIO_LINEA.unaALaVez}
      </p>
      {mensaje ? <MensajeError id={idError} texto={mensaje} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={enviando} onClick={guardar}>
          {FORMULARIO_LINEA.guardar}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={enviando} onClick={alCancelar}>
          {FORMULARIO_LINEA.cancelar}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piezas chicas
// ---------------------------------------------------------------------------

function BotonAgregar({ seccion, deshabilitado, alAgregar }: { seccion: SeccionGuia; deshabilitado: boolean; alAgregar: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const id = idAgregar(seccion);
  useFocoPendiente(id, ref);
  return (
    <div className="flex flex-col gap-1">
      <div>
        <Button ref={ref} id={id} type="button" size="sm" variant="outline" disabled={deshabilitado} onClick={alAgregar}>
          {AGREGAR}
        </Button>
      </div>
      <p className="prose-measure text-sm text-muted-foreground">{AYUDA_AGREGAR}</p>
    </div>
  );
}

// El error se lee primero: el foco va a él. Se queda hasta la siguiente acción.
function MensajeError({ id, texto }: { id?: string; texto: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [texto]);
  return (
    <p ref={ref} id={id} tabIndex={-1} role="alert" className="foco-destino prose-measure text-sm font-medium text-destructive">
      {texto}
    </p>
  );
}
