import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import CompanyGate from './CompanyGate';
import { companyManaged } from './company-config';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{companyManaged ? <CompanyGate><App /></CompanyGate> : <App />}</React.StrictMode>);
