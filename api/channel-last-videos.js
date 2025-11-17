/* pages/api/channel-last-videos.js
   -------------------------------------------------------------- */
   import { exec } from "child_process";

   export default async function handler(req, res) {
     if (req.method !== "POST") return res.status(405).end();
   
     const { url, count = 10 } = req.body;
     if (!url) return res.status(400).json({ error: "Missing channel URL" });
   
     /* yt-dlp – list uploads newest → oldest */
     exec(
       `yt-dlp -s --flat-playlist --print "%(upload_date)s|%(id)s" "${url}"`,
       (err, stdout) => {
         if (err) return res.status(500).json({ error: "yt-dlp failed" });
   
         const videos = stdout
           .trim()
           .split("\n")
           .filter(Boolean)
           .map((l) => l.split("|"))
           .sort((a, b) => b[0].localeCompare(a[0])) // newest first
           .slice(0, Number(count))
           .map(([, id]) => `https://youtu.be/${id}`);
   
         res.json({ videos });
       }
     );
   }
   