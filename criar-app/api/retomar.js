export default function handler(req, res) {
  // Serve retomar.html for any /retomar/* request
  const fs = require('fs');
  const path = require('path');

  const filePath = path.join(process.cwd(), 'retomar.html');
  const content = fs.readFileSync(filePath, 'utf-8');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.status(200).send(content);
}
