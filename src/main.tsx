import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

window.onerror = function (message, source, lineno, colno, error) {
  document.body.innerHTML = '<div style="color:red; padding:20px; font-family:monospace; background:black; height:100vh;">' +
    '<h2>Runtime Error!</h2>' +
    '<p>Message: ' + message + '</p>' +
    '<p>Source: ' + source + ' : ' + lineno + ':' + colno + '</p>' +
    '<pre>' + (error ? error.stack : '') + '</pre>' +
    '</div>';
};

window.addEventListener('unhandledrejection', function (event) {
  document.body.innerHTML = '<div style="color:red; padding:20px; font-family:monospace; background:black; height:100vh;">' +
    '<h2>Unhandled Promise Rejection!</h2>' +
    '<p>Reason: ' + event.reason + '</p>' +
    '<pre>' + (event.reason ? event.reason.stack : '') + '</pre>' +
    '</div>';
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
