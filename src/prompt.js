/* Arch2D — WS5: Natural language decomposition algorithm & prompt builder (project.md §4.1, §4.2).
   Translates 2D coordinates, materials, and lighting into structured spatial prompts. */
(function () {
  'use strict';
  const A = window.Arch2D;
  const V = A.vocab;

  const standardRatios = [
    { ratio: 16 / 9, str: '16:9' },
    { ratio: 21 / 9, str: '21:9' },
    { ratio: 4 / 3, str: '4:3' },
    { ratio: 3 / 2, str: '3:2' },
    { ratio: 1 / 1, str: '1:1' },
    { ratio: 3 / 4, str: '3:4' },
    { ratio: 9 / 16, str: '9:16' },
  ];

  function nearestStandardRatio(ratioVal) {
    let best = standardRatios[0];
    let minDiff = Math.abs(ratioVal - best.ratio);
    for (const r of standardRatios) {
      const diff = Math.abs(ratioVal - r.ratio);
      if (diff < minDiff) {
        minDiff = diff;
        best = r;
      }
    }
    return best.str;
  }

  function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
  }

  function simplifyRatio(w, h) {
    const rw = Math.round(w);
    const rh = Math.round(h);
    const d = gcd(rw, rh);
    const sw = Math.round(rw / d);
    const sh = Math.round(rh / d);
    if (sw > 30 || sh > 30) {
      // Approximation for non-integer reductions
      return nearestStandardRatio(w / h);
    }
    return `${sw}:${sh}`;
  }

  /* ---------- Spatial positioning classification ---------- */
  function getVerticalZone(el, wallH) {
    if (el.y <= 25) return 'base';
    if (el.y + el.height >= wallH - 30 || el.y >= wallH * 0.65) return 'upper';
    return 'mid';
  }

  function getHorizontalZone(el, wallW) {
    const cx = el.x + el.width / 2;
    if (cx < wallW * 0.35) return 'left';
    if (cx > wallW * 0.65) return 'right';
    return 'center';
  }

  function describeElement(el, state) {
    const m = V.moods[state.mood] || V.moods.japandi;
    const materialPhrase = (m.materials && m.materials[el.texture]) || (V.textures[el.texture] && V.textures[el.texture].phrase) || 'architectural finish';

    let spatialPrefix = '';
    const vZone = getVerticalZone(el, state.wallHeight);
    const hZone = getHorizontalZone(el, state.wallWidth);

    if (vZone === 'base') {
      spatialPrefix = hZone === 'center' ? 'Anchoring the base along the floor level in the central zone,' : `Along the base of the ${hZone} wing at floor level,`;
    } else if (vZone === 'mid') {
      spatialPrefix = hZone === 'center' ? 'Mounted at eye-level in the primary central focal area,' : `Positioned along the ${hZone} section at eye-level,`;
    } else {
      spatialPrefix = hZone === 'center' ? 'Crowning the upper wall in the central zone,' : `Mounted along the upper ${hZone} elevation,`;
    }

    let ledDesc = '';
    if (el.ledHalo && el.ledUnderglow) {
      const tempPhrase = el.ledTemp === 4000 ? '4000K neutral daylight' : '3000K warm ambient';
      ledDesc = ` with integrated concealed ${tempPhrase} LED halo backlighting and downward under-cabinet glow`;
    } else if (el.ledHalo) {
      const tempPhrase = el.ledTemp === 4000 ? '4000K daylight' : '3000K warm white';
      ledDesc = ` featuring a soft recessed ${tempPhrase} LED halo backlight illuminating the wall surface behind`;
    } else if (el.ledUnderglow) {
      const tempPhrase = el.ledTemp === 4000 ? '4000K' : 'warm 3000K';
      ledDesc = ` with concealed ${tempPhrase} under-cabinet downward wash illumination`;
    }

    const w = Math.round(el.width);
    const h = Math.round(el.height);
    const noun = (V.presets[el.type] && V.presets[el.type].noun) || el.label.toLowerCase();

    return `${spatialPrefix} a ${w}cm wide by ${h}cm high ${noun} finished in ${materialPhrase}${ledDesc}.`;
  }

  function describeElements(state) {
    // Sort elements vertically: base units first -> mid focal -> upper storage
    const sorted = [...state.elements].sort((a, b) => {
      const va = getVerticalZone(a, state.wallHeight);
      const vb = getVerticalZone(b, state.wallHeight);
      const rank = { base: 0, mid: 1, upper: 2 };
      return rank[va] - rank[vb] || a.x - b.x;
    });

    return sorted.map((el) => describeElement(el, state));
  }

  /* ---------- Multimodal Vision Prompt (Gemini / GPT-4o / Image-to-Image) ---------- */
  function buildVisionPrompt(state, opts = {}) {
    const m = V.moods[state.mood] || V.moods.japandi;
    const modifiers = opts.modifiers || [];

    const hasSlats = state.elements.some((e) => e.texture === 'slats');
    const hasCredenza = state.elements.some((e) => e.type === 'credenza');
    const hasTv = state.elements.some((e) => e.type === 'tv' || e.texture === 'glass');
    const hasSoundbar = state.elements.some((e) => e.type === 'soundbar' || e.texture === 'mesh');
    const hasFireplace = state.elements.some((e) => e.type === 'fireplace');
    const hasShelves = state.elements.some((e) => e.type === 'bookshelf' || e.texture === 'niche');
    const hasUpper = state.elements.some((e) => e.type === 'upper');
    const hasLeds = state.elements.some((e) => e.ledHalo || e.ledUnderglow);
    const warmLed = state.elements.some((e) => (e.ledHalo || e.ledUnderglow) && e.ledTemp !== 4000);

    const craftBulletPoints = [];

    if (hasSlats) {
      const slatMat = (m.materials && m.materials.slats) || 'three-dimensional fluted white oak timber slats';
      craftBulletPoints.push(`- Feature Wall Backdrop: Three-dimensional ${slatMat} with deep tactile shadow reveals backed by matte black acoustic felt. Authentic wood grain with natural timber color variations and realistic depth.`);
    }

    if (hasCredenza) {
      const woodMat = (m.materials && m.materials.woodgrain) || 'warm natural oak veneer';
      craftBulletPoints.push(`- Floating Low Credenza: Continuous-grain ${woodMat} wrapping seamlessly across the top surface and drawer faces with 45-degree mitered waterfall edges and recessed shadowline finger pulls. Solidly cantilevered above the floor.`);
    }

    if (hasTv) {
      craftBulletPoints.push(`- Television: Flush-mounted ultra-slim OLED display with razor-thin bezels, showing deep pitch-black screen depth and subtle, realistic ambient window reflections on the dark glass panel.`);
    }

    if (hasSoundbar) {
      craftBulletPoints.push(`- Audio: Slim architectural soundbar wrapped in tactile acoustic mesh fabric, mounted flush directly below the television.`);
    }

    if (hasShelves) {
      const nicheMat = (m.materials && m.materials.niche) || 'limewashed open display niche';
      craftBulletPoints.push(`- Display Shelving / Niches: Deep architectural ${nicheMat}, minimally styled with curated ceramic vessels, art monographs, and sculptural objects with natural ambient occlusion.`);
    }

    if (hasFireplace) {
      const fireMat = (m.materials && m.materials.fireplace) || 'frameless linear electric fireplace';
      craftBulletPoints.push(`- Fireplace: Flush integrated ${fireMat} with warm glowing ember bed and realistic soft flame ribbons.`);
    }

    if (hasUpper) {
      const upperMat = (m.materials && m.materials.matte) || 'ultra-matte lacquer';
      craftBulletPoints.push(`- Upper Cabinetry: Minimalist handleless push-to-open upper cupboards finished in ${upperMat} with precise hairline reveals.`);
    }

    const customEls = state.elements.filter((e) => !['tv', 'soundbar', 'fireplace', 'credenza', 'slats', 'bookshelf', 'upper'].includes(e.type));
    if (customEls.length) {
      craftBulletPoints.push(`- Architectural Millwork: Custom built-in cabinetry modules finished with seamless architectural joinery.`);
    }

    let lightingBullet = '';
    if (hasLeds) {
      const tempDesc = warmLed ? 'warm 2700K-3000K' : 'neutral 4000K daylight';
      lightingBullet = `- Architectural Lighting: Concealed ${tempDesc} LED channels casting smooth indirect wash down the wall surfaces and under the floating cabinetry onto the floor. Soft diffuse light dispersion with zero harsh hotspots or visible diode glare.`;
    } else {
      lightingBullet = `- Architectural Lighting: Sophisticated layered ambient illumination with soft indirect cove lighting and realistic shadow falloff.`;
    }

    const extraMods = modifiers.length ? `\n• Stylistic Enhancements: ${modifiers.join(', ')}.` : '';

    const hasPhoto = !!(state.wallPhoto && state.wallPhoto.visible);
    const settingPara = hasPhoto
      ? `2. Real Room Architectural Setting: The design in the attached reference image is mapped directly onto an actual photograph of the client's living room. Preserve the real architectural room context, surrounding walls, existing floor finish, ambient room lighting, ceiling geometry, and environment visible in the reference photo, seamlessly installing the bespoke media wall cabinetry onto this physical wall.`
      : `2. Architectural Setting & Atmosphere: Set inside a luxury contemporary residence (${m.phrase} aesthetic). The main wall is finished in ${m.wallMaterial}. In the foreground, the floor is ${m.flooring || 'wide-plank European white oak hardwood with a subtle matte satin finish'}. The ceiling features a flush architectural shadowline reveal. ${m.atmosphere || 'Soft, diffused natural daylight enters through off-camera floor-to-ceiling sheer linen curtains, casting gentle directional window shadows across the wall.'}`;

    return [
      `The attached image is a 2D architectural CAD elevation schematic of a bespoke media wall. Render a hyper-realistic, photograph of this exact layout in a luxury residential interior:`,
      ``,
      `1. Layout & Reference Fidelity: Strictly follow the layout, proportions, and placement of all cabinetry, wall panels, TV, and shelving shown in the attached schematic. Crucial: Do NOT render any blue dimension lines, measurement numbers, arrows, bounding boxes, or CAD text labels from the reference image. Interpret all markings solely as physical architectural cabinetry and wall geometry.`,
      ``,
      settingPara,
      ``,
      `3. Materials & Craftsmanship:`,
      ...craftBulletPoints,
      lightingBullet,
      ``,
      `4. Photography & Camera Optics: Professional interior architectural photograph captured on a Hasselblad H6D-100c with a 35mm tilt-shift architectural lens at f/8. Perfectly plumb, straight vertical lines with zero barrel distortion or keystoning. Rich dynamic range, true-to-life surface textures, soft natural ambient occlusion, and an editorial finish worthy of Architectural Digest.` + extraMods,
      ``,
      `Omit: 2D drawing, blueprint lines, CAD dimensions, measurement text, watermarks, distorted angles, cartoonish rendering, plastic surfaces, oversaturated colors, clutter.`
    ].join('\n');
  }

  function build(state, opts = {}) {
    const format = opts.format || 'vision'; // 'vision' | 'prose' | 'midjourney' | 'sd'
    const modifiers = opts.modifiers || [];
    const m = V.moods[state.mood] || V.moods.japandi;

    const wallW = Math.round(state.wallWidth);
    const wallH = Math.round(state.wallHeight);
    const ratioVal = state.wallWidth / state.wallHeight;
    const aspectStr = simplifyRatio(state.wallWidth, state.wallHeight);
    const nearestStandard = nearestStandardRatio(ratioVal);

    if (format === 'vision') {
      const fullPrompt = buildVisionPrompt(state, opts);
      return {
        prompt: fullPrompt.trim(),
        negative: '2D blueprint, CAD dimensions, measurement arrows, cyan lines, text labels, drawing, CGI cartoon, warped perspective, blurry, low resolution, plastic textures',
        aspectRatio: aspectStr,
        nearestRatio: nearestStandard,
        ratio: ratioVal,
        mode: 'vision',
      };
    }

    // 1. Scene envelope context
    const sceneContext = `Architectural interior design elevation, custom built-in media wall measuring ${wallW}cm wide by ${wallH}cm high, featuring a ${m.wallMaterial}, ${m.phrase} aesthetic, ${m.lighting}. Foreground features ${m.flooring || 'wide-plank hardwood flooring'}.`;

    // 2. Element descriptions
    const elementSentences = describeElements(state);

    // 3. Modifiers (Lighting, Camera, Detailing, Render Engine)
    const extraModifiers = modifiers.length ? modifiers.join(', ') + '.' : '';

    let fullPrompt = '';
    let negativePrompt = '';

    if (format === 'midjourney') {
      const elementList = elementSentences.join(' ');
      const mods = modifiers.length ? modifiers.join(', ') : '35mm tilt-shift architectural photograph, f/8, octane render, 8k resolution, architectural digest photography';
      fullPrompt = `${sceneContext} ${elementList} ${mods} --ar ${aspectStr} --v ${V.config.midjourneyVersion} --style raw`;
      negativePrompt = 'blueprint, dimensions, wireframe, text, lowres, warped';
    } else if (format === 'sd') {
      // Stable Diffusion tag-based weighting
      const tags = [
        `architectural photography of custom media wall`,
        `${m.phrase} style`,
        `${m.wallMaterial}`,
        `${m.flooring || 'hardwood flooring'}`,
        ...state.elements.map((e) => `${e.label.toLowerCase()}`),
        ...(m.materials ? Object.values(m.materials) : []),
        ...modifiers,
        `photorealistic, highly detailed, 35mm architectural lens, architectural digest`,
      ];
      fullPrompt = tags.join(', ');
      negativePrompt = 'blurry, distorted, crooked, low resolution, bad proportions, watermark, text, signature, people, blueprint, CAD lines';
    } else {
      // Natural prose format for standalone text-to-image
      const elementList = elementSentences.join(' ');
      const polish = extraModifiers ? ` ${extraModifiers}` : ' Professional interior architectural photography, 35mm tilt-shift lens, perfectly plumb vertical lines, authentic photographic lighting, Architectural Digest.';
      fullPrompt = `${sceneContext} ${elementList}${polish}`;
      negativePrompt = 'blueprint, drawing, 2D diagram, cartoon, low resolution';
    }

    return {
      prompt: fullPrompt.trim(),
      negative: negativePrompt,
      aspectRatio: aspectStr,
      nearestRatio: nearestStandard,
      ratio: ratioVal,
      mode: format,
    };
  }

  function stripParams(prompt) {
    return prompt.replace(/\s*--ar\s+[0-9:]+/gi, '').replace(/\s*--v\s+[0-9.]+/gi, '').replace(/\s*--style\s+\w+/gi, '').trim();
  }

  A.prompt = {
    build,
    describeElements,
    chips: () => V.chips,
    standardRatios,
    nearestStandardRatio,
    stripParams,
  };
})();
