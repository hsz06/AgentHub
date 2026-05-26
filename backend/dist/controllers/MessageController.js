"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.togglePinMessage = exports.getMessageById = exports.getMessages = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const getMessages = async (req, res) => {
    const { conversationId } = req.params;
    const { limit = 200, offset = 0 } = req.query;
    const messages = await prisma_1.default.message.findMany({
        where: { conversationId },
        orderBy: [
            { isPinned: 'desc' },
            { createdAt: 'asc' }
        ],
        take: Number(limit),
        skip: Number(offset)
    });
    res.json(messages);
};
exports.getMessages = getMessages;
const getMessageById = async (req, res) => {
    const { id } = req.params;
    const message = await prisma_1.default.message.findUnique({ where: { id } });
    if (!message) {
        return res.status(404).json({ error: 'Message not found' });
    }
    res.json(message);
};
exports.getMessageById = getMessageById;
const togglePinMessage = async (req, res) => {
    const { id } = req.params;
    const message = await prisma_1.default.message.findUnique({ where: { id } });
    if (!message) {
        return res.status(404).json({ error: 'Message not found' });
    }
    const updatedMessage = await prisma_1.default.message.update({
        where: { id },
        data: { isPinned: !message.isPinned }
    });
    res.json(updatedMessage);
};
exports.togglePinMessage = togglePinMessage;
//# sourceMappingURL=MessageController.js.map