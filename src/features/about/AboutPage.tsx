import { useDocumentTitle } from '@/app/hooks/useDocumentTitle';
import { Card, PageHeader } from '@/components/ui';

const LIMITATIONS = [
  'BitTorrent requiere transferir piezas al dispositivo para reproducirlas; «no descargar nada» es imposible.',
  'No se puede reproducir una pieza que no esté disponible en ningún peer.',
  'La velocidad de reproducción depende de la velocidad efectiva de los peers; pocos peers pueden causar pausas.',
  'Un navegador solo puede conectarse a peers compatibles con WebRTC/WebTorrent, no a todos los peers BitTorrent tradicionales (TCP/UDP).',
  'El soporte depende de WebRTC, MediaSource Extensions, codecs y políticas del navegador.',
  'No se garantiza reproducción 4K en todos los TV boxes.',
  'No se puede convertir un archivo único 4K a 1080p o 720p: no hay transcodificación local ni en la nube.',
  'La selección de resolución solo funciona cuando existen varias versiones o variantes.',
  'El almacenamiento local puede ser limpiado por el navegador o el sistema operativo.',
  'Los navegadores aplican límites de memoria y almacenamiento.',
  'La eliminación exacta de cada pieza puede no estar bajo control total de la aplicación; cerrar la pestaña puede impedir una limpieza final perfecta.',
  'La PWA necesita conexión a Internet para descubrir peers y recibir contenido P2P. La interfaz y la configuración funcionan offline; el streaming no.',
];

const LICENSES = [
  ['react, react-dom', 'MIT'],
  ['react-router-dom', 'MIT'],
  ['zustand', 'MIT'],
  ['zod', 'MIT'],
  ['vite, @vitejs/plugin-react', 'MIT'],
  ['tailwindcss', 'MIT'],
  ['vite-plugin-pwa / workbox', 'MIT'],
  ['vitest, @testing-library/*', 'MIT'],
  ['@playwright/test', 'Apache-2.0'],
  ['webtorrent', 'MIT'],
];

export function AboutPage() {
  useDocumentTitle('Acerca de');
  return (
    <div>
      <PageHeader
        title="Acerca de OVtorrent"
        subtitle="Reproductor web P2P con búfer temporal limitado y limpieza automática de datos de sesión. Código abierto, sin servidor, sin base de datos, sin cuentas y sin servicios de pago."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Limitaciones técnicas reales</h2>
          <ul className="list-disc pl-5 text-sm tv:text-xl">
            {LIMITATIONS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Política de privacidad local</h2>
          <dl className="text-sm tv:text-xl">
            <dt className="font-medium">Qué se guarda en el navegador</dt>
            <dd className="mb-2">
              Preferencias, tema, configuración del reproductor, calidad y búfer, playlists,
              historial, favoritos, metadatos introducidos por ti, configuración del modo TV y
              diagnósticos no sensibles. Todo en localStorage; el búfer efímero opcional en memoria
              o IndexedDB.
            </dd>
            <dt className="font-medium">Qué no se guarda</dt>
            <dd className="mb-2">
              Archivos torrent completos, vídeos completos, datos personales, tu IP en ningún
              servidor, historial remoto, magnets en servicios externos, telemetría ni métricas
              enviadas a terceros.
            </dd>
            <dt className="font-medium">Cómo borrar los datos</dt>
            <dd className="mb-2">
              En Ajustes → Almacenamiento puedes borrar todo, solo historial, solo playlists o solo
              la caché temporal. Borrar los datos del sitio desde el navegador tiene el mismo
              efecto.
            </dd>
            <dt className="font-medium">Qué conexiones P2P realiza el navegador</dt>
            <dd className="mb-2">
              Cuando el motor WebTorrent esté activo, el navegador se conectará a trackers WebSocket
              públicos (dependencia del protocolo, no un servicio de esta aplicación) y a peers
              mediante WebRTC. Los peers de una red P2P pueden conocer la IP pública necesaria para
              establecer la conexión. La aplicación no opera un servidor propio para ocultar la IP;
              una VPN externa, si decides usarla, no forma parte de la aplicación.
            </dd>
            <dt className="font-medium">URLs remotas</dt>
            <dd>
              Al reproducir una URL http(s) tu navegador se conecta directamente a ese servidor, que
              verá tu IP.
            </dd>
          </dl>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Uso responsable</h2>
          <p className="text-sm tv:text-xl">
            Todos los usos deben respetar los derechos y licencias aplicables al contenido.
            OVtorrent no incluye buscador, indexador, catálogo remoto, scraping ni resolución
            automática de enlaces de sitios externos.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Licencias</h2>
          <p className="mb-2 text-sm tv:text-xl">
            OVtorrent se publica bajo licencia MIT. Dependencias principales:
          </p>
          <table className="w-full text-sm tv:text-xl">
            <tbody>
              {LICENSES.map(([name, lic]) => (
                <tr key={name}>
                  <td className="py-0.5">{name}</td>
                  <td className="py-0.5 text-right">{lic}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ovt-muted mt-2 text-xs">Detalle completo en LICENSES.md del repositorio.</p>
        </Card>
      </div>
    </div>
  );
}
