# Política de Privacidad · Monsters Boxing Hero

**App:** Monsters Boxing Hero (`com.waxblythe.monstersboxinghero`)
**Publicador:** MAI Software
**Última actualización:** 21 de junio de 2026
**Contacto:** `CORREO_DE_CONTACTO`

> Versión hosteable para enviar a las tiendas: [`public/privacy.html`](public/privacy.html)
> (se publica junto con el juego, p. ej. en `https://TU-DOMINIO/privacy.html`).

---

**En resumen:** no recopilamos, almacenamos ni compartimos datos personales. La cámara se usa
únicamente en tu dispositivo para detectar tus movimientos durante el juego; las imágenes nunca
se guardan ni se envían a ningún servidor. El juego no tiene cuentas, ni anuncios, ni analítica,
ni rastreadores.

## 1. Uso de la cámara
- Los fotogramas se procesan **en tiempo real y solo en tu dispositivo** con un modelo de
  detección de pose (MediaPipe) incluido dentro de la App.
- De cada fotograma solo se derivan **coordenadas** (cabeza y manos) como mando del juego; el
  fotograma se descarta al instante.
- **No se graba vídeo, no se guardan imágenes y no se envía ningún dato de la cámara** a Internet
  ni a terceros.
- El uso de la cámara es **opcional**: hay controles de teclado y táctiles, y solo se accede a la
  cámara con tu consentimiento del sistema.

## 2. Datos en tu dispositivo
Progreso, ajustes, colección y ranking local se guardan **solo en tu dispositivo** y no están
ligados a tu identidad. Se eliminan borrando los datos de la App o desinstalándola.

## 3. Lo que NO recopilamos
Sin registro ni cuentas · sin nombre/email/ubicación/contactos/ID de publicidad · sin analítica,
publicidad, cookies ni SDK de terceros · sin compras reales (el "gacha" usa fragmentos del juego).

## 4. Internet
El juego funciona **sin conexión**: todos los recursos (incluido el modelo de movimiento) van
dentro de la App. Puede declararse el permiso de Internet por requisitos de la plataforma, pero
**no se transmiten datos personales ni de la cámara**.

## 5. Permisos
- **Cámara** — control por movimiento (opcional).
- **Internet** — declarado por la plataforma; no se usa para enviar datos personales.

## 6. Menores
La App no recopila datos personales de ningún usuario, incluidos los menores.

## 7. Derechos (RGPD / CCPA)
No conservamos datos personales que consultar, exportar o eliminar a petición. Los datos locales
están bajo tu control y se borran limpiando los datos de la App.

## 8. Cambios
Podemos actualizar esta política; la versión vigente se publicará con una nueva fecha.

---

### Notas para publicar (borrar antes de subir)
1. Sustituye `CORREO_DE_CONTACTO` por tu email real (en este archivo y en `public/privacy.html`).
2. Ajusta el nombre del publicador si no es "MAI Software".
3. Sube `privacy.html` con el sitio (Netlify/GitHub Pages) y usa esa URL pública en:
   - **Google Play Console** → Contenido de la app → Política de privacidad.
   - **Formulario de Seguridad de los datos** (Play): declara *Cámara* como "se usa en el
     dispositivo, no se recopila/transmite".
   - (Más adelante para iOS) **App Store Connect** → Privacidad de la app + `NSCameraUsageDescription`.
