import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.tsx';
import './index.css';

const PUBLISHABLE_KEY = "pk_test_cXVhbGl0eS1zdHVkLTU4LmNsZXJrLmFjY291bnRzLmRldiQ";

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key")
}

const inIframe = window !== window.parent;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {inIframe ? (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 text-center font-sans">
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <h1 className="text-2xl font-bold mb-4 text-zinc-200">Authentication Unavailable in Preview</h1>
          <p className="text-zinc-400 mb-6">
            Clerk authentication requires third-party cookies which are blocked in this iframe preview. 
            To use authentication, please open this app in a new tab.
          </p>
          <button 
            onClick={() => window.open(window.location.href, '_blank')}
            className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_0_15px_rgba(88,101,242,0.3)]"
          >
            Open in New Tab
          </button>
        </div>
      </div>
    ) : (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <App />
      </ClerkProvider>
    )}
  </StrictMode>,
);
