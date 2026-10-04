# Despliegue estático

`npm run build` genera `dist/`: HTML, JS, CSS, iconos, `manifest.webmanifest` y `sw.js`. No hay servidor de aplicación, variables de entorno ni secretos. El build usa `base: './'` (rutas relativas) y **hash routing**, así que funciona en la raíz o en una subcarpeta de cualquier servidor HTTP estático y las recargas de `/#/playlists/123` nunca producen 404.

Requisitos del hosting:

- Servir archivos estáticos con los MIME types correctos (`.js` → `text/javascript`, `.webmanifest` → `application/manifest+json`).
- **HTTPS** (o `localhost`) para que funcionen Service Worker, PWA instalable, WebRTC y Picture-in-picture.
- No cachear `sw.js` ni `index.html` de forma agresiva (ver Nginx más abajo).

## GitHub Pages

1. Ajustes del repositorio → Pages → Source: _GitHub Actions_.
2. Usa el workflow incluido en `.github/workflows/deploy-pages.yml` (compila y publica `dist/`), o sube `dist/` a la rama `gh-pages` con cualquier herramienta.
3. La URL será `https://<usuario>.github.io/<repo>/`. Gracias a `base: './'` no hay que cambiar nada para subcarpetas.

## GitLab Pages

`.gitlab-ci.yml` mínimo:

```yaml
pages:
  image: node:22
  script:
    - npm ci
    - npm run build
    - rm -rf public && mv dist public
  artifacts:
    paths: [public]
  only: [main]
```

## Cloudflare Pages (plan gratuito)

- Build command: `npm run build`
- Build output directory: `dist`
- Sin funciones ni variables de entorno.

## Netlify (hosting estático gratuito, opcional)

- Build command: `npm run build`
- Publish directory: `dist`
- No se necesita `_redirects` porque se usa hash routing. No uses Netlify Functions: la aplicación no debe depender de ellas.

## Vercel (solo como hosting estático, opcional)

- Framework preset: _Vite_; Output: `dist`. No añadas API routes ni server actions.

## Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name ovtorrent.example;
    root /var/www/ovtorrent/dist;
    index index.html;

    # Archivos con hash en el nombre: caché larga.
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # El Service Worker y el HTML deben revalidarse siempre.
    location = /sw.js { add_header Cache-Control "no-cache"; try_files $uri =404; }
    location = /index.html { add_header Cache-Control "no-cache"; }

    location / {
        try_files $uri $uri/ /index.html;
    }

    types { application/manifest+json webmanifest; }
}
```

Si despliegas en una subcarpeta (`/apps/ovtorrent/`), copia `dist/` allí: las rutas relativas lo resuelven sin tocar la configuración.

## Servidor local

```bash
npm run preview            # Vite, puerto 4173
# o cualquier servidor estático:
npx serve dist
python3 -m http.server --directory dist 8080
```

En `http://localhost` el Service Worker funciona sin HTTPS. Abrir `dist/index.html` directamente con `file://` no es compatible (los módulos ES y el Service Worker requieren HTTP).

## Comprobación tras desplegar

1. Abre `/#/diagnostics`: WebRTC, MediaSource y Service Worker deben aparecer según el navegador.
2. Recarga en una ruta profunda (`/#/settings/playback`): debe cargar.
3. Desconecta la red: la interfaz debe seguir funcionando y mostrar el aviso «Sin conexión».
4. Abre las herramientas de desarrollo → Red: todas las peticiones deben ir al propio origen.
