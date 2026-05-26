const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export const messagesApi = {
  togglePinMessage: async (messageId: string) => {
    const response = await fetch(`${API_BASE_URL}/messages/${messageId}/toggle-pin`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    if (!response.ok) {
      throw new Error('Failed to toggle pin message')
    }
    return response.json()
  },

  getMessages: async (conversationId: string, limit?: number, offset?: number) => {
    const params = new URLSearchParams()
    if (limit) params.append('limit', String(limit))
    if (offset) params.append('offset', String(offset))
    const response = await fetch(`${API_BASE_URL}/messages/conversation/${conversationId}?${params}`)
    if (!response.ok) {
      throw new Error('Failed to get messages')
    }
    return response.json()
  }
}
