# Batería en el móvil: qué he mirado y qué propongo (2.17)

No se puede medir la batería desde la nube (no hay móvil). He hecho lo que sí se puede: revisar el
código en busca de trabajo continuo, y dejar un procedimiento para medir en el iPhone.

## Lo que hay en marcha mientras la app está abierta y quieta

| Qué | Cada cuánto | Coste |
|---|---|---|
| Bloqueo por inactividad (`eli_security.js`) | 15 s | Despreciable (una comparación de fechas) |
| «Hoy» de la vista GTD (cambio de día) | 60 s | Despreciable |
| Guardado de la copia local (`file_persister.js`) | 1,5 s después de cada cambio | Solo al editar; con ficheros muy grandes escribe todo el texto cada vez |
| Reintento de sincronización si Dropbox no responde | 30 s | Solo si hay fallo |
| Pantalla dividida (guarda qué hay en cada lado) | 1 s | Solo en pantalla dividida (no en móvil) |
| Animaciones infinitas | — | Ninguna (solo un «pulso» en el gráfico de hábitos) |

Conclusión: **no hay sondeos ni animaciones continuas** que expliquen un gasto alto con la app
quieta. Lo que más gasta suele ser CPU al editar o al abrir la vista GTD.

## Candidatos reales (por orden de probabilidad)

1. **Recalcular todas las tareas** (`buildTasks`) en cada cambio, con muchos ficheros cargados.
   Ya hay caché por fichero; si es lo que pesa, se puede aplazar el recálculo mientras se escribe.
2. **Guardar la copia local** con ficheros grandes: ya está agrupado (1,5 s); se puede subir a 3 s
   en móvil.
3. **Sincronizar al volver a la app** (cada vez que se pasa a primer plano): se puede limitar a
   una vez cada X minutos.
4. **Sombras y desenfoques** de CSS en listas largas (más trabajo de GPU al desplazar).

## Cómo medir (10 minutos, con el Mac)

1. iPhone: Ajustes → Safari → Avanzado → **Inspector web**. Mac: Safari → Ajustes → Avanzadas →
   *Mostrar funciones para desarrolladores*.
2. Con el iPhone conectado por cable y la app abierta: Safari (Mac) → **Desarrollo** → tu iPhone →
   ORGanice.
3. Pestaña **Cronologías** → activa **CPU** y **Energía**. Graba 2 minutos en cada caso:
   (a) app abierta y quieta en GTD, (b) desplazando una lista larga, (c) editando una tarea.
4. Si (a) está en ~0 % de CPU, el problema no es la app quieta. Si (b) o (c) sube mucho, dime qué
   caso y qué fichero (cuántas tareas) y lo ataco con el candidato que corresponda.

No he cambiado código de batería en 2.17: sin medida sería adivinar.
