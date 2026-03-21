/* eslint-disable */

<template>
  <div id="app">
    <div class="chat-container">
      <!-- 消息列表 -->
      <div class="message-box" ref="msgBoxRef">
        <div v-for="(msg, idx) in messages" :key="idx" :class="['message-item', msg.role]">
          <div class="message-content">{{ msg.content }}</div>
        </div>
      </div>

      <!-- 输入框 -->
      <div class="input-bar">
        <input 
          v-model="inputText" 
          @keyup.enter="sendMsg" 
          placeholder="输入你的问题..."
        />
        <button @click="sendMsg" :disabled="isLoading">
          {{ isLoading ? '思考中...' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onUpdated, nextTick } from 'vue'
import { sendChatMessage, getSessionId } from '../api/chat'

// 消息列表
const messages = ref([
  { role: 'ai', content: '你好！我是AI助手，有什么可以帮你的？' }
])
// 输入框内容
const inputText = ref('')
// 消息容器Ref（用于滚动）
const msgBoxRef = ref(null)
// 加载状态
const isLoading = ref(false)

// 发送消息
const sendMsg = async () => {
  if (!inputText.value.trim() || isLoading.value) return

  const userMsg = inputText.value.trim()
  messages.value.push({ role: 'user', content: userMsg })
  inputText.value = ''
  isLoading.value = true

  // 初始化AI消息
  messages.value.push({ role: 'ai', content: '' })

  try {
    // 使用类型安全的 API 调用
    await sendChatMessage(userMsg, (chunk, fullText) => {
      // 更新消息内容
      messages.value[messages.value.length - 1].content = fullText
      
      // 滚动到底部
      nextTick(() => {
        if (msgBoxRef.value) {
          msgBoxRef.value.scrollTop = msgBoxRef.value.scrollHeight
        }
      })
    })

    // 打印当前的 Session ID（用于调试）
    console.log('当前 Session ID:', getSessionId())
  } catch (error) {
    messages.value[messages.value.length - 1].content =
      `请求失败：${error?.message || '网络异常'}`
  } finally {
    isLoading.value = false
  }
}

// 每次更新后滚动到底部
onUpdated(async () => {
  await nextTick()
  if (msgBoxRef.value) {
    msgBoxRef.value.scrollTop = msgBoxRef.value.scrollHeight
  }
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.chat-container {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.message-box {
  height: 600px;
  overflow-y: auto;
  padding: 20px;
  background-color: #f9fafb;
}

.message-item {
  margin-bottom: 16px;
  display: flex;
}

.message-item.user {
  justify-content: flex-end;
}

.message-item.ai {
  justify-content: flex-start;
}

.message-content {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 18px;
  line-height: 1.5;
}

.message-item.user .message-content {
  background-color: #3b82f6;
  color: white;
}

.message-item.ai .message-content {
  background-color: white;
  border: 1px solid #e5e7eb;
  color: #333;
}

.input-bar {
  display: flex;
  gap: 8px;
  padding: 16px;
  background-color: white;
  border-top: 1px solid #e5e7eb;
}

.input-bar input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 24px;
  outline: none;
  font-size: 14px;
}

.input-bar input:focus {
  border-color: #3b82f6;
}

.input-bar button {
  padding: 12px 24px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  font-size: 14px;
}

.input-bar button:disabled {
  background-color: #94a3b8;
  cursor: not-allowed;
}
</style>
