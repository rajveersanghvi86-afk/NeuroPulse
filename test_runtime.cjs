const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync('live_index.html', 'utf8');

const dom = new JSDOM(html, {
  url: 'https://rajveersanghvi86-afk.github.io/NeuroPulse/',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true
});

dom.window.addEventListener('error', event => {
  console.error('Window Error:', event.error);
});

dom.window.addEventListener('unhandledrejection', event => {
  console.error('Unhandled Rejection:', event.reason);
});

dom.window.document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
  setTimeout(() => {
    console.log('After 2 seconds, root innerHTML length:', dom.window.document.getElementById('root').innerHTML.length);
    process.exit(0);
  }, 2000);
});
