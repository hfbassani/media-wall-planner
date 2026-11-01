/* Arch2D — furniture catalog extension (data only). Adds curated finish palettes,
   multi-part archetypes (primary vs. secondary material zones + structural params),
   and the expanded furniture presets. Merges into A.vocab; no behaviour. */
(function () {
  'use strict';
  const A = window.Arch2D;
  const V = A.vocab;

  /* ---------- Curated finish palettes ---------- */
  const sw = (id, label, hex, phrase) => ({ id, label, hex, phrase });
  const palettes = {
    woods: {
      label: 'Woods',
      swatches: [
        sw('nordic_ash', 'Bleached Nordic Ash', '#dfd3c0', 'bleached pale Nordic white ash timber'),
        sw('white_oak', 'Natural White Oak', '#c2a37d', 'natural matte-oiled European white oak'),
        sw('honey_oak', 'Warm Honey Oak', '#b08555', 'warm honey-toned white oak'),
        sw('teak_amber', 'Golden Burma Teak', '#9c6438', 'warm golden mid-century Burmese teak'),
        sw('natural_walnut', 'American Black Walnut', '#6e4f38', 'rich natural American black walnut'),
        sw('smoked_oak', 'Smoked Brown Oak', '#544030', 'kiln-smoked dark brown European oak'),
        sw('eucalyptus', 'Smoked Eucalyptus', '#42352c', 'deep smoked figured eucalyptus'),
        sw('wenge_espresso', 'Espresso Stained Oak', '#2d241e', 'deep espresso-stained oak'),
        sw('ebony_macassar', 'Macassar Ebony', '#241f1c', 'dark striated Macassar ebony'),
        sw('charred_ash', 'Charred Shou Sugi Ban', '#1a1918', 'charred black Shou Sugi Ban timber'),
      ],
    },
    lacquers: {
      label: 'Lacquers',
      swatches: [
        sw('chalk_white', 'Pure Chalk White', '#f2f0eb', 'crisp chalk-white ultra-matte lacquer'),
        sw('alabaster', 'Warm Alabaster Ivory', '#e8e2d5', 'soft warm alabaster ivory matte lacquer'),
        sw('cashmere', 'Cashmere Sand', '#dcd2c0', 'warm cashmere sand soft-touch lacquer'),
        sw('greige_putty', 'Architectural Greige', '#c7bfb0', 'refined warm greige putty lacquer'),
        sw('taupe_stone', 'Mushroom Taupe', '#9e9486', 'earthy muted mushroom taupe matte finish'),
        sw('pebble_grey', 'Warm Pebble Grey', '#85827c', 'balanced warm pebble grey matte lacquer'),
        sw('sage_olive', 'Muted Sage Olive', '#798272', 'muted organic sage-olive green lacquer'),
        sw('eucalyptus_grn', 'Deep Botanical Green', '#3b4a3f', 'deep forest green matte lacquer'),
        sw('fjord_blue', 'Nordic Fjord Blue', '#455363', 'deep muted Nordic fjord slate-blue lacquer'),
        sw('terracotta', 'Baked Terracotta Clay', '#a6634b', 'warm earthy baked terracotta clay finish'),
        sw('anthracite', 'Anthracite Charcoal', '#323336', 'deep anthracite charcoal ultra-matte lacquer'),
        sw('onyx_black', 'Carbon Onyx Black', '#161719', 'velvet carbon onyx matte-black lacquer'),
      ],
    },
    stones: {
      label: 'Stones',
      swatches: [
        sw('calacatta_gold', 'Calacatta Gold', '#efeae0', 'honed Calacatta Oro marble with warm gold and grey veining'),
        sw('carrara_white', 'Bianco Carrara', '#e3e5e6', 'white Bianco Carrara marble with soft feathery grey veins'),
        sw('taj_mahal', 'Taj Mahal Quartzite', '#ded4c1', 'creamy Taj Mahal quartzite with delicate caramel veins'),
        sw('roman_trav', 'Classic Roman Travertine', '#d6c6a5', 'unfilled vein-cut Roman travertine in warm biscuit tones'),
        sw('limestone_sand', 'Jura Sand Limestone', '#c8bca6', 'honed warm Jura sand limestone'),
        sw('silver_trav', 'Silver Titanium Travertine', '#969188', 'honed silver-grey titanium travertine with horizontal strata'),
        sw('pietra_grey', 'Honed Pietra Grey', '#57534e', 'honed charcoal-taupe Pietra Grey marble with fine white streaks'),
        sw('verde_alpi', 'Verde Alpi Marble', '#26382e', 'deep emerald Verde Alpi marble with white veining'),
        sw('rosso_levanto', 'Rosso Levanto', '#4a2527', 'deep burgundy Rosso Levanto marble with dramatic white veins'),
        sw('nero_marquina', 'Nero Marquina Black', '#1b1b1d', 'honed black Nero Marquina marble with high-contrast white veining'),
      ],
    },
    metals: {
      label: 'Metals & Fabrics',
      swatches: [
        sw('champagne_brs', 'Champagne Brass', '#c8ad7d', 'satin brushed champagne brass'),
        sw('satin_gold', 'Brushed Warm Brass', '#b59153', 'brushed warm architectural brass'),
        sw('rose_copper', 'Brushed Rose Copper', '#a66e53', 'warm brushed rose copper'),
        sw('antique_bronze', 'Burnished Bronze', '#5e4b38', 'dark burnished antique bronze'),
        sw('brushed_nickel', 'Brushed Stainless', '#b2b6ba', 'satin brushed stainless steel'),
        sw('gunmetal', 'Anodized Gunmetal', '#42464b', 'dark anodized gunmetal titanium'),
        sw('black_steel', 'Blackened Raw Steel', '#202225', 'matte blackened cold-rolled steel'),
        sw('oatmeal_linen', 'Oatmeal Belgian Linen', '#cec5b4', 'natural oatmeal Belgian linen weave'),
        sw('boucle_cream', 'Ivory Bouclé Wool', '#e6dfd1', 'tactile ivory bouclé wool upholstery'),
        sw('smoked_bronze', 'Smoked Bronze Glass', '#332d28', 'tinted smoked bronze reflective glass'),
      ],
    },
  };
  const swatchIndex = {};
  for (const fam of Object.values(palettes)) for (const s of fam.swatches) swatchIndex[s.id] = s;

  /* Which palette tab opens by default for each texture. */
  const textureFamily = {
    slats: 'woods', woodgrain: 'woods', fluted: 'woods',
    matte: 'lacquers', concrete: 'lacquers', niche: 'lacquers',
    marble: 'stones', travertine: 'stones',
    metal: 'metals', mirror: 'metals', glass: 'metals', mesh: 'metals', fabric: 'metals', fireplace: 'metals',
  };

  /* Short material nouns used when a named swatch is applied ("<noun> in <swatch phrase>"). */
  const textureNoun = {
    slats: 'fluted timber slats', woodgrain: 'continuous-grain veneer', matte: 'ultra-matte lacquer',
    glass: 'glass', mesh: 'acoustic mesh', niche: 'lacquered finish', fireplace: 'firebox surround',
    marble: 'stone slab', travertine: 'travertine stone', fluted: 'micro-fluted paneling',
    concrete: 'micro-cement', metal: 'brushed metal', fabric: 'upholstery fabric', mirror: 'mirror glass',
  };

  /* ---------- Multi-part archetypes ----------
     zones: inspector labels for the two material zones (secondary null = single zone).
     controls: which structural params the inspector exposes. */
  const archetypes = {
    plain: { zones: { primary: 'Material', secondary: null }, controls: [] },
    niche: {
      zones: { primary: 'Frame & Shelves', secondary: 'Back Panel' },
      controls: ['shelves', 'bays', 'frameWidthCm', 'archTop', 'showProps'],
    },
    vitrine: {
      zones: { primary: 'Cabinet Frame', secondary: 'Interior Back' },
      controls: ['shelves', 'bays', 'frameWidthCm', 'handleStyle', 'archTop', 'showProps'],
    },
    cabinet: {
      zones: { primary: 'Door & Drawer Fronts', secondary: 'Top Slab & Plinth' },
      controls: ['bays', 'drawers', 'topSlabCm', 'plinthHeightCm', 'handleStyle'],
    },
    cladding: { zones: { primary: 'Slats / Ribs', secondary: 'Backing / Reveal' }, controls: ['slatPitch'] },
    framed: { zones: { primary: 'Surface', secondary: 'Frame' }, controls: ['frameWidthCm', 'archTop'] },
    fireplace: { zones: { primary: 'Firebox', secondary: 'Surround' }, controls: ['frameWidthCm'] },
    panelGrid: { zones: { primary: 'Panels', secondary: 'Reveal Trim' }, controls: ['bays', 'shelves'] },
    silhouette: { zones: { primary: 'Body / Upholstery', secondary: 'Legs / Base / Shade' }, controls: [] },
  };

  /* Param schema: inspector control definitions + clamping. */
  const paramSchema = {
    shelves: { label: 'Shelves / Rows', kind: 'int', min: 0, max: 8, def: 0 },
    bays: { label: 'Bays / Columns (0 = auto)', kind: 'int', min: 0, max: 6, def: 0 },
    drawers: { label: 'Drawer Rows', kind: 'int', min: 0, max: 4, def: 0 },
    frameWidthCm: { label: 'Frame Thickness (cm)', kind: 'num', min: 0, max: 12, def: 3 },
    topSlabCm: { label: 'Top Slab (cm)', kind: 'num', min: 0, max: 15, def: 0 },
    plinthHeightCm: { label: 'Plinth / Toe-kick (cm)', kind: 'num', min: 0, max: 20, def: 0 },
    handleStyle: {
      label: 'Handles', kind: 'enum', def: 'groove',
      options: { none: 'Push-Latch', groove: 'Shadow Groove', bar_brass: 'Brass Bar', bar_black: 'Black Bar', knob: 'Knob' },
    },
    slatPitch: { label: 'Slat Pitch', kind: 'enum', def: 'standard', options: { fine: 'Fine', standard: 'Standard', wide: 'Wide' } },
    archTop: { label: 'Arched Top', kind: 'bool', def: false },
    showProps: { label: 'Styled Decor', kind: 'bool', def: true },
  };

  const handlePhrase = {
    none: 'handleless push-latch fronts', groove: 'recessed shadowline finger grooves',
    bar_brass: 'slim brushed brass bar handles', bar_black: 'slim matte black bar handles', knob: 'small turned knob pulls',
  };

  /* ---------- Archetype assignment for existing presets ---------- */
  const patch = {
    tv_frame: { archetype: 'framed', secondaryTexture: 'woodgrain', secondaryColor: '#c2a37d', secondaryColorId: 'white_oak', params: { frameWidthCm: 4 } },
    credenza_180: { archetype: 'cabinet', secondaryTexture: 'woodgrain', secondaryColor: '#9a7552', params: { handleStyle: 'groove' } },
    credenza: { archetype: 'cabinet', secondaryTexture: 'woodgrain', secondaryColor: '#8a6a4a', params: { handleStyle: 'groove' } },
    bench_plinth: { archetype: 'cabinet', secondaryTexture: 'matte', secondaryColor: '#2d2a27', params: { bays: 1, plinthHeightCm: 6, handleStyle: 'none' } },
    tower_vert: { archetype: 'cabinet', secondaryTexture: 'matte', secondaryColor: '#c8c0b2', params: { bays: 1, handleStyle: 'none' } },
    upper: { archetype: 'cabinet', secondaryTexture: 'matte', secondaryColor: '#d9d3c8', params: { handleStyle: 'none' } },
    credenza_tambour: { archetype: 'cabinet', secondaryTexture: 'woodgrain', secondaryColor: '#7e6347', params: { bays: 1, handleStyle: 'none' } },
    bookshelf: { archetype: 'niche', texture: 'matte', secondaryTexture: 'matte', secondaryColor: '#b8ae9f', params: { shelves: 3, frameWidthCm: 3 } },
    niche_bar: { archetype: 'niche', texture: 'matte', secondaryTexture: 'marble', secondaryColor: '#e8e4dc', params: { shelves: 0, frameWidthCm: 3 } },
    shadow_box: { archetype: 'niche', secondaryTexture: 'matte', secondaryColor: '#a59d90', params: { shelves: 0, frameWidthCm: 2.5 } },
    slats: { archetype: 'cladding', secondaryTexture: 'fabric', secondaryColor: '#161616', params: { slatPitch: 'standard' } },
    fireplace: { archetype: 'fireplace', secondaryTexture: 'metal', secondaryColor: '#202225', secondaryColorId: 'black_steel', params: { frameWidthCm: 3 } },
    fireplace_wide: { archetype: 'fireplace', secondaryTexture: 'metal', secondaryColor: '#202225', secondaryColorId: 'black_steel', params: { frameWidthCm: 3 } },
    prop_art: { archetype: 'framed', texture: 'concrete', color: '#e5dfd4', secondaryTexture: 'woodgrain', secondaryColor: '#c2a37d', secondaryColorId: 'white_oak', params: { frameWidthCm: 3 } },
    prop_plant: { archetype: 'silhouette', shape: 'plant', texture: 'matte', color: '#c9bfae', secondaryTexture: 'matte', secondaryColor: '#5f6e52' },
  };
  for (const [k, p] of Object.entries(patch)) {
    if (!V.presets[k]) continue;
    const { params, ...rest } = p;
    Object.assign(V.presets[k], rest);
    if (params) V.presets[k].params = params;
  }

  /* ---------- New furniture presets ---------- */
  const add = {
    // Casegoods & workstations
    vitrine_tall: {
      label: 'Tall Glass Vitrine 90cm', category: 'millwork', width: 90, height: 220, y: 0,
      archetype: 'vitrine', texture: 'woodgrain', color: '#6e4f38', colorId: 'natural_walnut',
      secondaryTexture: 'matte', secondaryColor: '#c7bfb0', ledHalo: false,
      params: { shelves: 5, bays: 2, frameWidthCm: 3, handleStyle: 'bar_brass', showProps: true },
      noun: 'tall glass-front vitrine display cabinet',
      description: 'A tall glass-front curio vitrine cabinet with slender timber mullions, warm integrated interior LED shelf lighting, and curated ceramics and glassware displayed behind clear glass doors.',
    },
    vitrine_low: {
      label: 'Low Glass Vitrine 120cm', category: 'millwork', width: 120, height: 110, y: 0,
      archetype: 'vitrine', texture: 'woodgrain', color: '#c2a37d', colorId: 'white_oak',
      secondaryTexture: 'marble', secondaryColor: '#efeae0', secondaryColorId: 'calacatta_gold',
      params: { shelves: 2, bays: 2, frameWidthCm: 3, handleStyle: 'bar_brass', showProps: true },
      noun: 'mid-height glass vitrine cabinet',
      description: 'A mid-height glass vitrine cabinet with a backlit stone interior back panel, slim glass doors, and softly illuminated display shelves.',
    },
    sideboard_180: {
      label: 'Sideboard / Highboard 180cm', category: 'millwork', width: 180, height: 80, y: 0,
      archetype: 'cabinet', texture: 'matte', color: '#798272', colorId: 'sage_olive',
      secondaryTexture: 'marble', secondaryColor: '#efeae0', secondaryColorId: 'calacatta_gold',
      params: { bays: 3, drawers: 1, topSlabCm: 3, plinthHeightCm: 8, handleStyle: 'bar_brass' },
      noun: 'floor-standing dining sideboard',
      description: 'A floor-standing sideboard at 80cm height with three door bays beneath a top drawer row, crowned by a stone countertop slab and resting on a recessed plinth.',
    },
    drawer_bank: {
      label: '2-Drawer Base Module 120cm', category: 'millwork', width: 120, height: 45, y: 0,
      archetype: 'cabinet', texture: 'matte', color: '#c7bfb0', colorId: 'greige_putty',
      secondaryTexture: 'woodgrain', secondaryColor: '#c2a37d',
      params: { bays: 1, drawers: 2, plinthHeightCm: 5, handleStyle: 'groove' },
      noun: 'modular two-drawer base cabinet',
      description: 'A modular floor-standing two-drawer base cabinet for composing custom multi-unit credenzas, with deep soft-close drawers and crisp shadow reveals.',
    },
    desk_floating: {
      label: 'Floating Desk 130cm', category: 'millwork', width: 130, height: 12, y: 72,
      archetype: 'cabinet', texture: 'woodgrain', color: '#c2a37d', colorId: 'white_oak',
      secondaryTexture: 'woodgrain', secondaryColor: '#c2a37d',
      params: { bays: 2, drawers: 1, handleStyle: 'groove' },
      noun: 'cantilevered floating home-office desk',
      description: 'An integrated cantilevered writing desk mounted at an ergonomic 72cm height, with twin slim drawers and a continuous solid timber top.',
    },
    console_vinyl: {
      label: 'Vinyl & Turntable Console 150cm', category: 'millwork', width: 150, height: 65, y: 0,
      archetype: 'cabinet', texture: 'woodgrain', color: '#6e4f38', colorId: 'natural_walnut',
      secondaryTexture: 'metal', secondaryColor: '#202225', secondaryColorId: 'black_steel',
      params: { bays: 3, drawers: 0, topSlabCm: 2, plinthHeightCm: 10, handleStyle: 'none' },
      noun: 'audiophile vinyl record console',
      description: 'A bespoke audiophile console with vertical vinyl record divider slots, a ventilated amplifier bay, and a solid top sized for a turntable, raised on slim steel legs.',
    },
    cabinet_arched: {
      label: 'Arched Bookcase 90cm', category: 'shelving', width: 90, height: 210, y: 0,
      archetype: 'niche', texture: 'matte', color: '#e8e2d5', colorId: 'alabaster',
      secondaryTexture: 'travertine', secondaryColor: '#d6c6a5', secondaryColorId: 'roman_trav',
      params: { shelves: 4, frameWidthCm: 4, archTop: true, showProps: true },
      noun: 'full-height arched recessed bookcase',
      description: 'A full-height arched-top recessed bookcase with a curved stone back panel, solid shelves, and curated books and ceramics.',
    },
    alcove_logs: {
      label: 'Firewood Log Alcove', category: 'fireplace', width: 45, height: 120, y: 25,
      archetype: 'niche', propKind: 'logs', texture: 'metal', color: '#202225', colorId: 'black_steel',
      secondaryTexture: 'metal', secondaryColor: '#141517',
      params: { shelves: 0, frameWidthCm: 2, showProps: true },
      noun: 'recessed firewood log storage alcove',
      description: 'A vertical blackened-steel lined alcove neatly stacked with split natural oak firewood logs beside the hearth.',
    },

    // Shelving & wall architecture
    grid_cubbies: {
      label: 'Open Cubby Grid 3×3', category: 'shelving', width: 120, height: 120, y: 70,
      archetype: 'niche', texture: 'woodgrain', color: '#c2a37d', colorId: 'white_oak',
      secondaryTexture: 'matte', secondaryColor: '#455363', secondaryColorId: 'fjord_blue',
      params: { shelves: 2, bays: 3, frameWidthCm: 2.5, showProps: true },
      noun: 'modular open cubby grid shelving',
      description: 'A modular open grid shelving system of square cubbies with contrasting painted back panels, sparsely styled with books and objects.',
    },
    niche_arched: {
      label: 'Arched Display Alcove', category: 'shelving', width: 75, height: 150, y: 75,
      archetype: 'niche', texture: 'matte', color: '#e6dfd3',
      secondaryTexture: 'marble', secondaryColor: '#ded4c1', secondaryColorId: 'taj_mahal',
      params: { shelves: 2, frameWidthCm: 0, archTop: true, showProps: true },
      noun: 'arched recessed display alcove',
      description: 'A softly curved arch-top recessed wall alcove with a stone-lined back, floating shelves, and warm overhead spotlighting.',
    },
    pelmet_ceiling: {
      label: 'Ceiling LED Bulkhead', category: 'backdrops', width: 400, height: 20, y: 260,
      archetype: 'plain', texture: 'matte', color: '#f2f0eb', colorId: 'chalk_white', ledUnderglow: true,
      noun: 'dropped ceiling bulkhead pelmet with LED cove',
      description: 'An architectural dropped ceiling bulkhead running along the top of the wall, with a concealed downward LED cove washing light over the feature wall.',
    },
    panel_dado: {
      label: 'Wainscot Dado Panel', category: 'backdrops', width: 400, height: 105, y: 0,
      archetype: 'cabinet', texture: 'fluted', color: '#c2a37d', colorId: 'white_oak',
      secondaryTexture: 'woodgrain', secondaryColor: '#9a7552',
      params: { bays: 1, topSlabCm: 3, handleStyle: 'none' },
      noun: 'half-height wainscot dado paneling',
      description: 'Lower-wall wainscot dado paneling with vertical reeding and a solid timber capping ledge.',
    },
    column_pillar: {
      label: 'Architectural Pillar', category: 'backdrops', width: 30, height: 280, y: 0,
      archetype: 'plain', texture: 'travertine', color: '#d6c6a5', colorId: 'roman_trav',
      noun: 'full-height architectural pilaster column',
      description: 'A full-height architectural pilaster column clad in honed stone, dividing the wall into balanced zones.',
    },
    panel_acoustic: {
      label: 'Acoustic Wall Tiles', category: 'backdrops', width: 120, height: 180, y: 50,
      archetype: 'panelGrid', texture: 'fabric', color: '#cec5b4', colorId: 'oatmeal_linen',
      secondaryTexture: 'metal', secondaryColor: '#5e4b38', secondaryColorId: 'antique_bronze',
      params: { bays: 2, shelves: 3 },
      noun: 'upholstered acoustic wall panel array',
      description: 'An array of sound-absorbing upholstered linen wall tiles with softly beveled seams and slim bronze reveal trims.',
    },

    // Seating silhouettes
    bench_upholst: {
      label: 'Upholstered Bench 140cm', category: 'seating', width: 140, height: 45, y: 0,
      archetype: 'silhouette', shape: 'bench', texture: 'fabric', color: '#e6dfd1', colorId: 'boucle_cream',
      secondaryTexture: 'woodgrain', secondaryColor: '#6e4f38', secondaryColorId: 'natural_walnut',
      noun: 'low upholstered cushion bench',
      description: 'A low architectural bench with a tactile upholstered seat cushion resting on a solid timber base.',
    },
    chair_lounge: {
      label: 'Lounge Chair', category: 'seating', width: 82, height: 74, y: 0,
      archetype: 'silhouette', shape: 'lounge', texture: 'fabric', color: '#e6dfd1', colorId: 'boucle_cream',
      secondaryTexture: 'woodgrain', secondaryColor: '#9c6438', secondaryColorId: 'teak_amber',
      noun: 'low sculptural lounge armchair',
      description: 'A designer low-profile sculptural lounge armchair with rounded upholstered cushions on a warm timber frame.',
    },
    chair_desk: {
      label: 'Desk Chair', category: 'seating', width: 58, height: 80, y: 0,
      archetype: 'silhouette', shape: 'chair', texture: 'fabric', color: '#85827c',
      secondaryTexture: 'metal', secondaryColor: '#202225', secondaryColorId: 'black_steel',
      noun: 'minimalist upholstered desk chair',
      description: 'A minimalist upholstered task chair with a slim metal frame, positioned at the desk.',
    },
    sofa_elevation: {
      label: '3-Seater Sofa 240cm', category: 'seating', width: 240, height: 78, y: 0,
      archetype: 'silhouette', shape: 'sofa', texture: 'fabric', color: '#cec5b4', colorId: 'oatmeal_linen',
      secondaryTexture: 'woodgrain', secondaryColor: '#2d241e',
      noun: 'low-slung three-seater sofa',
      description: 'A low-slung contemporary three-seater sofa with deep linen cushions and a recessed dark plinth base, giving the room human scale.',
    },

    // Lighting, mirrors & decor
    mirror_arch: {
      label: 'Arched Mirror', category: 'props', width: 75, height: 185, y: 0,
      archetype: 'framed', texture: 'mirror', color: '#35302c',
      secondaryTexture: 'metal', secondaryColor: '#b59153', secondaryColorId: 'satin_gold',
      params: { frameWidthCm: 2, archTop: true },
      noun: 'arched full-length mirror',
      description: 'A full-length arched smoked bronze mirror in a slim brushed brass frame.',
    },
    lamp_floor: {
      label: 'Floor Lamp', category: 'props', width: 40, height: 165, y: 0,
      archetype: 'silhouette', shape: 'floorLamp', texture: 'metal', color: '#b59153', colorId: 'satin_gold',
      secondaryTexture: 'fabric', secondaryColor: '#e8e2d5', ledHalo: true,
      noun: 'slender sculptural floor lamp',
      description: 'A slender sculptural brass floor lamp with a warm glowing linen drum shade.',
    },
    lamp_table: {
      label: 'Table Lamp', category: 'props', width: 28, height: 42, y: 63,
      archetype: 'silhouette', shape: 'tableLamp', texture: 'marble', color: '#e3e5e6',
      secondaryTexture: 'fabric', secondaryColor: '#e8e2d5', ledHalo: true,
      noun: 'sculptural stone table lamp',
      description: 'A sculptural table lamp with a carved stone base and a warm glowing fabric shade, sitting on the console top.',
    },
    light_pendant: {
      label: 'Pendant Light', category: 'props', width: 22, height: 95, y: 185,
      archetype: 'silhouette', shape: 'pendant', texture: 'metal', color: '#202225',
      secondaryTexture: 'glass', secondaryColor: '#f0e0c0', ledUnderglow: true,
      noun: 'suspended ceiling pendant light',
      description: 'A suspended cylindrical pendant light hanging from the ceiling on a slim cord, casting a warm downward glow.',
    },
    prop_turntable: {
      label: 'Turntable & Amp', category: 'props', width: 45, height: 16, y: 63,
      archetype: 'silhouette', shape: 'turntable', texture: 'woodgrain', color: '#6e4f38',
      secondaryTexture: 'metal', secondaryColor: '#b2b6ba',
      noun: 'hi-fi vinyl turntable',
      description: 'An audiophile walnut-plinth vinyl turntable with a brushed aluminium tonearm sitting on the console.',
    },
    prop_decor_set: {
      label: 'Console Decor Set', category: 'props', width: 55, height: 28, y: 63,
      archetype: 'silhouette', shape: 'decor', texture: 'matte', color: '#e8e2d5',
      secondaryTexture: 'matte', secondaryColor: '#7d6b5d',
      noun: 'curated console decor arrangement',
      description: 'A curated stack of coffee-table art books beside a sculptural ceramic vessel with dried botanicals.',
    },
  };
  Object.assign(V.presets, add);

  if (V.categories && !V.categories.seating) {
    const cats = {};
    for (const [k, c] of Object.entries(V.categories)) {
      if (k === 'props') cats.seating = { label: 'Seating', icon: '🛋️' };
      cats[k] = c;
    }
    for (const k of Object.keys(V.categories)) delete V.categories[k];
    Object.assign(V.categories, cats);
  }

  /* Effective params for a preset/element: schema defaults ← preset params ← element params. */
  function resolveParams(presetKey, raw) {
    const p = V.presets[presetKey] || {};
    const arche = archetypes[p.archetype || 'plain'] || archetypes.plain;
    const out = {};
    const keys = new Set([...arche.controls, ...Object.keys(p.params || {})]);
    for (const k of keys) {
      const sc = paramSchema[k];
      if (!sc) continue;
      let v = raw && raw[k] !== undefined ? raw[k] : p.params && p.params[k] !== undefined ? p.params[k] : sc.def;
      if (sc.kind === 'int' || sc.kind === 'num') {
        v = Number(v);
        if (!Number.isFinite(v)) v = sc.def;
        v = Math.min(sc.max, Math.max(sc.min, sc.kind === 'int' ? Math.round(v) : v));
      } else if (sc.kind === 'bool') v = !!v;
      else if (sc.kind === 'enum' && !(v in sc.options)) v = sc.def;
      out[k] = v;
    }
    return out;
  }

  Object.assign(V, { palettes, swatchIndex, textureFamily, textureNoun, archetypes, paramSchema, handlePhrase, resolveParams });
})();
