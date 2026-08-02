# Crisol

**Plataforma auto-hospedada para diseñar y conducir ejercicios por fases con decisiones en grupo.**

Un crisol es el recipiente donde se somete algo a alta temperatura para ver de qué está hecho. Eso hace esta herramienta con un grupo: lo pone frente a una situación y deja ver cómo decide.

Alguien conduce una sesión en vivo. Los participantes entran desde el móvil con un código o un QR. La información llega por fases —texto, imágenes, audio, video, gráficos que se mueven— y cada rol ve sólo lo que le corresponde. Al cerrar cada fase, el grupo vota qué hacer, y lo votado cambia lo que pasa después.

## Para qué sirve

El uso para el que nació, y el mejor cubierto hoy, es **simular una crisis**: un incidente de ciberseguridad, una emergencia, una caída de servicio. El grupo recibe información parcial, discute contrarreloj y decide.

Pero el motor no sabe de crisis, ni de ciberseguridad, ni de ninguna materia. Sabe de cuatro cosas: **fases** que se suceden, **roles** que ven información distinta, **decisiones** que toma el grupo y **consecuencias** que cambian lo que viene después. Con sólo eso:

- Una clase de historia revive la Revolución Francesa: en cada etapa la Asamblea decide, y el ejercicio sigue por donde la llevó esa decisión.
- Una de química arranca con un elemento. Si el grupo elige sodio, la fase siguiente muestra un compuesto con su foto; si elige azufre, muestra otro distinto. No hay reloj ni crisis: es explorar qué pasa si.
- Una práctica de primeros auxilios, un debate de ética, un ejercicio de idioma, una inducción de personal nuevo.

Ninguno de esos casos necesita una línea de código nueva: son escenarios distintos escritos con las mismas piezas. **Si se te ocurre un uso que no está en esta lista, es probable que entre** — y si no entra, [abrí un issue](https://github.com/leonardovar2001/crisol/issues) y contanos qué le falta.

> **Estado: en construcción.** Todavía no hay una versión usable. Ver [la hoja de ruta](docs/01-vision-y-arquitectura.md#10-alcance).

---

## Cada uno levanta la suya

No hay servicio central, no hay cuentas en la nube de nadie, no hay nada que pagar. Instalás tu instancia, es tuya, y los datos de tus ejercicios no salen de tu infraestructura.

```bash
git clone https://github.com/leonardovar2001/crisol.git
cd crisol
cp .env.example .env    # editá SESSION_SECRET y POSTGRES_PASSWORD
docker compose up -d
```

Listo en http://localhost:3000

## Documentación

- [Visión y arquitectura](docs/01-vision-y-arquitectura.md) — qué es, cómo está pensado, modelo de datos y alcance.
- [Cómo contribuir](CONTRIBUTING.md)

## Licencia

**[GNU AGPL-3.0](LICENSE).** Las contribuciones se aceptan bajo [DCO](CONTRIBUTING.md#dco).

El **nombre** se rige aparte de la licencia: ver [TRADEMARK.md](TRADEMARK.md).

Copyright © 2026 Leonardo Vargas y contribuidores.
