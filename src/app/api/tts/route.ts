import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import qs from 'qs';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { tmpdir } from 'os';
import process from 'process';

const writeFileAsync = promisify(fs.writeFile);

const TIKTOK_API_URL = 'https://api16-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke/';

const voices = [
  { id: 'BV074_streaming', name: 'Cô Gái Hoạt Ngôn' },
  { id: 'BV075_streaming', name: 'Thanh Niên Tự Tin' },
  { id: 'vi_female_huong', name: 'Giọng Nữ Phổ Thông' },
  { id: 'BV421_vivn_streaming', name: 'Nguồn Nhỏ Ngọt Ngào' },
  { id: 'BV560_streaming', name: 'Anh Dũng' },
  { id: 'BV562_streaming', name: 'Chí Mai' },
];


interface SRTSubtitle {
  index: number;
  start: number; // seconds
  end: number; // seconds
  text: string;
}

async function parseSRT(srtText: string): Promise<SRTSubtitle[]> {
  const subtitles: SRTSubtitle[] = [];
  const blocks = srtText.trim().split('\n\n');
  
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;
    
    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;
    
    const timeLine = lines[1];
    const [startStr, endStr] = timeLine.split(' --> ');
    if (!startStr || !endStr) continue;
    
    // Parse time: HH:MM:SS,mmm
    const parseTime = (timeStr: string): number => {
      const [hours, minutes, seconds] = timeStr.replace(',', '.').split(':');
      return parseInt(hours, 10) * 3600 + parseInt(minutes, 10) * 60 + parseFloat(seconds || '0');
    };
    
    const start = parseTime(startStr);
    const end = parseTime(endStr);
    
    const text = lines.slice(2).join(' ').trim();
    
    subtitles.push({ index, start, end, text });
  }
  
  return subtitles.sort((a, b) => a.start - b.start);
}

function splitTextIntoChunks(text: string, chunkSize: number = 200): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim() + '.');
        currentChunk = sentence + '.';
      } else {
        // If sentence is longer than chunk, split it
        for (let i = 0; i < sentence.length; i += chunkSize) {
          chunks.push(sentence.slice(i, i + chunkSize));
        }
        currentChunk = '';
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim() + '.');
  }
  
  return chunks;
}

async function generateAudioChunk(text: string, voiceId: string, index: number, cookie: string): Promise<string> {
  const data = qs.stringify({
    text_speaker: voiceId,
    req_text: text,
    speaker_map_type: '0',
    aid: '1233',
  });

  const headers = {
    'User-Agent': 'com.zhiliaoapp.musically/2022600030 (Linux; U; Android 7.1.2; es_ES; SM-G988N; Build/NRD90M;tt-ok/3.12.13.1)',
    'Accept-Encoding': 'gzip,deflate,compress',
    'Cookie': cookie,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  try {
    const response = await axios.post(TIKTOK_API_URL, data, {
      headers,
      maxBodyLength: Infinity,
    });

    const base64Audio = response.data.data?.v_str;
    if (!base64Audio || base64Audio.length === 0) {
      throw new Error('Empty audio response from TikTok API - check your cookie or try a different voice');
    }
    return base64Audio;
  } catch (error) {
    console.error(`Error generating chunk ${index}:`, error);
    throw new Error(`Failed to generate audio for chunk ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}


async function combineAudioBuffers(audioBuffers: Buffer[], isSRT: boolean): Promise<Buffer> {
  // Simple concatenation of MP3 buffers (works for sequential playback; no padding for SRT in serverless)
  // Note: For SRT, silence gaps are not added; audio plays back-to-back
  if (audioBuffers.length === 0) {
    throw new Error('No audio buffers to combine');
  }
  return Buffer.concat(audioBuffers);
}

const rateLimitMap = new Map<string, number[]>();

interface TTSRequest {
  text: string;
  voice: string;
  type: 'text' | 'srt';
  cookie: string;
  recaptchaToken?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { text, voice, type, cookie, recaptchaToken }: TTSRequest = await request.json();
    
    if (!cookie) {
      return NextResponse.json({ error: 'TikTok cookie is required' }, { status: 400 });
    }

    if (!recaptchaToken) {
      return NextResponse.json({ error: 'reCAPTCHA token is required' }, { status: 400 });
    }

    // Verify reCAPTCHA
    try {
      if (!process.env.RECAPTCHA_SECRET_KEY) {
        return NextResponse.json({ error: 'reCAPTCHA configuration missing' }, { status: 500 });
      }

      const recaptchaBody = new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: recaptchaToken,
      });

      const recaptchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: recaptchaBody,
      });

      if (!recaptchaResponse.ok) {
        throw new Error(`reCAPTCHA verification failed: ${recaptchaResponse.status}`);
      }

      const recaptchaData = await recaptchaResponse.json();
      if (!recaptchaData.success || (recaptchaData.score && recaptchaData.score < 0.5)) {
        return NextResponse.json({ error: 'Xác minh bot thất bại. Vui lòng thử lại.' }, { status: 400 });
      }
    } catch (recaptchaError) {
      console.error('reCAPTCHA verification error:', recaptchaError);
      return NextResponse.json({ error: 'Lỗi xác minh reCAPTCHA. Vui lòng thử lại.' }, { status: 400 });
    }

    // Rate limiting: 5 requests per minute per IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    if (ip !== 'unknown') {
      const now = Date.now();
      let timestamps = rateLimitMap.get(ip) || [];
      timestamps = timestamps.filter(t => now - t < 60000); // 60 seconds window
      if (timestamps.length >= 5) {
        return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 });
      }
      timestamps.push(now);
      rateLimitMap.set(ip, timestamps);
    }

    if (!text || text.length > 5000) {
      return NextResponse.json({ error: 'Text must be between 1 and 5000 characters' }, { status: 400 });
    }
    
    if (!voices.find(v => v.id === voice)) {
      return NextResponse.json({ error: 'Invalid voice selected' }, { status: 400 });
    }

    let chunks: string[];
    let subtitles: SRTSubtitle[] | undefined;

    if (type === 'srt') {
      subtitles = await parseSRT(text);
      chunks = subtitles.map(sub => sub.text);
    } else {
      chunks = splitTextIntoChunks(text);
    }

    const audioBuffers: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i].trim();
      if (!chunkText) continue;

      const audioContent = await generateAudioChunk(chunkText, voice, i, cookie);
      const audioBuffer = Buffer.from(audioContent, 'base64');
      audioBuffers.push(audioBuffer);

      // Rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (audioBuffers.length === 0) {
      return NextResponse.json({ error: 'No valid text to process' }, { status: 400 });
    }

    const finalAudioBuffer = await combineAudioBuffers(audioBuffers, type === 'srt');
    const finalBase64 = finalAudioBuffer.toString('base64');

    // Return base64 audio directly (serverless compatible)
    return NextResponse.json({ 
      audioBase64: finalBase64,
      mimeType: 'audio/mpeg',
      note: type === 'srt' ? 'SRT mode: Audio concatenated without silence gaps (serverless limitation)' : undefined
    });

  } catch (error) {
    console.error('TTS Processing Error:', error);
    return NextResponse.json({ error: 'Failed to generate audio' }, { status: 500 });
  }
}
