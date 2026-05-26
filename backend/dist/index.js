"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const sockets_1 = require("./sockets");
const conversations_1 = __importDefault(require("./routes/conversations"));
const messages_1 = __importDefault(require("./routes/messages"));
const agents_1 = __importDefault(require("./routes/agents"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
const corsOptions = {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', '*'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running!' });
});
app.use('/api/conversations', conversations_1.default);
app.use('/api/messages', messages_1.default);
app.use('/api/agents', agents_1.default);
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        error: err.message || 'Internal Server Error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});
const httpServer = http_1.default.createServer(app);
(0, sockets_1.setupSocketIO)(httpServer);
httpServer.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map