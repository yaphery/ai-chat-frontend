import { createRouter, createWebHistory } from 'vue-router'

const ChatPage = () => import('../pages/chat-index.vue')
const CheckIndex = () => import('../pages/check-index.vue')

const routes = [
  { path: '/', name: 'Chat', component: ChatPage },
  { path: '/check', name: 'CheckIndex', component: CheckIndex }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
