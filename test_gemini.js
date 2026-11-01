#!/usr/bin/env node
/**
 * Direct Gemini Multimodal Image Generation CLI Tester
 *
 * Usage:
 *   node test_gemini.js --key=AIzaSy... [--image=reference.png] [--prompt="..."] [--model=gemini-2.5-flash-image] [--output=output.png]
 */
const fs = require('fs');
const path = require('path');

function getArg(name, def = null) {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(`--${name}=`)) {
      return arg.substring(name.length + 3);
    }
    if (arg === `--${name}`) {
      const idx = process.argv.indexOf(arg);
      if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
        return process.argv[idx + 1];
      }
      return true;
    }
  }
  return def;
}

async function main() {
  const apiKey = getArg('key') || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: Gemini API key required. Pass --key=AIzaSy... or set GEMINI_API_KEY environment variable.');
    process.exit(1);
  }

  const model = getArg('model', 'gemini-2.5-flash-image');
  const imagePath = getArg('image');
  const customPrompt = getArg('prompt');
  const outputPath = getArg('output', 'gemini_render_output.png');

  console.log(`\n🚀 Testing Gemini API Direct Call`);
  console.log(`   Model:  ${model}`);
  console.log(`   Output: ${outputPath}`);

  const parts = [];

  // 1. Process reference image if provided
  if (imagePath && fs.existsSync(imagePath)) {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const base64Data = fs.readFileSync(imagePath).toString('base64');
    console.log(`   Image:  ${imagePath} (${(base64Data.length / 1024).toFixed(1)} KB base64, mime: ${mimeType})`);

    parts.push({
      inlineData: {
        mimeType,
        data: base64Data,
      },
    });
  } else if (imagePath) {
    console.warn(`⚠️ Warning: Image file "${imagePath}" not found.`);
  }

  // 2. Add text prompt
  const prompt = customPrompt || [
    'The attached image is a 2D architectural CAD elevation schematic of a contemporary media wall.',
    'Transform this exact layout into a photorealistic, ultra-high-end interior architectural photograph.',
    'Retain the exact spatial layout, component placements, TV position, and dimensions from the reference image.',
    'Warm architectural ambient lighting, natural oak wood slats, polished marble backboard, 8K, architectural digest style.',
  ].join(' ');

  console.log(`\n📝 Prompt:`);
  console.log(`   "${prompt.substring(0, 160)}..."`);

  parts.push({ text: prompt });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        aspectRatio: '16:9',
      },
    },
  };

  console.log(`\n⏳ Sending multimodal request to Google Gemini API...`);
  const startTime = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!res.ok) {
      let errText = '';
      try {
        const errJson = await res.json();
        errText = errJson.error ? errJson.error.message : JSON.stringify(errJson);
      } catch (e) {
        errText = await res.text();
      }
      console.error(`\n❌ Google API Error HTTP ${res.status} (${elapsed}s):`);
      console.error(errText);
      process.exit(1);
    }

    const data = await res.json();
    const candidate = data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      console.error('\n❌ Error: Google API returned no candidates or content parts:');
      console.dir(data, { depth: 5 });
      process.exit(1);
    }

    const imgPart = candidate.content.parts.find((p) => p.inlineData && p.inlineData.data);
    const textPart = candidate.content.parts.find((p) => p.text);

    if (textPart) {
      console.log(`\n💬 Model Text Response:\n"${textPart.text}"`);
    }

    if (!imgPart) {
      console.error('\n❌ Error: Model returned text but no image.');
      process.exit(1);
    }

    const imgBuffer = Buffer.from(imgPart.inlineData.data, 'base64');
    fs.writeFileSync(outputPath, imgBuffer);

    console.log(`\n✅ Success! Generated image saved to: ${outputPath} (${(imgBuffer.length / 1024).toFixed(1)} KB, in ${elapsed}s)`);
  } catch (err) {
    console.error('\n❌ Request failed:', err.message);
    process.exit(1);
  }
}

main();
