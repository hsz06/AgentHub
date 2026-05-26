"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAgentById = exports.getAgents = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const getAgents = async (req, res) => {
    const agents = await prisma_1.default.agent.findMany({
        orderBy: { createdAt: 'asc' }
    });
    res.json(agents);
};
exports.getAgents = getAgents;
const getAgentById = async (req, res) => {
    const { id } = req.params;
    const agent = await prisma_1.default.agent.findUnique({ where: { id } });
    if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
    }
    res.json(agent);
};
exports.getAgentById = getAgentById;
//# sourceMappingURL=AgentController.js.map