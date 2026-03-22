const { defineConfig } = require('@vue/cli-service')

module.exports = defineConfig({
  publicPath: '/',
  transpileDependencies: true,
  lintOnSave: false,
  configureWebpack: {
    resolve: {
      extensions: ['.ts', '.js', '.vue', '.json']
    }
  }
})
