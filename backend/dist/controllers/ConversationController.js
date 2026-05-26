"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteConversation = exports.updateConversation = exports.createConversation = exports.getConversationById = exports.getConversations = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const getConversations = async (req, res) => {
    const { userId } = req.query;
    const conversations = await prisma_1.default.conversation.findMany({
        where: { userId: userId },
        include: {
            members: {
                include: { agent: true }
            }
        },
        orderBy: { lastActiveAt: 'desc' }
    });
    res.json(conversations);
};
exports.getConversations = getConversations;
const getConversationById = async (req, res) => {
    const { id } = req.params;
    const conversation = await prisma_1.default.conversation.findUnique({
        where: { id },
        include: {
            members: {
                include: { agent: true }
            }
        }
    });
    if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conversation);
};
exports.getConversationById = getConversationById;
const createConversation = async (req, res) => {
    const { title, type, userId, agentIds } = req.body;
    const conversation = await prisma_1.default.conversation.create({
        data: {
            title,
            type,
            userId,
            members: {
                create: agentIds?.map((agentId) => ({ agentId })) || []
            }
        },
        include: {
            members: {
                include: { agent: true }
            }
        }
    });
    res.status(201).json(conversation);
};
exports.createConversation = createConversation;
const updateConversation = async (req, res) => {
    const { id } = req.params;
    const { title, pinned, archived } = req.body;
    const conversation = await prisma_1.default.conversation.update({
        where: { id },
        data: { title, pinned, archived }
    });
    res.json(conversation);
};
exports.updateConversation = updateConversation;
const deleteConversation = async (req, res) => {
    const { id } = req.params;
    await prisma_1.default.conversation.delete({ where: { id } });
    res.status(204).send();
};
exports.deleteConversation = deleteConversation;
//# sourceMappingURL=ConversationController.js.map