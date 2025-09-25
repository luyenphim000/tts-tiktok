import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import qs from 'qs';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { tmpdir } from 'os';
import process from 'process';

const execAsync = promisify(exec);
const writeFileAsync = promisify(fs.writeFile);
const copyFileAsync = promisify(fs.copyFile);

const TIKTOK_API_URL = 'https://api16-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke/';

const voices = [
  { id: 'BV074_streaming', name: 'Cô Gái Hoạt Ngôn' },
  { id: 'BV075_streaming', name: 'Thanh Niên Tự Tin' },
  { id: 'vi_female_huong', name: 'Giọng Nữ Phổ Thông' },
  { id: 'BV421_vivn_streaming', name: 'Nguồn Nhỏ Ngọt Ngào' },
  { id: 'BV560_streaming', name: 'Anh Dũng' },
  { id: 'BV562_streaming', name: 'Chí Mai' },
];

interface TTSRequest {
  text: string;
  voice: string;
  type: 'text' | 'srt';
  cookie: string;
}

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

async function padAudioToDuration(inputPath: string, outputPath: string, duration: number): Promise<void> {
  const durationStr = duration.toFixed(2);
  const command = `ffmpeg -y -i ${inputPath} -af apad=pad_dur=${durationStr} -t ${durationStr} -ar 22050 -ac 2 -ab 96k -f mp3 ${outputPath}`;
  
  await execAsync(command);
}

async function combineAudioFiles(audioPaths: string[], outputPath: string, isSRT: boolean, subtitles?: SRTSubtitle[]): Promise<void> {
  if (isSRT && subtitles && subtitles.length > 0) {
    // For SRT: pad each audio chunk to its subtitle duration, then concatenate
    const paddedAudioPaths: string[] = [];
    const tempDir = path.dirname(outputPath);

    for (let i = 0; i < audioPaths.length; i++) {
      const subtitleDuration = subtitles[i].end - subtitles[i].start;
      const paddedPath = path.join(tempDir, `padded_${i}.mp3`);
      await padAudioToDuration(audioPaths[i], paddedPath, subtitleDuration);
      paddedAudioPaths.push(paddedPath);
    }

    // Concatenate padded audios sequentially
    if (paddedAudioPaths.length === 1) {
      await copyFileAsync(paddedAudioPaths[0], outputPath);
    } else {
      const command = `ffmpeg -y -i "concat:${paddedAudioPaths.join('|')}" -acodec copy ${outputPath}`;
      await execAsync(command);
    }

    // Clean up padded files
    paddedAudioPaths.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
  } else {
    // Simple concatenation for plain text
    if (audioPaths.length === 1) {
      await copyFileAsync(audioPaths[0], outputPath);
    } else {
      const command = `ffmpeg -y -i "concat:${audioPaths.join('|')}" -acodec copy ${outputPath}`;
      await execAsync(command);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text, voice, type, cookie }: TTSRequest & { cookie?: string } = await request.json();
    
    if (!cookie) {
      return NextResponse.json({ error: 'TikTok cookie is required' }, { status: 400 });
    }

    if (!text || text.length > 5000) {
      return NextResponse.json({ error: 'Text must be between 1 and 5000 characters' }, { status: 400 });
    }
    
    if (!voices.find(v => v.id === voice)) {
      return NextResponse.json({ error: 'Invalid voice selected' }, { status: 400 });
    }

    const tempDir = path.join(tmpdir(), 'tts-temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const sessionDir = path.join(tempDir, Date.now().toString());
    fs.mkdirSync(sessionDir, { recursive: true });

    let chunks: string[];
    let subtitles: SRTSubtitle[] | undefined;

    if (type === 'srt') {
      subtitles = await parseSRT(text);
      chunks = subtitles.map(sub => sub.text);
    } else {
      chunks = splitTextIntoChunks(text);
    }

    const audioPaths: string[] = [];
    const baseAudioDir = path.join(sessionDir, 'audio');
    fs.mkdirSync(baseAudioDir, { recursive: true });

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i].trim();
      if (!chunkText) continue;

      const audioContent = await generateAudioChunk(chunkText, voice, i, cookie);
      const chunkPath = path.join(baseAudioDir, `chunk_${i.toString().padStart(3, '0')}.mp3`);
      
      await writeFileAsync(chunkPath, audioContent, 'base64');
      audioPaths.push(chunkPath);

      // Rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (audioPaths.length === 0) {
      return NextResponse.json({ error: 'No valid text to process' }, { status: 400 });
    }

    const outputPath = path.join(sessionDir, 'output.mp3');
    
    await combineAudioFiles(audioPaths, outputPath, type === 'srt', subtitles);

    // Save to public directory
    const publicOutputsDir = path.join(process.cwd(), 'public', 'tts-outputs');
    fs.mkdirSync(publicOutputsDir, { recursive: true });
    const filename = `tts-${Date.now()}.mp3`;
    const publicPath = path.join(publicOutputsDir, filename);
    await copyFileAsync(outputPath, publicPath);

    // Limit to 50 files: delete oldest if exceeding limit
    const files = fs.readdirSync(publicOutputsDir).filter(f => f.endsWith('.mp3'));
    if (files.length > 50) {
      const filePaths = files.map(f => path.join(publicOutputsDir, f));
      filePaths.sort((a, b) => fs.statSync(a).mtime.getTime() - fs.statSync(b).mtime.getTime());
      const toDelete = filePaths.slice(0, files.length - 50);
      toDelete.forEach(file => fs.unlinkSync(file));
    }

    // Clean up temp files
    fs.rmSync(sessionDir, { recursive: true, force: true });

    // Return the public URL
    return NextResponse.json({ url: `/tts-outputs/${filename}` });

  } catch (error) {
    console.error('TTS Processing Error:', error);
    return NextResponse.json({ error: 'Failed to generate audio' }, { status: 500 });
  }
}
