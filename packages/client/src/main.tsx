import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initApiBase } from './lib/api';
import './index.css';

async function bootstrap() {
  await initApiBase();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
