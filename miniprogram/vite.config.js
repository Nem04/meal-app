import { defineConfig } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'
// https://vitejs.dev/config/
const uni = uniModule.default || uniModule

export default defineConfig({
  plugins: [
    uni(),
  ],
})
