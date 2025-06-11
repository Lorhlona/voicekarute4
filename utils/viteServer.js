import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function startViteServer(frontendPort, backendPort) {
    const server = await createServer({
        root: resolve(__dirname, '..'),
        configFile: false,
        plugins: [react()],
        server: {
            port: frontendPort,
            proxy: {
                '/api': {
                    target: `http://localhost:${backendPort}`,
                    changeOrigin: true,
                }
            }
        }
    });

    await server.listen();
    
    console.log(`Vite: Proxying API requests to backend port ${backendPort}`);
    server.printUrls();
    
    return server;
}