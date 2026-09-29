import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return <main><p className="eyebrow">FluentCoach AI</p><h1>Practica inglés con confianza.</h1><p>La base de desarrollo está lista. Las conversaciones llegarán en un próximo hito.</p><span role="status">Sistema web disponible</span></main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
