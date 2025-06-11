import net from 'net';

/**
 * Check if a port is available
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} - True if port is available
 */
export function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false);
            } else {
                resolve(false);
            }
        });
        
        server.once('listening', () => {
            server.close(() => {
                resolve(true);
            });
        });
        
        server.listen(port, '127.0.0.1');
    });
}

/**
 * Find an available port starting from a base port
 * @param {number} basePort - Starting port number
 * @param {number} maxAttempts - Maximum number of ports to try
 * @returns {Promise<number>} - Available port number
 */
export async function findAvailablePort(basePort, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
        const port = basePort + i;
        const available = await isPortAvailable(port);
        
        if (available) {
            return port;
        }
        
        console.log(`Port ${port} is already in use, trying next...`);
    }
    
    throw new Error(`Could not find an available port after ${maxAttempts} attempts starting from port ${basePort}`);
}

/**
 * Get frontend and backend ports based on instance number
 * @param {number} baseBackendPort - Base backend port (default: 3004)
 * @param {number} baseFrontendPort - Base frontend port (default: 5173)
 * @returns {Promise<{backend: number, frontend: number}>} - Available ports
 */
export async function getAvailablePorts(baseBackendPort = 3004, baseFrontendPort = 5173) {
    const backend = await findAvailablePort(baseBackendPort);
    const frontend = await findAvailablePort(baseFrontendPort);
    
    return { backend, frontend };
}