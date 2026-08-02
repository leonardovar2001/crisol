# Crisol

**Plataforma auto-hospedada para diseñar y conducir ejercicios de simulación (tabletop exercises).**

Un crisol es el recipiente donde se somete algo a temperatura extrema para ver de qué está hecho realmente. Eso hace esta herramienta con un equipo: lo pone bajo presión para descubrir qué pasa de verdad cuando el plan se toca con la realidad.

Un facilitador lanza una sesión en vivo. Los participantes entran desde el móvil con un código o un QR. La información llega por fases —texto, imágenes, audio, video, gráficos que se mueven— y cada rol ve sólo lo que le corresponde. Al cerrar cada fase, la mesa vota qué hacer. Lo votado mueve el ejercicio.

Nació pensada para concientización en ciberseguridad, pero **el motor no sabe de ciberseguridad**. Un incidente de ransomware, una crisis sanitaria, un derrame químico o una crisis de reputación son el mismo objeto: fases, información asimétrica y decisiones bajo presión de tiempo.

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
