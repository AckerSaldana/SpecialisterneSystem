-- AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
--
-- Datos sintéticos para el prototipo. Ninguna fila corresponde a una persona real.
-- Idempotente: UUIDs fijos y "on conflict do nothing"; se puede correr varias veces.
-- Se corre completo con el rol postgres (npm run seed, o pegado en el SQL Editor de Supabase),
-- después de aplicar las migraciones de drizzle/.
--
-- Cuentas de prueba (valores de prueba, solo para este prototipo):
--   coach    coach@caja-mex.test    / caja-mex-coach-demo
--   persona  persona@caja-mex.test  / caja-mex-persona-demo
--
-- UUIDs fijos:
--   organización  11111111-1111-4111-8111-111111111111
--   coach         22222222-2222-4222-8222-222222222222
--   persona       33333333-3333-4333-8333-333333333333
--   engagement    44444444-4444-4444-8444-444444444444

begin;

-- ---------------------------------------------------------------------------
-- Organización
-- ---------------------------------------------------------------------------

insert into app.organizations (id, nombre)
values ('11111111-1111-4111-8111-111111111111', 'Organización de prueba')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Cuentas de Supabase Auth
-- Las columnas de tokens van como '' (no null): GoTrue falla al leer null en ellas.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated',
    'coach@caja-mex.test',
    extensions.crypt('caja-mex-coach-demo', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated', 'authenticated',
    'persona@caja-mex.test',
    extensions.crypt('caja-mex-persona-demo', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
  )
on conflict do nothing;

-- Una identidad "email" por cuenta; sin ella el login con contraseña no funciona.
-- La columna "email" de auth.identities es generada a partir de identity_data: no se inserta.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
values
  (
    '55555555-5555-4555-8555-555555555555',
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    'email',
    jsonb_build_object(
      'sub', '22222222-2222-4222-8222-222222222222',
      'email', 'coach@caja-mex.test',
      'email_verified', true
    ),
    now(), now(), now()
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '33333333-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333',
    'email',
    jsonb_build_object(
      'sub', '33333333-3333-4333-8333-333333333333',
      'email', 'persona@caja-mex.test',
      'email_verified', true
    ),
    now(), now(), now()
  )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Perfiles de aplicación (app.users): aquí vive el rol
-- ---------------------------------------------------------------------------

insert into app.users (id, org_id, role, nombre_pila)
values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'coach', 'Coach Demo'),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'persona', 'Alex')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Un acompañamiento Workplace Support entre el coach y la persona
-- Solo se registra que el diagnóstico fue verificado, quién y cuándo; nunca el documento.
-- ---------------------------------------------------------------------------

insert into app.engagements (
  id, org_id, type, stage, coach_id, persona_id, consentimiento_en,
  diagnostico_verificado, cedula_profesional, diagnostico_verificado_por, diagnostico_verificado_en
)
values (
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  'workplace_support',
  'evaluacion_inicial',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  now(),
  true,
  '0000000 (sintética)',
  '22222222-2222-4222-8222-222222222222',
  now()
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Corpus 1: fichas de conocimiento de ejemplo (sin verificar)
-- Fuentes F-022 y F-023: función ejecutiva, del registro de fuentes del equipo.
-- ---------------------------------------------------------------------------

insert into app.knowledge_cards (id, titulo, tipo, contenido, dominio_fe, fuente, verificada)
values
  (
    'KC-001',
    'Dividir una tarea larga en pasos visibles',
    'estrategia_fe',
    'Ejemplo sintético; reemplazar por una ficha verificada. Escribir la tarea como una lista corta de pasos, con el primer paso pequeño y concreto, y tachar cada paso al terminarlo.',
    'planeacion_organizacion',
    'F-022',
    false
  ),
  (
    'KC-002',
    'Instrucciones por escrito además de verbales',
    'ajuste_razonable',
    'Ejemplo sintético; reemplazar por una ficha verificada. Cuando el líder da una instrucción en persona, la envía también por escrito con qué hay que hacer, para cuándo y a quién preguntar.',
    'memoria_de_trabajo',
    'F-023',
    false
  ),
  (
    'KC-003',
    'Cambios frecuentes de prioridad',
    'senal',
    'Ejemplo sintético; reemplazar por una ficha verificada. Si la persona menciona varias veces que sus prioridades cambian sin aviso, conviene revisar con el líder cómo se comunican los cambios.',
    'flexibilidad',
    'F-022',
    false
  )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Corpus 2: catálogo de contenido de ejemplo para la persona
-- ---------------------------------------------------------------------------

insert into app.catalog_units (
  id, titulo, competencia, dominio_fe, formato, duracion_min, carga_cognitiva, idioma, fuente, url
)
values
  ('CU-001', 'Cómo armar una lista de pendientes del día', 'Organización del trabajo', 'planeacion_organizacion', 'lectura', 5, 'baja', 'es', 'ejemplo-sintetico', null),
  ('CU-002', 'Pedir una instrucción por escrito', 'Comunicación en el trabajo', 'memoria_de_trabajo', 'ejercicio', 10, 'baja', 'es', 'ejemplo-sintetico', null),
  ('CU-003', 'Empezar una tarea que cuesta iniciar', 'Gestión del tiempo', 'iniciacion', 'video', 4, 'media', 'es', 'ejemplo-sintetico', null)
on conflict do nothing;

commit;
