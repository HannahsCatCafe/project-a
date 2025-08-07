const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.post('/api/chat', async (req, res) => {
  const prompt = req.body.prompt;
  const apiKey = process.env.OPENAI_API_KEY;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4', // or 'gpt-3.5-turbo'
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({ reply: response.data.choices[0].message.content });
  } catch (error) {
    console.error('OpenAI API Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch response from OpenAI' });
  }
});

// Streaming endpoint for realtime token updates
app.post('/api/chat-stream', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
  }

  const messages = Array.isArray(req.body.messages) ? req.body.messages : [];

  // Prepare SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const controller = new AbortController();

  try {
    const openaiResponse = await axios({
      method: 'post',
      url: 'https://api.openai.com/v1/chat/completions',
      data: {
        model: 'gpt-4.1',
        stream: true,
        messages,
      },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      responseType: 'stream',
      signal: controller.signal,
    });

    // If client disconnects, abort upstream
    req.on('close', () => {
      controller.abort();
      try { res.end(); } catch (_) {}
    });

    openaiResponse.data.on('data', (chunk) => {
      res.write(chunk);
    });
    openaiResponse.data.on('end', () => {
      res.end();
    });
    openaiResponse.data.on('error', (err) => {
      console.error('OpenAI stream error:', err?.message || err);
      try {
        res.write(`data: ${JSON.stringify({ error: 'stream_error' })}\n\n`);
      } catch (_) {}
      res.end();
    });
  } catch (error) {
    console.error('OpenAI API Stream Error:', error?.response?.data || error?.message || error);
    try {
      res.write(`data: ${JSON.stringify({ error: 'upstream_failed' })}\n\n`);
    } catch (_) {}
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
