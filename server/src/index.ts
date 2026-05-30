import { createApp } from './app'

const port = parseInt(process.env.PORT ?? '3000', 10)
if (isNaN(port)) throw new Error(`Invalid PORT: "${process.env.PORT}"`)

const app = createApp()
app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
