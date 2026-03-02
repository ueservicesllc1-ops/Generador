const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 7700;

app.use(cors());
app.use(express.json());
// Para recibir audio binario
app.use(express.raw({ type: 'audio/*', limit: '50mb' }));
app.use(express.static(path.join(__dirname, './')));

// Proxy para Subir Audio (Recibe binario directo)
app.post('/api/upload', async (req, res) => {
    try {
        const apiKey = req.headers.authorization;
        if (!apiKey) return res.status(401).json({ error: 'Falta API Key' });

        const response = await axios.post('https://api.assemblyai.com/v2/upload', req.body, {
            headers: {
                'authorization': apiKey,
                'content-type': 'application/octet-stream'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error uploading:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// Proxy para Iniciar Transcripción
app.post('/api/transcript', async (req, res) => {
    try {
        const apiKey = req.headers.authorization;
        const response = await axios.post('https://api.assemblyai.com/v2/transcript', req.body, {
            headers: {
                'authorization': apiKey,
                'content-type': 'application/json'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error starting transcript:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// Proxy para Polling de Transcripción
app.get('/api/transcript/:id', async (req, res) => {
    try {
        const apiKey = req.headers.authorization;
        const { id } = req.params;
        const response = await axios.get(`https://api.assemblyai.com/v2/transcript/${id}`, {
            headers: { 'authorization': apiKey }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error polling:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Servidor KaraokeAI ejecutándose en puerto ${port}`);
});
