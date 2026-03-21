/**
 * @typedef {import('./schema').paths} Paths
 * @typedef {Paths['/api/ai/chat']['post']['requestBody']['content']['application/json']} ChatRequest
 */

/**
 * 发送聊天消息（流式响应）
 * @param {string} message - 用户消息
 * @param {(chunk: string, fullText: string) => void} [onChunk] - 收到文本块的回调
 * @returns {Promise<string>} 完整的响应文本
 */
// 替换你之前 onImageSelect 里的 AI 调用部分
export async function callDoubaoVision(base64Image) {
  const API_KEY = '你的 ARK_API_KEY'
  const API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: 'doubao-vision-pro-32k-2410128',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '从这张表格图片里提取所有编号，只返回JSON数组，不要其他内容' },
            { type: 'image_url', image_url: { url: base64Image } }
          ]
        }
      ]
    })
  })

  const data = await res.json()
  const result = data.choices[0].message.content
  return JSON.parse(result) // 直接得到 [1001,1002,...]
}
