/* Arch2D — WS6: Multi-provider AI image generation clients (project.md §4.3).
   Supports Pollinations (Flux - default), Google Nano Banana (Gemini API),
   OpenAI GPT-Image, and Custom OpenAI-compatible endpoints. */
(function () {
  'use strict';
  const A = window.Arch2D;
  const P = A.persistence;

  class ProviderError extends Error {
    constructor(code, message, hint = '') {
      super(message);
      this.name = 'ProviderError';
      this.code = code;
      this.hint = hint;
    }
  }

  const providers = [
    {
      id: 'pollinations',
      label: 'Pollinations AI (Flux)',
      needsKey: false,
      keyOptional: true,
      defaultModel: 'flux',
      models: ['flux', 'turbo', 'flux-realism'],
      keyUrl: 'https://enter.pollinations.ai',
      notes: 'Default provider. Zero-key instant free preview. (Community service; no SLA).',
    },
    {
      id: 'google',
      label: 'Google Nano Banana (Gemini)',
      needsKey: true,
      keyOptional: false,
      defaultModel: 'gemini-2.5-flash-image',
      models: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image'],
      keyUrl: 'https://aistudio.google.com/apikey',
      notes: 'Browser-safe Gemini REST API. High text adherence and architectural accuracy.',
    },
    {
      id: 'openai',
      label: 'OpenAI GPT-Image',
      needsKey: true,
      keyOptional: false,
      defaultModel: 'gpt-image-2.5-flare',
      models: ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'],
      keyUrl: 'https://platform.openai.com/api-keys',
      notes: 'State-of-the-art photorealism. Paid API. Browser CORS may require a proxy.',
    },
    {
      id: 'custom',
      label: 'Custom (OpenAI-Compatible)',
      needsKey: false,
      keyOptional: true,
      defaultModel: 'flux-schnell',
      models: [],
      keyUrl: '',
      notes: 'Self-hosted or cloud proxy (e.g., LocalAI, Ollama, Together AI, Fal).',
    },
  ];

  let activeProviderId = P.getJSON('active_provider', 'pollinations');

  function getConfig(id) {
    const defaults = {
      apiKey: P.getSecret(id),
      model: (providers.find((p) => p.id === id) || {}).defaultModel || '',
      baseUrl: id === 'custom' ? 'http://localhost:8080/v1' : '',
      size: '1792x1024',
    };
    return Object.assign(defaults, P.getJSON(`provider_cfg_${id}`, {}));
  }

  function setConfig(id, partial) {
    if (partial.apiKey !== undefined) {
      P.setSecret(id, partial.apiKey);
      delete partial.apiKey;
    }
    const cur = P.getJSON(`provider_cfg_${id}`, {});
    P.setJSON(`provider_cfg_${id}`, Object.assign(cur, partial));
  }

  /* ---------- Provider-specific fetchers ---------- */

  // 1. Pollinations AI
  async function generatePollinations(opts, cfg, signal) {
    const cleanPrompt = A.prompt.stripParams(opts.prompt);
    const encPrompt = encodeURIComponent(cleanPrompt);
    const model = cfg.model || 'flux';
    const width = opts.ratio >= 1 ? 1344 : 768;
    const height = opts.ratio >= 1 ? Math.round(1344 / opts.ratio) : 1344;

    const keyParam = cfg.apiKey ? `&key=${encodeURIComponent(cfg.apiKey)}` : '';
    const seed = Math.floor(Math.random() * 1000000);
    // gen.pollinations.ai primary URL
    const url = `https://gen.pollinations.ai/image/${encPrompt}?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true${keyParam}`;

    try {
      // Test fetch to confirm no 401/402 payment wall
      const res = await fetch(url, { signal, method: 'GET' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 402) {
          throw new ProviderError('auth', 'Pollinations rate limit or authorization required.', 'Get a free community key at enter.pollinations.ai and paste it in settings.');
        }
        throw new ProviderError('server', `Pollinations returned HTTP ${res.status}: ${res.statusText}`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      return {
        src: objectUrl,
        kind: 'objecturl',
        canvasSafe: true, // blob from successful fetch is fully canvas safe
        provider: 'pollinations',
        model,
        prompt: opts.prompt,
        createdAt: Date.now(),
      };
    } catch (err) {
      if (err.name === 'AbortError') throw new ProviderError('aborted', 'Request was cancelled.');
      if (err instanceof ProviderError) throw err;
      // If direct fetch had CORS issues, fallback to direct img URL with caveat
      return {
        src: url,
        kind: 'url',
        canvasSafe: false,
        provider: 'pollinations',
        model,
        prompt: opts.prompt,
        createdAt: Date.now(),
      };
    }
  }

  // 2. Google Nano Banana (Gemini)
  async function generateGoogle(opts, cfg, signal) {
    const key = cfg.apiKey || P.getSecret('google');
    if (!key) {
      throw new ProviderError('auth', 'Google AI Studio API key required.', 'Get a free API key at aistudio.google.com and enter it in settings.');
    }

    const model = cfg.model || 'gemini-2.5-flash-image';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    // Map nearest ratio to Gemini's accepted aspect ratios (16:9, 4:3, 1:1, 3:4, 9:16)
    const validRatios = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', '3:2'];
    const ar = validRatios.includes(opts.nearestRatio) ? opts.nearestRatio : '16:9';

    const parts = [];
    if (opts.image) {
      let mimeType = 'image/jpeg';
      let data = opts.image;
      if (opts.image.startsWith('data:')) {
        const commaIdx = opts.image.indexOf(',');
        if (commaIdx !== -1) {
          const prefix = opts.image.substring(0, commaIdx);
          const mimeMatch = prefix.match(/^data:([^;]+)/);
          if (mimeMatch) mimeType = mimeMatch[1];
          data = opts.image.substring(commaIdx + 1);
        }
      }
      data = data.replace(/\s+/g, '');
      parts.push({
        inlineData: {
          mimeType,
          data,
        },
      });
    }

    parts.push({ text: opts.prompt });

    const payload = {
      contents: [
        {
          parts,
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          aspectRatio: ar,
        },
      },
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new ProviderError('aborted', 'Request was cancelled.');
      throw new ProviderError('network', `Network request failed: ${err.message}`);
    }

    if (!res.ok) {
      let errText = '';
      try {
        const errJson = await res.json();
        errText = errJson.error ? errJson.error.message : JSON.stringify(errJson);
      } catch (e) {
        errText = await res.text();
      }
      if (res.status === 400 && errText.includes('API_KEY')) {
        throw new ProviderError('auth', 'Invalid Google API Key.', 'Please verify your API key in Google AI Studio.');
      }
      throw new ProviderError('server', `Google API Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const candidate = data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      throw new ProviderError('bad_response', 'Google API returned no candidates or content parts.');
    }

    const imgPart = candidate.content.parts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      const textPart = candidate.content.parts.find((p) => p.text);
      const textMsg = textPart ? textPart.text : 'No image produced.';
      throw new ProviderError('blocked', `Model returned text instead of image: "${textMsg}"`, 'The prompt may have triggered a safety filter or model refusal.');
    }

    const mime = imgPart.inlineData.mimeType || 'image/png';
    const dataUrl = `data:${mime};base64,${imgPart.inlineData.data}`;

    return {
      src: dataUrl,
      kind: 'dataurl',
      canvasSafe: true,
      provider: 'google',
      model,
      prompt: opts.prompt,
      createdAt: Date.now(),
    };
  }

  // 3. OpenAI GPT-Image
  async function generateOpenAI(opts, cfg, signal) {
    const key = cfg.apiKey || P.getSecret('openai');
    if (!key) {
      throw new ProviderError('auth', 'OpenAI API key required.', 'Enter your OpenAI API key in settings.');
    }

    const model = cfg.model || 'gpt-image-2.5-flare';
    const url = 'https://api.openai.com/v1/images/generations';
    const size = opts.ratio >= 1.3 ? '1792x1024' : opts.ratio <= 0.8 ? '1024x1792' : '1024x1024';

    const payload = {
      model,
      prompt: opts.prompt,
      n: 1,
      size,
      response_format: 'b64_json',
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new ProviderError('aborted', 'Request was cancelled.');
      // Direct browser requests to OpenAI often fail due to CORS
      throw new ProviderError(
        'cors',
        'OpenAI API request blocked by browser CORS policy.',
        'OpenAI restricts direct in-browser calls for key security. To use OpenAI in a browser, use the "Custom (OpenAI-Compatible)" provider configured with a local or self-hosted proxy.'
      );
    }

    if (!res.ok) {
      let errText = '';
      try {
        const j = await res.json();
        errText = j.error ? j.error.message : JSON.stringify(j);
      } catch (e) {
        errText = await res.text();
      }
      throw new ProviderError('server', `OpenAI Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const item = data.data && data.data[0];
    if (!item) throw new ProviderError('bad_response', 'OpenAI returned empty data list.');

    if (item.b64_json) {
      return {
        src: `data:image/png;base64,${item.b64_json}`,
        kind: 'dataurl',
        canvasSafe: true,
        provider: 'openai',
        model,
        prompt: opts.prompt,
        createdAt: Date.now(),
      };
    } else if (item.url) {
      return {
        src: item.url,
        kind: 'url',
        canvasSafe: false,
        provider: 'openai',
        model,
        prompt: opts.prompt,
        createdAt: Date.now(),
      };
    }
    throw new ProviderError('bad_response', 'No image URL or b64_json in OpenAI response.');
  }

  // 4. Custom OpenAI-Compatible
  async function generateCustom(opts, cfg, signal) {
    let baseUrl = (cfg.baseUrl || 'http://localhost:8080/v1').replace(/\/+$/, '');
    const url = baseUrl.endsWith('/images/generations') ? baseUrl : `${baseUrl}/images/generations`;

    const headers = { 'Content-Type': 'application/json' };
    const key = cfg.apiKey || P.getSecret('custom');
    if (key) headers['Authorization'] = `Bearer ${key}`;

    const payload = {
      model: cfg.model || 'flux-schnell',
      prompt: opts.prompt,
      n: 1,
      size: cfg.size || '1024x1024',
      response_format: 'b64_json',
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new ProviderError('aborted', 'Request was cancelled.');
      throw new ProviderError('network', `Failed to reach custom endpoint at ${url}: ${err.message}`);
    }

    if (!res.ok) {
      const txt = await res.text();
      throw new ProviderError('server', `Custom endpoint error (${res.status}): ${txt}`);
    }

    const data = await res.json();
    const item = data.data && data.data[0];
    if (!item) throw new ProviderError('bad_response', 'Endpoint returned empty data array.');

    if (item.b64_json) {
      return {
        src: `data:image/png;base64,${item.b64_json}`,
        kind: 'dataurl',
        canvasSafe: true,
        provider: 'custom',
        model: cfg.model,
        prompt: opts.prompt,
        createdAt: Date.now(),
      };
    }
    return {
      src: item.url,
      kind: 'url',
      canvasSafe: false,
      provider: 'custom',
      model: cfg.model,
      prompt: opts.prompt,
      createdAt: Date.now(),
    };
  }

  /* ---------- Main Generate Facade ---------- */
  async function generate(providerId, opts = {}) {
    const id = providerId || activeProviderId;
    const cfg = getConfig(id);
    const signal = opts.signal;

    switch (id) {
      case 'pollinations':
        return await generatePollinations(opts, cfg, signal);
      case 'google':
        return await generateGoogle(opts, cfg, signal);
      case 'openai':
        return await generateOpenAI(opts, cfg, signal);
      case 'custom':
        return await generateCustom(opts, cfg, signal);
      default:
        throw new ProviderError('config', `Unknown provider: ${id}`);
    }
  }

  A.providers = {
    ProviderError,
    list: () => providers,
    getConfig,
    setConfig,
    getActive: () => activeProviderId,
    setActive: (id) => {
      activeProviderId = id;
      P.setJSON('active_provider', id);
    },
    generate,
  };
})();
