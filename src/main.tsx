import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode intentionally omitted: it double-mounts WebGL and breaks the game loop.
createRoot(document.getElementById('root')!).render(<App />)
