"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const MessageController_1 = require("../controllers/MessageController");
const router = express_1.default.Router();
router.get('/conversation/:conversationId', MessageController_1.getMessages);
router.get('/:id', MessageController_1.getMessageById);
exports.default = router;
//# sourceMappingURL=messages.js.map