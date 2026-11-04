# Guía de configuración Multi-Tenant

## ¿Qué se hizo?

Se migró el sistema a arquitectura **multi-tenant**. Cada cliente (tienda) vive en su propio espacio aislado dentro de Firestore:

```
/tenants/{tenantId}/products/
/tenants/{tenantId}/movements/
/tenants/{tenantId}/users/
/tenants/{tenantId}/settings/global
/tenants/{tenantId}/tienda_settings/dulces
/tenants/{tenantId}/tienda_settings/pulseras
/tenant_registry/{email}   ← directorio global para login
```

Los datos de un cliente **nunca son visibles** para otro cliente.

---

## PASO 1 — Aplicar reglas de seguridad en Firebase Console

> ⚠️ Este paso es obligatorio. Sin las reglas, los datos siguen siendo públicos.

1. Abre [https://console.firebase.google.com](https://console.firebase.google.com)
2. Selecciona el proyecto **gestor-de-inventario-853d8**
3. En el menú izquierdo → **Firestore Database**
4. Haz clic en la pestaña **Rules**
5. Borra todo el contenido actual
6. Copia y pega el contenido del archivo `firestore.rules` de este proyecto
7. **Importante:** cambia la línea con tu email real:
   ```
   && request.auth.token.email == "admin@tusistema.com"
   ```
   Reemplaza `admin@tusistema.com` por tu correo de Gmail.
8. Haz clic en **Publish**

---

## PASO 2 — Cambiar la contraseña maestra del panel

Abre `admin-panel.html` y busca esta línea:

```js
const MASTER_PASSWORD = 'MASTER_2026_ADMIN';
```

Cámbiala por una contraseña segura que solo tú conozcas.

---

## PASO 3 — Migrar los datos existentes (clientes actuales)

Si ya tienes datos en Firestore (productos, usuarios, movimientos en las colecciones raíz), necesitas moverlos al nuevo formato de tenant.

### Opción A — Migración manual desde admin-panel.html (recomendada)

1. Abre `admin-panel.html` en tu navegador
2. Ingresa la contraseña maestra
3. Crea un tenant nuevo para cada cliente existente
4. El sistema genera un `tenantId` automáticamente
5. Desde la consola de Firebase, mueve los documentos de las colecciones raíz (`products`, `movements`, `users`) a `/tenants/{tenantId}/`

### Opción B — Script de migración en consola de Firebase

Ejecuta esto en la **consola del navegador** mientras estás en Firebase Console (Firestore):

```js
// ⚠️ Solo ejecutar UNA vez. Cambia TENANT_ID por el ID real.
const TENANT_ID = 'pon-aqui-el-tenant-id';

// Este script es orientativo. Firebase Console no permite
// scripts de migración directos — usa Firebase Admin SDK
// desde Node.js si tienes muchos datos.
console.log('Usa Firebase Admin SDK para migraciones masivas.');
console.log('TenantId destino:', TENANT_ID);
```

### Opción C — Firebase Admin SDK (para muchos datos)

Si tienes cientos de productos, lo mejor es un script Node.js:

```js
// migrate.js — ejecutar con: node migrate.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // descárgalo de Firebase Console

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TENANT_ID = 'pon-aqui-el-tenant-id'; // ID del tenant destino

async function migrar() {
  const colecciones = ['products', 'movements', 'users'];

  for (const col of colecciones) {
    const snap = await db.collection(col).get();
    console.log(`Migrando ${snap.size} documentos de "${col}"...`);

    for (const doc of snap.docs) {
      await db
        .collection('tenants').doc(TENANT_ID)
        .collection(col).doc(doc.id)
        .set(doc.data());
    }
    console.log(`✅ "${col}" migrado.`);
  }

  // Migrar settings
  const settingsSnap = await db.collection('settings').doc('global').get();
  if (settingsSnap.exists) {
    await db.collection('tenants').doc(TENANT_ID)
            .collection('settings').doc('global')
            .set(settingsSnap.data());
    console.log('✅ settings/global migrado.');
  }

  console.log('🎉 Migración completa.');
}

migrar().catch(console.error);
```

Para obtener `serviceAccountKey.json`:
1. Firebase Console → Configuración del proyecto ⚙️
2. Pestaña **Cuentas de servicio**
3. **Generar nueva clave privada**

---

## PASO 4 — Crear tu primer cliente desde el panel

1. Abre `admin-panel.html` en el navegador
2. Ingresa la contraseña maestra
3. Haz clic en **➕ Nuevo cliente**
4. Rellena:
   - Nombre de la tienda: `Panadería López`
   - Nombre del admin: `Roberto López`
   - Correo: `roberto@panaderia.com`
   - Contraseña inicial: `1234` (el cliente la cambia después)
   - Plan: `free` o `pro`
5. Haz clic en **Crear cliente**
6. Se abre el panel de detalle con los **enlaces de acceso**

---

## PASO 5 — Entregar acceso al cliente

El panel de detalle te muestra dos URLs que debes enviarle al cliente:

| URL | Para qué sirve |
|-----|----------------|
| `index.html?tenant=abc123` | Gestor de inventario (uso interno) |
| `tienda.html?tenant=abc123` | Tienda pública para sus clientes |

**Ejemplo de mensaje para el cliente:**

```
Hola Roberto, aquí están tus accesos al sistema:

🖥 Gestor de inventario:
https://tudominio.com/index.html?tenant=abc123

🛍 Tienda pública:
https://tudominio.com/tienda.html?tenant=abc123

Usuario: roberto@panaderia.com
Contraseña: 1234 (te recomendamos cambiarla en Ajustes → Usuarios)
```

---

## PASO 6 — Publicar en GitHub Pages / tu hosting

Si usas GitHub Pages, sube todos los archivos al repositorio.
Las URLs quedarán así:

```
https://tuusuario.github.io/inventario/admin-panel.html
https://tuusuario.github.io/inventario/index.html?tenant=abc123
https://tuusuario.github.io/inventario/tienda.html?tenant=abc123
```

---

## Estructura de archivos del proyecto

```
gestor de inventario/
├── index.html          ← App principal (gestor)
├── app.js              ← Lógica del gestor (multi-tenant)
├── tenants.js          ← Módulo de gestión de tenants
├── admin-panel.html    ← Tu panel maestro (privado)
├── tienda.html         ← Página pública de selección de tienda
├── dulces.html         ← Tienda pública de dulces
├── pulseras.html       ← Tienda pública de pulseras
├── firestore.rules     ← Reglas de seguridad (aplicar en Firebase Console)
├── styles.css
├── sw.js
├── manifest.json
└── SETUP.md            ← Esta guía
```

---

## Preguntas frecuentes

**¿Un cliente puede ver los datos de otro?**
No. Las reglas de Firestore lo impiden a nivel de base de datos. Cada tenant solo puede leer y escribir dentro de `/tenants/{suTenantId}/`.

**¿Qué pasa si el cliente pierde su URL con el tenantId?**
Puedes enviársela de nuevo desde el panel maestro → botón 🔍 Ver → campo "URL Gestor".

**¿Cómo suspendo a un cliente que dejó de pagar?**
En el panel maestro → botón ⏸ Suspender. Sus datos se conservan pero no podrá acceder.

**¿Cómo elimino un cliente completamente?**
1. Desde el panel maestro → 🗑 Eliminar (borra el registro del tenant)
2. Desde Firebase Console → borra manualmente la carpeta `/tenants/{tenantId}/`

**¿Puedo tener múltiples admins por cliente?**
Sí. Desde el gestor del cliente (index.html) → Usuarios → Agregar Usuario.

**¿Los datos del cliente se sincronizan en tiempo real?**
Sí. Todos los listeners usan `onSnapshot` apuntando a `/tenants/{id}/colección`.
