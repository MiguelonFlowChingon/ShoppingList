# ShoppingList

Shopping list to track all my family neccessities.


Lista de la compra compartida para la familia. Es una app web instalable en Android y iPhone:
se abre desde un enlace y se añade a la pantalla de inicio. No hace falta registrarse.
Quien tenga el enlace secreto de la lista puede verla y cambiarla.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `app.js` | La app |
| `config.js` | Datos de conexión con tu proyecto de Firebase (rellenar una vez) |
| `firestore.rules` | Reglas de seguridad para pegar en Firebase |
| `manifest.webmanifest`, `sw.js`, iconos | Permiten instalarla como app y abrirla sin cobertura |

## Puesta en marcha (una sola vez)

1. **Firebase:** crea un proyecto en https://console.firebase.google.com, activa
   *Firestore Database* en modo producción y pega en la pestaña *Reglas* el contenido de `firestore.rules`.
2. **Configuración:** en *Configuración del proyecto → Tus apps*, registra una app web
   y copia el bloque `firebaseConfig` en `config.js`.
3. **Publicar:** sube estos archivos a un repositorio de GitHub y activa
   *Settings → Pages → Deploy from a branch → main / (root)*.

## Uso

- La primera persona abre la web y pulsa **Crear una lista nueva**.
- **Invitar a la familia** comparte el enlace secreto (por WhatsApp, por ejemplo).
- Para instalarla:
  - **Android (Chrome):** menú ⋮ → *Añadir a pantalla de inicio* o *Instalar app*.
  - **iPhone (Safari):** botón Compartir → *Añadir a pantalla de inicio*.
- Si al abrir la app instalada pide el enlace, pégalo una vez y lo recordará.

## Seguridad

El enlace de la lista es la llave. Compártelo solo con la familia. Si se filtra,
crea una lista nueva (borra los datos del navegador o usa otro móvil) y manda el nuevo enlace.
