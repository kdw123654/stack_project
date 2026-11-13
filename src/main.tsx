import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/app.css';
import { enableDragScroll } from './components/dragScroll';

enableDragScroll();

const root = document.getElementById('root');
if (!root) throw new Error('#root 요소를 찾을 수 없어요.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
