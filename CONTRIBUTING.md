# Contribuir a Crisol

Gracias por el interés. Se aceptan issues y pull requests de cualquiera.

## Antes de escribir código

Si el cambio es más que un arreglo puntual, **abrí un issue primero**. El proyecto tiene un [documento de visión y arquitectura](docs/01-vision-y-arquitectura.md) con un alcance definido a propósito; discutir la idea antes evita que trabajes en algo que después no entra.

Lo que está explícitamente fuera de alcance está listado en la [sección 10 de ese documento](docs/01-vision-y-arquitectura.md#10-alcance). No es capricho: cada cosa que entra hay que mantenerla para siempre.

## DCO

Este proyecto usa el **Developer Certificate of Origin**. Firmá tus commits agregando una línea al mensaje.

```bash
git commit -s -m "arregla el reloj al reanudar una fase"
```

El `-s` agrega automáticamente:

```
Signed-off-by: Tu Nombre <tu@email.com>
```

Con eso certificás lo que dice el [DCO 1.1](https://developercertificate.org/): que tenés derecho a aportar ese código y que entendés que se publica bajo la licencia del proyecto (AGPL-3.0).

Si te olvidaste en el último commit: `git commit --amend -s --no-edit`

## Entorno de desarrollo

Requiere Node 22+ y Docker.

```bash
npm install
docker compose up -d db     # sólo la base de datos
npm run dev                 # servidor y frontend con recarga en caliente
```

```bash
npm run check               # tipos y tests, todo junto
```

Antes de abrir un PR, que `npm run check` pase. Es lo mismo que corre CI.

## Estructura

```
packages/shared   Tipos y esquemas del formato de escenario
packages/engine   Motor de estado puro (sin red, sin base de datos)
apps/server       API, websockets y persistencia
apps/web          Interfaz (autoría + las cinco superficies en vivo)
```

**El motor va sin dependencias de red ni de base de datos.** Es lo que hace posibles la reconexión, la recuperación ante caídas y el reporte final. Si un PR mete un `fetch` o una consulta SQL dentro de `packages/engine`, no entra.

## Idiomas

El código, los nombres de variables y los comentarios van **en inglés**. La documentación y la interfaz están en español e inglés. Issues y PRs, en el idioma que te salga.

## Escenarios

Si querés aportar un escenario en lugar de código, mejor todavía — es lo que más falta le hace al proyecto. Exportalo desde tu instancia y adjuntá el `.zip` en un issue con la etiqueta `escenario`.
