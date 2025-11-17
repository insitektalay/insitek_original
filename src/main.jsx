import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'; // ✅ This is where Tailwind is defined
import App from './App.jsx'; // or wherever your App component is located



createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
