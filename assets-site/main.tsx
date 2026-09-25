import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
// The builder's stylesheet first: it runs inside this page. Ours is scoped
// under .am-root and comes after, so nothing of the library leaks into it.
import '../editor/styles.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
