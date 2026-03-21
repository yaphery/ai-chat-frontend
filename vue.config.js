const { defineConfig } = require('@vue/cli-service')

module.exports = defineConfig({
  publicPath: '/ai-chat-frontend/',
  transpileDependencies: true,
  lintOnSave: false,
  configureWebpack: {
    resolve: {
      extensions: ['.ts', '.js', '.vue', '.json']
    }
  }
})
