## Qué cambia

<!-- En una o dos frases. Si hay un issue relacionado, referencialo con "Closes #123". -->

## Por qué

<!-- El problema que resuelve. Si ya se discutió en un issue, alcanza con el link. -->

## Cómo lo probaste

<!-- Qué corriste, o qué pasos seguiste a mano. -->

---

- [ ] Todos los commits están firmados con `-s` ([DCO](../CONTRIBUTING.md#dco))
- [ ] `npm run check` pasa
- [ ] Si toqué `packages/engine`, sigue sin dependencias de red ni de base de datos
- [ ] Si cambié el formato de escenario: hasta el primer release alcanza con cambiarlo. Después habrá que subir `SCHEMA_VERSION` y escribir la migración
