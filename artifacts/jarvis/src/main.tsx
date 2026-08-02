import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Apple devices (iOS/macOS) → system SF Pro (crispest); others use self-hosted SF Pro
if (/iPhone|iPad|iPod|Macintosh|Mac|Apple/i.test(navigator.userAgent)) {
  document.documentElement.classList.add('platform-apple');
}

createRoot(document.getElementById('root')!).render(<App />);
