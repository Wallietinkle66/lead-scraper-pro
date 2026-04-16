import { google } from 'googleapis';
import fs from 'fs';

export default async function handler(req, res) {
  if (req.method!== 'POST') {
    return res.status(405).json({ message: 'Only POST allowed' });
  }

  const { filename, filedata, secret_key } = req.body;
  const SECRET = 'z7k3m9p2q8x5';

  if (secret_key!== SECRET) {
    return res.status(401).json({ message: 'Invalid secret key' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });

    const drive = google.drive({ version: 'v3', auth });
    const folderId = process.env.DRIVE_FOLDER_ID;

    // Convert base64 to buffer
    const buffer = Buffer.from(filedata, 'base64');

    // Upload to Drive
    const file = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId]
      },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: buffer
      }
    });

    return res.status(200).json({ message: 'Uploaded', fileId: file.data.id });
  } catch (error) {
    return res.status(500).json({ message: 'Error: ' + error.message });
  }
}
