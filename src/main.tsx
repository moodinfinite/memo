import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { reloadForNewBuild } from './lib/lazyPage'

// A tab open across a deploy asks for code files that were renamed: reload into the new build
window.addEventListener('vite:preloadError', event => { if (reloadForNewBuild()) event.preventDefault() })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
