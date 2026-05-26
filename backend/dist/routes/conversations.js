"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ConversationController_1 = require("../controllers/ConversationController");
const router = express_1.default.Router();
router.get('/', ConversationController_1.getConversations);
router.get('/:id', ConversationController_1.getConversationById);
router.post('/', ConversationController_1.createConversation);
router.put('/:id', ConversationController_1.updateConversation);
router.delete('/:id', ConversationController_1.deleteConversation);
exports.default = router;
//# sourceMappingURL=conversations.js.map