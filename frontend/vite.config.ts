import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'

// Custom plugin to handle ?import&react syntax (alias to ?react)
const svgImportPlugin = () => ({
  name: 'svg-import-alias',
  resolveId(id: string) {
    // Transform ?import&react to ?react for vite-plugin-svgr
    if (id.includes('?import&react')) {
      return id.replace('?import&react', '?react');
    }
    return null;
  },
});

// https://vite.dev/config/
export default defineConfig(({ command: _command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    svgImportPlugin(),
    svgr({
      // Support named ReactComponent export (for ?react syntax)
      svgrOptions: {
        exportType: 'named',
        namedExport: 'ReactComponent',
        ref: true,
        svgo: false,
        titleProp: true,
      },
      include: '**/*.svg?react',
    }),
  ],
  server: {
    // Restrict to localhost/127.0.0.1 in development to prevent DNS rebinding.
    // Override with GREATAEGIS_ALLOWED_HOSTS env var for remote judging VMs.
    allowedHosts: process.env.GREATAEGIS_ALLOWED_HOSTS
      ? process.env.GREATAEGIS_ALLOWED_HOSTS.split(',')
      : ['localhost', '127.0.0.1'],
    hmr: false,
    port: 3060,
    host: '0.0.0.0'
  },
}))
