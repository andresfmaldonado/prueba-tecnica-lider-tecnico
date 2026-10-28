# Code review (versión compacta) — MR «Primer endpoint de Agendamiento + proceso programado»

> **Qué es este documento.** Esta es la **versión que entregaría al desarrollador**: lo urgente y lo accionable, compacto para que se pueda leer y entender en una sola sentada. La versión extendida, con el razonamiento completo de cada hallazgo, está en [code-review.md](code-review.md) y se incluye en la entrega porque el enunciado pide ver **cómo enseño**.

**Veredicto: cambios solicitados.** Gracias por el MR pequeño y por los comentarios de intención; hacen fácil leerlo. Y el `try/catch` alrededor de la llamada al proveedor es buena práctica: evita que una guía rompa el ciclo entero.

**Lo primero:** el token `sk_live_...` ya quedó en el historial de Git. Gestiona hoy la rotación y escríbeme cuando la variable de entorno esté implementada ([#2](#2)).

## Qué te pido hoy

Seis hallazgos son **innegociables** porque son de seguridad (inyección SQL, secreto expuesto, consumo inseguro del proveedor, datos personales en logs). Con el contexto actual de ataques y el historial de la compañía en ese frente, no podemos fusionar con ellos. El resto es importante, pero **propón tú un plan de trabajo** con orden y fechas y lo acordamos.

| # | Severidad | ¿Bloquea? | Tema |
|---|---|---|---|
| [1](#1) | Crítico | **Sí** | Inyección SQL en `GET /citas` |
| [2](#2) | Crítico | **Sí** | Token de producción en el código |
| [3](#3) | Crítico | **Sí** | TLS desactivado en todo el proceso |
| [4](#4) | Crítico | **Sí** | El endpoint no compila y no siempre responde |
| [5](#5) | Crítico | **Sí** | Inyección SQL en el `UPDATE` con datos del proveedor |
| [8](#8) | Alto | **Sí** | Teléfono y dirección en los logs |
| [10](#10) | Alto | Primero conversamos | El servicio escribe en tablas del monolito |
| [6](#6) [7](#7) [9](#9) | Alto | Plan de trabajo | `catch` vacío, cron que se solapa, sin tenant ni autenticación |
| [11](#11) [12](#12) [13](#13) [14](#14) [18](#18) | Medio | Plan de trabajo | *Timeout*, validación, `SELECT *`, pruebas, estructura |
| [15](#15) [16](#16) [17](#17) | Bajo | No | CORS, puerto y apagado, logs estructurados |

## Comentarios en línea

```ts
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
```

<a id="3"></a>
> **#3 · Crítico · Bloquea.** Apaga la verificación de certificados de **todo el proceso**, también la conexión a la BD (lo probé: `tls.connect`, que usa `pg`, acepta entonces un certificado autofirmado). Cualquiera en medio de la red puede leer y alterar lo que enviamos, token incluido. Suele aparecer para que «funcione» un certificado de pruebas, pero oculta el problema real. **Qué hacer:** quítala; si el proveedor usa una CA propia, agrégala con `NODE_EXTRA_CA_CERTS`.

```ts
const PROVIDER_TOKEN = 'sk_live_9f8a7b6c5d4e3f2a1b';
```

<a id="2"></a>
> **#2 · Crítico · Bloquea.** Un secreto en el código queda en el historial de Git, aunque el MR no se fusione: ya está vulnerado. **Qué hacer, en orden:** (1) gestiona la rotación con el proveedor; (2) léelo de `process.env.PROVIDER_TOKEN` desde **Secret Manager** y que el servicio falle al arrancar si no está; (3) escríbeme cuando esté implementado; (4) agrega `gitleaks` al *pipeline* para que una máquina lo detecte la próxima vez.

```ts
app.use(cors({ origin: '*' }));
```

<a id="15"></a>
> **#15 · Bajo · No bloquea.** Los consumidores son servidores (monolito, call center), no navegadores; no necesitas CORS. Si algún día lo necesitas, lista los orígenes.

```ts
app.get('/citas', async (req, res) => {
  const { ciudad, fecha } = req.query;
  const sql = `SELECT * FROM agenda_citas
               WHERE ciudad = '${ciudad}' AND fecha = '${fecha}'`;
  const result = await pool.query(sql);
```

<a id="1"></a>
> **#1 · Crítico · Bloquea.** `ciudad` y `fecha` vienen de la URL y van **pegadas dentro del SQL**: con `?ciudad=' OR '1'='1` se lee toda la tabla. El motor no distingue entre tu SQL y el dato; todo es texto. **Qué hacer:** consultas parametrizadas, `pool.query('... WHERE tenant_id = $1 AND ciudad = $2 AND fecha = $3', [tenantId, ciudad, fecha])`. Regla práctica: si ves `${...}` dentro de un SQL, pregúntate de dónde viene.

<a id="13"></a>
> **#13 · Medio · Plan de trabajo.** `SELECT *` sin `LIMIT`: elige columnas (¿alguna con datos personales?) y pagina.

<a id="12"></a>
> **#12 · Medio · Plan de trabajo.** (a) No se valida la entrada; un esquema `zod` responde `400` con mensaje útil. (b) En Express 4 un `await` que falla **no** llega al manejador de errores: lo probé y la petición no recibe respuesta y, en Node 22, el proceso termina. Usa `try/catch` con `next(err)`.

```ts
  if ciudad = “MEDELLIN” {
     res.json(result.rows);
  }
});
```

<a id="4"></a>
> **#4 · Crítico · Bloquea.** No compila (faltan paréntesis, `=` asigna en vez de comparar, las comillas son tipográficas) y, si la condición es falsa, nunca se responde. Además, fija Medellín como única ciudad. Una pregunta para validar: **¿llegaste a compilarlo?** Yo lo hice y falla en el primer `tsc`; quizá se editó después de probarlo. **Qué hacer:** quita el `if`, responde siempre, y pasa `tsc` y un test antes de pedir review.

```ts
cron.schedule('*/5 * * * *', async () => {
  const pendientes = await pool.query(
     "SELECT * FROM guias WHERE estado = 'PENDIENTE_AGENDA'"
  );
```

<a id="7"></a>
> **#7 · Alto · Plan de trabajo.** Si una pasada tarda más de 5 minutos arranca otra encima (lo probé: llegaron a correr 4 a la vez), y con varias instancias en Cloud Run cada una tiene su cron. Resultado: la misma guía se agenda varias veces y consume varios *slots*. **Qué hacer:** reclama las guías de forma atómica (`FOR UPDATE SKIP LOCKED`) y mueve la programación a Cloud Scheduler + Cloud Run Job, como en la Parte A.

<a id="6"></a>
> **#6 · Alto · Plan de trabajo (parte 1).** Esta consulta está fuera del `try`: si la BD falla, el rechazo no capturado termina el proceso desde Node 15 y tumba también el endpoint.

```ts
  for (const guia of pendientes.rows) {
    console.log('Agendando', guia.numero, guia.telefono, guia.direccion);
```

<a id="8"></a>
> **#8 · Alto · Bloquea.** Teléfono y dirección son datos personales (Ley 1581 de 2012) y los logs los leen más personas que la tabla y se conservan mucho tiempo. **Qué hacer:** registra solo `tenant` y `numero` de guía.

```ts
      const resp = await axios.post(
         'https://proveedor-rutas.example.com/v1/slots',
         { direccion: guia.direccion },
         { headers: { Authorization: `Bearer ${PROVIDER_TOKEN}` } }
      );
```

<a id="11"></a>
> **#11 · Medio · Plan de trabajo.** Sin `timeout`, una respuesta lenta congela todo el ciclo (el `for` es secuencial: 40.000 guías a 300 ms son más de 3 horas). **Qué hacer:** `timeout` de 5 s, reintentos acotados y concurrencia limitada.

<a id="10"></a>
> **#10 · Alto · Primero conversamos.** Antes de opinar quiero entender **por qué lo hiciste así**. Si te dijeron que las tablas eran compartidas, lo revisamos juntos; si no había definición, es una falta del equipo y la cerramos hoy. El punto técnico: según la arquitectura el sistema nuevo no puede afectar al monolito directamente; `guias` y `agenda_citas` son del monolito y escribirlas dispara sus triggers (ADR-001, Parte A). Y una pregunta: ¿por qué la fecha la decide el proveedor y no la regla de cobertura del cliente?

```ts
      await pool.query(
         `UPDATE guias SET estado = 'AGENDADA', fecha_cita = '${resp.data.fecha}'
          WHERE id = ${guia.id}`
      );
```

<a id="5"></a>
> **#5 · Crítico · Bloquea.** Otra inyección SQL, menos obvia: el dato sospechoso viene de **un tercero** (`resp.data.fecha`). Que lo devuelva un proveedor conocido no lo hace confiable. **Qué hacer:** parametriza (`$1`, `$2`) y valida que `fecha` sea una fecha válida.

```ts
    } catch (e) {}
```

<a id="6b"></a>
> **#6 · Alto · Plan de trabajo (parte 2).** Primero lo bueno: el `try/catch` es buena práctica. Lo que falta es fortalecer cómo identificamos la excepción: así, si el proveedor responde `500` o el `UPDATE` falla, la guía sigue pendiente y **nadie se entera**. Registra el error con el número de guía, cuenta los fallos y pasa la guía a `ERROR_AGENDAMIENTO` tras N intentos.

<a id="14"></a>
> **#14 · Medio · Plan de trabajo.** Sin pruebas y con la lógica dentro del *handler*. Separa un caso de uso `AgendarGuia` con interfaces y pruebas unitarias (hexagonal, como en los servicios nuevos).

<a id="18"></a>
> **#18 · Medio · Plan de trabajo.** Configuración, *middlewares*, ruta y `cron` viven en un solo archivo. Sepáralos por responsabilidad: `app.ts`, `routes/citas.ts`, `jobs/agendar-guias.ts` y `server.ts`. Es buen momento, con el servicio aún pequeño.

<a id="9"></a>
> **#9 · Alto · Plan de trabajo.** Sin autenticación ni tenant, cualquiera puede pedir las citas de cualquier cliente: con clientes financieros, es un incidente de confidencialidad. Valida un JWT, toma el `tenant` **del token** y filtra todo por `tenant_id` (en la Parte A, con RLS).

```ts
app.listen(3000);
```

<a id="16"></a>
> **#16 · Bajo · No bloquea.** Usa `process.env.PORT ?? 3000`, apaga ordenadamente ante `SIGTERM` y agrega `GET /health`.

<a id="17"></a>
> **#17 · Bajo · No bloquea.** Pasa a logs estructurados (`pino`) con `tenant`, `guia` y `evento`, y agrega métricas del ciclo.

## Para volver a pedir review

**Innegociable:** token rotado y variable implementada (me confirmas), sin `NODE_TLS_REJECT_UNAUTHORIZED`, SQL parametrizado con la respuesta del proveedor validada, `tsc` en verde y el endpoint siempre responde, sin datos personales en logs.

**Plan de trabajo que me propongas:** #6, #7, #9, #11, #12, #13, #14 y #18. #10 lo cerramos primero conversando; #15 a #17 pueden esperar.

Ofrezco un espacio de validación conjunta, en pareja si quieres, para resolver dudas y orientarte técnicamente. Lo más valioso de esta ronda es llevarte el **porqué** de cada punto.
