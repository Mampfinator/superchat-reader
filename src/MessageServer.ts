export class MessageServer {
    private readonly server: Deno.HttpServer;
    private readonly clients: Set<WebSocket> = new Set();
    /**
     * Promise that indicates whether the server is ready to send messages to frontends.
     * Resolves as soon as any client connects.
     */
    public readonly ready: Promise<void>;

    private readonly readyResolve: () => void;

    constructor(port: number) {
        const { promise: ready, resolve: readyResolve } = Promise.withResolvers<void>();
        this.ready = ready;
        this.readyResolve = readyResolve;

        this.server = Deno.serve({ port }, (req) => {
            if (req.headers.get('upgrade') != 'websocket') {
                return new Response(null, { status: 501 });
            }

            const { socket, response } = Deno.upgradeWebSocket(req);

            socket.addEventListener('open', () => {
                this.clients.add(socket);
                this.readyResolve();
            });

            socket.addEventListener('close', () => {
                this.clients.delete(socket);
            });

            return response;
        });
    }

    public broadcast<T extends object>(message: T) {
        const payload = JSON.stringify(message);
        for (const client of this.clients) {
            client.send(payload);
        }
    }

    public async stop() {
        await this.server.shutdown();
    }
}
