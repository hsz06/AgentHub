"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const AgentController_1 = require("../controllers/AgentController");
const router = express_1.default.Router();
router.get('/', AgentController_1.getAgents);
router.get('/:id', AgentController_1.getAgentById);
exports.default = router;
//# sourceMappingURL=agents.js.map