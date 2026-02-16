import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @midl/executor imports from "viem/actions" but needs @midl/viem's
      // extended exports (e.g. estimateGasMulti). Alias viem → @midl/viem.
      viem: path.resolve(__dirname, 'node_modules/@midl/viem'),
    },
  },
})
