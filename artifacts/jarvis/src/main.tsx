import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Apple devices (iOS/macOS) → SF Pro instead of self-hosted Graphik
if (/iPhone|iPad|iPod|Macintosh|Mac|Apple/i.test(navigator.userAgent)) {
  document.documentElement.classList.add('platform-apple');
}

createRoot(document.getElementById('root')!).render(<App />);
