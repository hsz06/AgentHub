import { Server } from 'socket.io'

let io: Server | undefined

export function setRealtimeServer(server: Server) {
  io = server
}

export function getRealtimeServer() {
  return io
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload)
}

export function emitToConversation(conversationId: string, event: string, payload: unknown) {
  io?.to(`conversation:${conversationId}`).emit(event, payload)
}
