/**
 * @typedef {import('./schema').paths} Paths
 * @typedef {Paths['/api/ai/chat']['post']['requestBody']['content']['application/json']} ChatRequest
 */

const SESSION_ID_KEY = 'ai-chat-session-id'

/**
 * 获取保存的 Session ID
 * @returns {string | null}
 */
export function getSessionId() {
  return localStorage.getItem(SESSION_ID_KEY)
}

/**
 * 保存 Session ID
 * @param {string} sessionId
 */
export function setSessionId(sessionId) {
  localStorage.setItem(SESSION_ID_KEY, sessionId)
}

/**
 * 清除 Session ID（用于开始新会话）
 */
export function clearSessionId() {
  localStorage.removeItem(SESSION_ID_KEY)
}

/**
 * 发送聊天消息（流式响应）
 * @param {string} message - 用户消息
 * @param {(chunk: string, fullText: string) => void} [onChunk] - 收到文本块的回调
 * @returns {Promise<string>} 完整的响应文本
 */
export async function sendChatMessage(message, onChunk) {
  // 构造请求体（使用 OpenAPI 生成的类型）
  /** @type {ChatRequest} */
  const requestBody = {
    message,
    sessionId: getSessionId() || undefined,
  }

  const response = await fetch('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  // 获取并保存 Session ID
  const sessionId = response.headers.get('X-Session-Id')
  if (sessionId) {
    setSessionId(sessionId)
  }

  if (!response.body) {
    throw new Error('当前环境不支持流式读取（Response.body 为空）')
  }

  // 流式读取响应
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    fullText += chunk

    // 调用回调函数
    if (onChunk) {
      onChunk(chunk, fullText)
    }
  }

  return fullText
}

