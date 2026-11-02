import React from 'react';
import ReactDOM from 'react-dom/client';
import ERDiagram from './ERDiagram.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ERDiagram labelMode="Español + tabla" colorByGroup />
  </React.StrictMode>
);
