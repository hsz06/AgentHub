"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocketIO = setupSocketIO;
const socket_io_1 = require("socket.io");
const prisma_1 = __importDefault(require("../utils/prisma"));
const Orchestrator_1 = require("../services/Orchestrator");
const AgentManager_1 = require("../services/agents/AgentManager");
function setupSocketIO(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    const orchestrator = Orchestrator_1.Orchestrator.getInstance();
    const agentManager = AgentManager_1.AgentManager.getInstance();
    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);
        socket.on('join-conversation', async (conversationId) => {
            socket.join(`conversation:${conversationId}`);
            console.log(`Socket ${socket.id} joined conversation: ${conversationId}`);
            socket.emit('joined-conversation', { conversationId });
        });
        socket.on('send-message', async (data) => {
            const userMessage = await prisma_1.default.message.create({
                data: {
                    conversationId: data.conversationId,
                    senderType: data.senderType,
                    senderId: data.senderId,
                    content: data.content,
                    messageType: data.messageType,
                    metadata: data.metadata || '{}'
                }
            });
            await prisma_1.default.conversation.update({
                where: { id: data.conversationId },
                data: { lastActiveAt: new Date() }
            });
            io.to(`conversation:${data.conversationId}`).emit('new-message', userMessage);
            const conversation = await prisma_1.default.conversation.findUnique({
                where: { id: data.conversationId },
                include: { members: { include: { agent: true } } }
            });
            if (!conversation)
                return;
            if (conversation.members.length <= 1) {
                const singleMember = conversation.members[0];
                if (!singleMember)
                    return;
                const runtimeAgent = agentManager.getAgent(singleMember.agent.name);
                if (!runtimeAgent)
                    return;
                const messages = [
                    { role: 'user', content: data.content }
                ];
                try {
                    const replyContent = await runtimeAgent.normalChat(messages);
                    const agentMessage = await prisma_1.default.message.create({
                        data: {
                            conversationId: data.conversationId,
                            senderType: 'agent',
                            senderId: singleMember.agentId,
                            content: replyContent,
                            messageType: 'text'
                        }
                    });
                    io.to(`conversation:${data.conversationId}`).emit('new-message', agentMessage);
                }
                catch (err) {
                    const errorMsg = await prisma_1.default.message.create({
                        data: {
                            conversationId: data.conversationId,
                            senderType: 'system',
                            senderId: 'system',
                            content: `Agent 回复失败: ${String(err)}`,
                            messageType: 'text'
                        }
                    });
                    io.to(`conversation:${data.conversationId}`).emit('new-message', errorMsg);
                }
            }
            else {
                orchestrator.processGroupConversation(data.conversationId, data.content, io)
                    .then(async (aggregatedResult) => {
                    const resultMessage = await prisma_1.default.message.create({
                        data: {
                            conversationId: data.conversationId,
                            senderType: 'system',
                            senderId: 'orchestrator',
                            content: aggregatedResult,
                            messageType: 'text'
                        }
                    });
                    io.to(`conversation:${data.conversationId}`).emit('new-message', resultMessage);
                })
                    .catch(async (err) => {
                    const errorMsg = await prisma_1.default.message.create({
                        data: {
                            conversationId: data.conversationId,
                            senderType: 'system',
                            senderId: 'system',
                            content: `Orchestrator 调度失败: ${String(err)}`,
                            messageType: 'text'
                        }
                    });
                    io.to(`conversation:${data.conversationId}`).emit('new-message', errorMsg);
                });
            }
        });
        socket.on('stream-chunk', (data) => {
            io.to(`conversation:${data.conversationId}`).emit('stream-chunk', data);
        });
        socket.on('leave-conversation', (conversationId) => {
            socket.leave(`conversation:${conversationId}`);
            console.log(`Socket ${socket.id} left conversation: ${conversationId}`);
        });
        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });
    return io;
}
//# sourceMappingURL=index.js.map