# Code review — MR «Primer endpoint de Agendamiento + proceso programado»

> **Qué es este documento.** Esta es la **versión extendida**, incluida para que se aprecie **cómo enseño**, que es lo que pide el enunciado: cada hallazgo con su porqué, alternativas y ejemplos. En la práctica entregaría al desarrollador la [versión compacta](code-review-compacto.md), para que la entienda y actúe sin abrumarse. Ambas tienen los mismos 18 hallazgos y la misma clasificación.

**Veredicto: cambios solicitados (no se puede hacer merge todavía).**

Gracias por abrir el MR con un alcance pequeño: un endpoint y un proceso, fáciles de revisar. Los comentarios de intención (`// Cada 5 minutos agenda las guias pendientes`) y el `try/catch` alrededor de la llamada al proveedor muestran que ya piensas en que el sistema no se rompa. Dejé 18 comentarios y para cada uno explico el porqué y cómo arreglarlo, no solo qué está mal.

**Cómo está organizado.** Hay **6 hallazgos innegociables** (#1, #2, #3, #4, #5 y #8): son de seguridad (inyección SQL, secreto expuesto, consumo inseguro del proveedor y datos personales en los logs). Con el contexto actual de ataques informáticos y el historial de la compañía con ese tipo de incidentes, no podemos fusionar nada con ellos. **El resto** (#6, #7, #9, #10 y lo demás) es importante según su severidad, pero **no lo tienes que resolver todo hoy**: propón tú un plan de trabajo con orden y fechas, y lo acordamos juntos.

**Lo primero, antes de tocar el código:** el token `sk_live_...` ya quedó en el historial de Git. Gestiona la **rotación hoy** y confírmame cuando la variable de entorno esté implementada (ver [#2](#2)); borrar la línea del MR no lo protege.

## Resumen por severidad

| # | Severidad | ¿Bloquea? | Tema |
|---|---|---|---|
| [1](#1) | Crítico | **Sí, innegociable** | Inyección SQL en `GET /citas` |
| [2](#2) | Crítico | **Sí, innegociable** | Secreto de producción en el código |
| [3](#3) | Crítico | **Sí, innegociable** | Validación TLS desactivada en todo el proceso |
| [4](#4) | Crítico | **Sí, innegociable** | El endpoint no compila y no responde si la ciudad no es Medellín |
| [5](#5) | Crítico | **Sí, innegociable** | Inyección SQL en el `UPDATE` (con datos del proveedor) |
| [6](#6) | Alto | Plan de trabajo | `catch (e) {}` silencia los errores; la primera consulta del cron no tiene `try` |
| [7](#7) | Alto | Plan de trabajo | El cron puede solaparse y duplicar llamadas al proveedor |
| [8](#8) | Alto | **Sí, innegociable** | Datos personales (teléfono, dirección) en los logs |
| [9](#9) | Alto | Plan de trabajo | Sin tenant ni autenticación |
| [10](#10) | Alto | Primero conversamos | El servicio escribe en las tablas del monolito |
| [11](#11) | Medio | Plan de trabajo | Sin *timeout*, sin reintentos y procesamiento secuencial |
| [12](#12) | Medio | Plan de trabajo | Sin validación de entrada; errores de `async` en Express 4 |
| [13](#13) | Medio | Plan de trabajo | `SELECT *` sin límite |
| [14](#14) | Medio | Plan de trabajo | Sin pruebas y lógica dentro del *handler* |
| [15](#15) | Bajo | No | `CORS` abierto a cualquier origen |
| [16](#16) | Bajo | No | Puerto fijo y sin apagado ordenado |
| [17](#17) | Bajo | No | Logs sin estructura, ni métricas |
| [18](#18) | Medio | Plan de trabajo | Rutas, middlewares y cron en un solo archivo |

## Código con comentarios en línea

```ts
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import cron from 'node-cron';
import { pool } from './db';
```

> **Nota positiva.** Separar `pool` en `./db` es lo correcto: la conexión vive en un solo lugar y se puede sustituir en pruebas.

```ts
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
```

<a id="3"></a>
> **#3 · Crítico · Bloquea (innegociable).** Esta línea apaga la verificación de certificados **para todo el proceso**: la llamada al proveedor, la conexión a la BD y cualquier otra. Con ella, cualquiera que se ponga en medio de la red (*man-in-the-middle*) puede leer y alterar lo que enviamos, incluido el token.
>
> Entiendo la tentación: suele aparecer cuando un certificado de pruebas da error y esta línea hace que «funcione». Pero lo que oculta es el problema real. **Qué hacer:** quítala. Si el proveedor tiene un certificado de una CA propia, agrégala con `NODE_EXTRA_CA_CERTS` o con un `https.Agent({ ca })` solo para esa llamada. Si es un certificado vencido o mal emitido, hay que pedirle al proveedor que lo corrija.

```ts
const PROVIDER_TOKEN = 'sk_live_9f8a7b6c5d4e3f2a1b';
```

<a id="2"></a>
> **#2 · Crítico · Bloquea (innegociable).** Un secreto de producción (`sk_live_`) en el código queda en el historial de Git para siempre, y lo ve cualquiera con acceso al repositorio o a sus copias. Dejarlo «quemado» y subirlo ya lo vulneró, aunque el MR no se fusione. **Qué hacer, en este orden:**
> 1. Gestiona **ahora** la rotación del token con el proveedor. Considéralo comprometido.
> 2. Léelo de una variable de entorno inyectada desde **Secret Manager** (`process.env.PROVIDER_TOKEN`), y haz que el servicio falle al arrancar si no está. **Escríbeme cuando la rotación y la variable estén implementadas**, y lo verifico antes de seguir con el resto.
> 3. Agrega un escáner de secretos al *pipeline* (por ejemplo `gitleaks`) para que esto lo detecte una máquina la próxima vez.

```ts
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
```

<a id="15"></a>
> **#15 · Bajo · No bloquea.** `origin: '*'` permite que cualquier página web llame a este API desde el navegador. CORS solo importa si el consumidor es un navegador; aquí los consumidores son el monolito y el call center (servidor a servidor). Lo más simple es **no habilitar CORS**. Si algún día lo necesitas, lista los orígenes permitidos de forma explícita.

```ts
// Citas de una ciudad para una fecha
app.get('/citas', async (req, res) => {
  const { ciudad, fecha } = req.query;
  const sql = `SELECT * FROM agenda_citas
               WHERE ciudad = '${ciudad}' AND fecha = '${fecha}'`;
  const result = await pool.query(sql);
```

<a id="1"></a>
> **#1 · Crítico · Bloquea (innegociable).** Estás pegando `ciudad` y `fecha` **directamente** dentro del SQL, y vienen de la URL. Alguien puede mandar `?ciudad=' OR '1'='1` y leer toda la tabla, o cosas peores. Esto es inyección SQL y está en el primer puesto del OWASP Top 10.
>
> **Por qué pasa:** el motor no distingue entre «el SQL que escribiste» y «el dato que llegó»; todo es texto. **Qué hacer:** usa **consultas parametrizadas**, que envían la sentencia y los valores por separado:
>
> ```ts
> const { rows } = await pool.query(
>   'SELECT id, ciudad, fecha, guia_numero FROM agenda_citas WHERE tenant_id = $1 AND ciudad = $2 AND fecha = $3',
>   [tenantId, ciudad, fecha],
> );
> ```
>
> Regla práctica: si ves `${...}` o `+` dentro de un string SQL, para y pregúntate de dónde viene ese valor.

<a id="13"></a>
> **#13 · Medio · Plan de trabajo.** `SELECT *` devuelve todas las columnas, hoy y las que se agreguen mañana (¿alguna con datos personales?), y sin `LIMIT` una ciudad con mucho volumen puede devolver decenas de miles de filas. Elige las columnas que el consumidor necesita y pagina (`LIMIT`/`OFFSET` o por cursor).

<a id="12"></a>
> **#12 · Medio · Plan de trabajo.** Dos cosas del mismo tipo: (a) no se valida que `ciudad` y `fecha` existan ni tengan el formato esperado (`req.query` puede ser un arreglo o un objeto); un esquema con `zod` resuelve eso y responde `400` con un mensaje útil. (b) En Express 4, si el `await` falla, la promesa rechazada **no** llega al manejador de errores. Lo probé: la petición no recibe respuesta y, en Node 22, el rechazo no capturado **termina el proceso**, así que una caída de la BD en este endpoint tumba todo el servicio, cron incluido. Envuelve el *handler* en un `try/catch` que llame a `next(err)`, o usa un *wrapper* de `async`.

```ts
  if ciudad = “MEDELLIN” {
     res.json(result.rows);
  }
});
```

<a id="4"></a>
> **#4 · Crítico · Bloquea (innegociable).** Tres problemas en estas tres líneas:
> 1. **No compila:** a `if` le faltan los paréntesis, `=` asigna en vez de comparar (`===`) y las comillas `“ ”` son tipográficas, no `"`. El MR no pasa ni `tsc`.
> 2. **Regla de negocio fija:** solo responde para Medellín. Nuestro servicio atiende a 30 clientes en muchas ciudades; esa condición no debería existir.
> 3. **Si la condición es falsa, nunca se llama a `res`**: el cliente espera hasta el *timeout*.
>
> Una pregunta, para validar y no para acusar: **¿llegaste a compilarlo?** Lo pregunto porque con tu experiencia sé que sueles ser cuidadoso, y yo lo compilé y falla en el primer `tsc` (`'(' expected` e `Invalid character`). Si funcionaba en tu máquina, probablemente se editó después al copiarlo. Es justo para lo que sirve un test: uno de este endpoint habría fallado en el primer intento. **Qué hacer:** quita el `if`, responde siempre (`res.json(rows)`, o `404`/`200` con lista vacía si no hay citas) y pasa `tsc` y el test en CI antes de pedir review.

```ts
// Cada 5 minutos agenda las guias pendientes
cron.schedule('*/5 * * * *', async () => {
  const pendientes = await pool.query(
     "SELECT * FROM guias WHERE estado = 'PENDIENTE_AGENDA'"
  );
```

<a id="7"></a>
> **#7 · Alto · Plan de trabajo.** Este proceso tiene dos problemas de concurrencia que hacen que una guía se agende dos veces:
> - **Solapamiento:** si una ejecución tarda más de 5 minutos (con miles de guías y una llamada HTTP por cada una, es probable), arranca otra encima y ambas leen las **mismas** pendientes.
> - **Varias instancias:** en Cloud Run el servicio puede escalar a más de una instancia, y cada una tiene su propio `cron`. Cada guía se procesaría N veces.
>
> Eso, además, llama N veces al proveedor por la misma guía y consume N *slots*. **Qué hacer:** (1) reclama las guías de forma atómica con `FOR UPDATE SKIP LOCKED` (o un `UPDATE ... RETURNING` que las pase a `AGENDANDO`) para que dos procesos no tomen la misma fila; (2) mueve la programación fuera del proceso web: **Cloud Scheduler** que dispara un **Cloud Run Job**, como propone el diseño de la Parte A; (3) procesa en lotes con `LIMIT` en vez de cargar todas las pendientes.
>
> Hay además un problema de orden: llamas al proveedor **antes** de guardar en la BD. Si el proveedor responde bien y el `UPDATE` falla, en la siguiente pasada vuelves a pedir un *slot* para la misma guía. Envía una clave de idempotencia (por ejemplo `Idempotency-Key: <id de la guía>`) si el proveedor la admite, o registra primero la intención (`AGENDANDO`) y luego llama.

<a id="6"></a>
> **#6 · Alto · Plan de trabajo (parte 1).** Esta consulta está **fuera** del `try`. Si falla (la BD no responde, por ejemplo), la promesa se rechaza sin nadie que la capture y, desde Node 15, un rechazo no capturado **termina el proceso** por defecto. Un hipo de la BD tumbaría el servicio, incluido el endpoint.

```ts
  for (const guia of pendientes.rows) {
    console.log('Agendando', guia.numero, guia.telefono, guia.direccion);
```

<a id="8"></a>
> **#8 · Alto · Bloquea (innegociable).** Estás escribiendo **teléfono y dirección** de personas en los logs. Los logs viajan a la herramienta de observabilidad, los leen más personas de las que acceden a la tabla y se conservan mucho tiempo. Son datos personales y están cubiertos por la Ley 1581 de 2012 (hábeas data) y nuestros acuerdos con los bancos. **Qué hacer:** registra solo identificadores (`tenant`, `numero` de guía), nunca teléfono ni dirección. Y si algún día necesitas depurar con datos, que sea con acceso controlado, no con `console.log`.

```ts
    try {
      const resp = await axios.post(
         'https://proveedor-rutas.example.com/v1/slots',
         { direccion: guia.direccion },
         { headers: { Authorization: `Bearer ${PROVIDER_TOKEN}` } }
      );
```

<a id="11"></a>
> **#11 · Medio · Plan de trabajo.** Sin `timeout`, `axios` espera indefinidamente: una sola respuesta lenta del proveedor congela **todo el ciclo**, porque el `for` es secuencial. Tampoco hay reintentos con espera creciente ni un *circuit breaker* si el proveedor cae.
>
> Un cálculo rápido para dimensionarlo: con 40.000 guías al día y 300 ms por llamada, en serie son más de 3 horas. **Qué hacer:** `timeout` explícito (por ejemplo 5 s), reintentos acotados con *backoff*, y concurrencia limitada (por ejemplo 10 llamadas a la vez con `p-limit`) para no saturar al proveedor.

<a id="10"></a>
> **#10 · Alto · Primero conversamos.** Esta es una conversación de diseño más que un error tuyo, y **antes de opinar quiero entender por qué lo hiciste así**: ¿te dijeron que las tablas eran compartidas, o fue lo más directo para salir? Según tu respuesta:
> - **Si fue una definición que te dieron**, la revisamos juntos, porque contradice la arquitectura acordada.
> - **Si no había definición**, es una falta del equipo y no tuya: la cerramos hoy, con un acuerdo explícito de qué tabla es de quién.
>
> El punto técnico: el servicio nuevo está leyendo y **escribiendo directamente** las tablas `guias` y `agenda_citas`, que son del monolito y las leen call center, ruteo y reportes. En el diseño de la migración (ADR-001) el servicio es dueño de sus datos y el legado se mantiene actualizado por sincronización: **el sistema nuevo no puede afectar al monolito directamente**. Escribir aquí rompe esa regla y, peor, **dispara los triggers del monolito** sobre esas tablas.
>
> Y una pregunta que quiero entender: ¿por qué la fecha la decide el proveedor y no la regla de cobertura del cliente? Esa regla debería vivir en el dominio (ver el caso de uso «Agendar una guía» de la Parte C).

```ts
      await pool.query(
         `UPDATE guias SET estado = 'AGENDADA', fecha_cita = '${resp.data.fecha}'
          WHERE id = ${guia.id}`
      );
```

<a id="5"></a>
> **#5 · Crítico · Bloquea (innegociable).** Otra inyección SQL, y esta es menos obvia: el valor sospechoso no viene del usuario sino de `resp.data.fecha`, es decir, **de un tercero**. Un dato que viene de fuera de nuestro sistema no es de confianza solo porque lo devuelva un proveedor «conocido»: si cambia su formato o lo comprometen, el SQL ejecuta lo que mande. **Qué hacer:** parametriza también esto (`$1`, `$2`) y **valida** la respuesta (que `fecha` sea una fecha válida) antes de usarla.

```ts
    } catch (e) {}
  }
});
```

<a id="6b"></a>
> **#6 · Alto · Plan de trabajo (parte 2).** Primero lo bueno: **envolver la llamada en un `try/catch` es una buena práctica**, porque evita que un fallo de una guía rompa el ciclo entero. Lo que falta es fortalecer cómo identificamos y tratamos esa excepción, porque `catch (e) {}` se traga el error sin dejar rastro. Si el proveedor responde `500`, si el token expiró o si el `UPDATE` falla, la guía **sigue pendiente** y nadie se entera: ni un log, ni una métrica, ni una alerta. Es el tipo de fallo que se descubre cuando un cliente llama preguntando por qué su tarjeta no tiene cita.
>
> **Qué hacer:** como mínimo, registra el error con el identificador de la guía (sin datos personales) y cuenta los fallos. Mejor aún: guarda el número de intentos y el último error, y pasa la guía a un estado `ERROR_AGENDAMIENTO` tras N intentos para que alguien la revise, en lugar de reintentarla eternamente cada 5 minutos. Regla práctica: un `catch` vacío casi siempre es una decisión que se tomó por no decidir.

<a id="14"></a>
> **#14 · Medio · Plan de trabajo.** No hay pruebas, y toda la lógica está dentro del *handler* y del `cron`, lo que la hace imposible de probar sin levantar BD, HTTP y proveedor. Te propongo separar un caso de uso `AgendarGuia` que dependa de interfaces (repositorio, proveedor, reloj) y pruebas unitarias para él; es la estructura hexagonal que ya usamos en los servicios nuevos. Para esta rama pido, como mínimo, pruebas de los hallazgos críticos (el endpoint responde y no es inyectable). Antes de pasar de staging, el caso de uso con cobertura ≥ 90 %.

```ts
app.listen(3000);
```

<a id="16"></a>
> **#16 · Bajo · No bloquea.** Dos detalles de operación: (a) en Cloud Run el puerto lo define la variable `PORT`; usa `process.env.PORT ?? 3000`. (b) No hay apagado ordenado: ante `SIGTERM` (un despliegue o un escalado) el proceso muere a mitad de una agenda. Escucha `SIGTERM`, detén el `cron`, termina el trabajo en curso y cierra el `pool`. Agrega también un `GET /health` para el *health check*.

<a id="9"></a>
> **#9 · Alto · Plan de trabajo.** Hay un tema transversal que no aparece en una línea concreta: **no hay autenticación ni tenant**. Cualquiera que alcance el servicio puede pedir las citas de cualquier ciudad de cualquier cliente. Con 30 clientes financieros, que un banco vea las citas de otro es un incidente de confidencialidad, no un bug. El estándar de la empresa para servicios nuevos es multitenancy. **Qué hacer:** valida un JWT, toma el `tenant` **del token** (nunca del *query string*) y filtra todas las consultas por `tenant_id`. El `cron` también debe procesar por tenant. En la Parte A propongo reforzarlo con Row-Level Security en la BD.

<a id="17"></a>
> **#17 · Bajo · No bloquea.** `console.log` con texto libre es difícil de buscar y no se puede correlacionar entre servicios. Usa un *logger* estructurado (`pino`) con campos fijos (`tenant`, `guia`, `evento`, `duracion_ms`) y un identificador de correlación por petición, y agrega métricas (guías agendadas por minuto, fallos del proveedor, duración del ciclo). Es lo que nos permitirá ver el modo sombra de la migración.

<a id="18"></a>
> **#18 · Medio · Plan de trabajo.** Un comentario de estructura, que no apunta a una línea: en el mismo archivo conviven la configuración de Express, los *middlewares*, la ruta y el `cron`. Mientras todo esté junto, cada cambio toca el mismo archivo, no se puede probar una pieza sin levantar las demás y el `cron` se arranca solo por importar el módulo. **Qué hacer:** separa por responsabilidad, por ejemplo `app.ts` (configuración y *middlewares*), `routes/citas.ts` (la ruta, delgada), `jobs/agendar-guias.ts` (el proceso programado) y `server.ts` (arranque y apagado). Lo que hoy es lógica dentro del *handler* pasa a un caso de uso (ver [#14](#14)). Es un buen momento para hacerlo, mientras el servicio todavía es pequeño.

## Cómo podría quedar el endpoint (referencia, no obligatorio)

Esto es una guía para que veas cómo se aplican #1, #4, #9, #12 y #13 juntos. No hace falta copiarlo tal cual:

```ts
const consulta = z.object({
  ciudad: z.string().trim().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

app.get('/v1/citas', autenticar, async (req, res, next) => {
  try {
    const { ciudad, fecha } = consulta.parse(req.query);
    const { rows } = await pool.query(
      `SELECT id, guia_numero, fecha
         FROM agenda_citas
        WHERE tenant_id = $1 AND ciudad = $2 AND fecha = $3
        ORDER BY id LIMIT 500`,
      [req.tenantId, ciudad.toUpperCase(), fecha],
    );
    res.json(rows);
  } catch (err) {
    next(err); // un manejador central responde 400/500 y registra
  }
});
```

## Para volver a pedir review

**Innegociable, antes de fusionar:**

- [ ] Token rotado, variable de entorno implementada y sin secretos en el repo (con `gitleaks` en el *pipeline*). Me confirmas por mensaje.
- [ ] Sin `NODE_TLS_REJECT_UNAUTHORIZED`.
- [ ] Todo SQL parametrizado; entradas y respuesta del proveedor validadas.
- [ ] El endpoint compila (`tsc` en verde) y responde siempre.
- [ ] Sin teléfono ni dirección en los logs.

**Plan de trabajo, propuesto por ti:** #6, #7, #9, #11, #12, #13, #14 y #18, con orden y fechas. #10 lo cerramos primero en una conversación. #15, #16 y #17 los puedes dejar para después.

## Cómo seguimos

Si algo no queda claro, ofrezco un **espacio de validación en conjunto** (30 minutos, en pareja si quieres) para resolver las dudas que queden y orientarte técnicamente. Lo más valioso de esta ronda no es la lista, sino llevarte el **porqué** de cada punto, para que el próximo MR salga limpio.
