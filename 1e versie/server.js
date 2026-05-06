// Minimal Node.js backend to accept shapefile zip and return GeoJSON
// Usage:
// npm install
// node server.js

const express = require('express');
const multer = require('multer');
const shp = require('shpjs');

const app = express();
const upload = multer();

app.use(function(req,res,next){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  next();
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try{
    if(!req.file) return res.status(400).json({error:'No file uploaded'});
    const buffer = req.file.buffer;
    // shpjs accepts ArrayBuffer
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const geojson = await shp(arrayBuffer);
    res.json(geojson);
  }catch(err){
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, ()=> console.log('Shapefile backend listening on', port));
