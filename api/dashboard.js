import { google } from 'googleapis';
import xlsx from 'xlsx';

const SECRET = 'z7k3m9p2q8x5';

export default async function handler(req, res) {
  if (req.method!== 'POST') {
    return res.status(405).json({ message: 'Only POST allowed' });
  }

  const { secret_key } = req.body;
  const download = req.query.download;

  if (secret_key!== SECRET) {
    return res.status(401).json({ message: 'Invalid secret key' });
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });

    const drive = google.drive({ version: 'v3', auth });
    const folderId = process.env.DRIVE_FOLDER_ID;

    // List all Excel files in folder
    const files = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'`,
      fields: 'files(id, name)'
    });

    let allLeads = [];

    // Read each Excel file
    for (const file of files.data.files) {
      const fileContent = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      );

      const workbook = xlsx.read(fileContent.data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const leads = xlsx.utils.sheet_to_json(sheet);
      allLeads = allLeads.concat(leads);
    }

    if (download === '1') {
      // Return Excel file
      const ws = xlsx.utils.json_to_sheet(allLeads);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Leads');
      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=leads.xlsx');
      return res.send(buffer);
    }

    return res.status(200).json({ leads: allLeads });
  } catch (error) {
    return res.status(500).json({ message: 'Error: ' + error.message });
  }
}
