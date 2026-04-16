import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const SECRET = 'z7k3m9p2q8x5';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST allowed' });
  }

  const { maps_url, secret_key } = req.body;

  if (secret_key !== SECRET) {
    return res.status(401).json({ message: 'Invalid secret key' });
  }

  if (!maps_url || !maps_url.includes('google.com/maps')) {
    return res.status(400).json({ message: 'Invalid Google Maps URL' });
  }

  try {
    // Trigger GitHub Action instead of running directly
    const github_token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO; // format: username/repo
    
    if (!github_token || !repo) {
      return res.status(500).json({ message: 'GitHub secrets not configured' });
    }

    const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${github_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event_type: 'run-scraper',
        client_payload: { maps_url }
      })
    });

    if (response.ok) {
      return res.status(200).json({ message: 'Scraper started. Check dashboard in 2-3 minutes.' });
    } else {
      return res.status(500).json({ message: 'Failed to trigger scraper' });
    }
  } catch (error) {
    return res.status(500).json({ message: 'Error: ' + error.message });
  }
}
