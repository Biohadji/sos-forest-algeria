const NASA_API = {
    POWER_URL: 'https://power.larc.nasa.gov/api/temporal/daily/point',
    FIRMS_URL: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv',
    EONET_URL: 'https://eonet.gsfc.nasa.gov/api/v3/events',
    GIBS_URL: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best'
};

const WORLDVIEW_CONFIG = {
    BBOX: [-8.68, 18.97, 11.99, 37.34],
    CENTER: [28.03, 1.65],
    DATE_START: '2026-04-30',
    DATE_END: '2026-08-28',
    CATEGORIES: ['Wildfires', 'Wildland Fires', 'Fires'],
    LAYERS: [
        'MODIS_Terra_Thermal_Anomalies_3km',
        'VIIRS_SNPP_Thermal_Anomalies_375m',
        'MODIS_Terra_CorrectedReflectance_TrueColor'
    ],
    REFERENCE_URL: 'https://worldview.earthdata.nasa.gov/?v=-13.68,13.97,16.99,42.34&l=MODIS_Terra_Thermal_Anomalies_3km',
    COUNTRY: 'Algeria',
    COUNTRY_CODE: 'DZ'
};

const WEATHER_PARAMS = {
    ALLSKY_KT: 'Clearness Index',
    ALLSKY_SFC_SW_DWN: 'Solar Radiation',
    T2M: 'Temperature at 2M',
    T2M_MAX: 'Max Temperature at 2M',
    T2M_MIN: 'Min Temperature at 2M',
    T2MDEW: 'Dew Point at 2M',
    RH2M: 'Relative Humidity at 2M',
    WS2M: 'Wind Speed at 2M',
    WD2M: 'Wind Direction at 2M',
    PRECTOTCORR: 'Precipitation',
    PS: 'Surface Pressure',
    CLOUD_AMT: 'Cloud Amount',
    GWETROOT: 'Root Zone Soil Wetness',
    GWETPROF: 'Profile Soil Moisture'
};

async function fetchNASAWeather(lat, lng, startDate, endDate) {
    try {
        const params = Object.keys(WEATHER_PARAMS).join(',');
        const url = `${NASA_API.POWER_URL}?parameters=${params}&community=RE&longitude=${lng}&latitude=${lat}&start=${startDate}&end=${endDate}&format=JSON`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.properties && data.properties.parameter) {
            return { success: true, source: 'NASA_POWER', data: data.properties.parameter };
        }
        throw new Error('Invalid data structure');
    } catch (err) {
        console.warn('NASA POWER API unavailable, using simulated data:', err.message);
        return { success: false, source: 'simulated', data: generateSimulatedWeather(lat, lng) };
    }
}

function generateSimulatedWeather(lat, lng) {
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const seasonalFactor = Math.sin((dayOfYear - 80) * Math.PI / 182.5);
    const elevation = Math.max(0, (40 - Math.abs(lat - 32)) * 10);
    const coastalFactor = Math.max(0, 1 - Math.abs(lng + 2) / 12);

    const baseTemp = 22 + 12 * seasonalFactor - elevation * 0.006;
    const baseHumidity = 35 + 25 * coastalFactor - 15 * seasonalFactor;
    const basePrecip = Math.max(0, 2 - 3 * seasonalFactor + 4 * coastalFactor);
    const baseWind = 8 + 5 * Math.random();

    const result = {};
    const days = 30;
    const dates = {};
    for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        dates[key] = true;
    }
    const dateKeys = Object.keys(dates);

    for (const [param, label] of Object.entries(WEATHER_PARAMS)) {
        result[param] = {};
        dateKeys.forEach((key, i) => {
            const noise = (Math.random() - 0.5) * 4;
            switch (param) {
                case 'T2M':
                    result[param][key] = +(baseTemp + noise).toFixed(1);
                    break;
                case 'T2M_MAX':
                    result[param][key] = +(baseTemp + 5 + noise).toFixed(1);
                    break;
                case 'T2M_MIN':
                    result[param][key] = +(baseTemp - 5 + noise).toFixed(1);
                    break;
                case 'T2MDEW':
                    result[param][key] = +(baseTemp - 10 + noise).toFixed(1);
                    break;
                case 'RH2M':
                    result[param][key] = +Math.max(5, Math.min(100, baseHumidity + noise * 3)).toFixed(1);
                    break;
                case 'WS2M':
                    result[param][key] = +Math.max(0, baseWind + noise).toFixed(1);
                    break;
                case 'WD2M':
                    result[param][key] = +((Math.random() * 360)).toFixed(0);
                    break;
                case 'PRECTOTCORR':
                    result[param][key] = +Math.max(0, basePrecip + noise * 0.5).toFixed(1);
                    break;
                case 'PS':
                    result[param][key] = +(1013 - elevation * 0.1 + noise * 0.5).toFixed(1);
                    break;
                case 'ALLSKY_KT':
                    result[param][key] = +Math.max(0, Math.min(1, 0.6 + 0.2 * seasonalFactor + noise * 0.05)).toFixed(2);
                    break;
                case 'ALLSKY_SFC_SW_DWN':
                    result[param][key] = +Math.max(0, 4 + 3 * seasonalFactor + noise * 0.3).toFixed(1);
                    break;
                case 'CLOUD_AMT':
                    result[param][key] = +Math.max(0, Math.min(100, 30 + 20 * coastalFactor + noise * 5)).toFixed(0);
                    break;
                case 'GWETROOT':
                    result[param][key] = +Math.max(0, Math.min(1, 0.3 + 0.2 * coastalFactor - 0.1 * seasonalFactor + noise * 0.03)).toFixed(2);
                    break;
                case 'GWETPROF':
                    result[param][key] = +Math.max(0, Math.min(1, 0.25 + 0.15 * coastalFactor - 0.1 * seasonalFactor + noise * 0.03)).toFixed(2);
                    break;
                default:
                    result[param][key] = +(baseTemp + noise).toFixed(1);
            }
        });
    }
    return result;
}

function calculateFireRisk(weatherData) {
    if (!weatherData) return { level: 'unknown', score: 0, factors: {} };

    const getLatest = (param) => {
        if (!weatherData[param]) return null;
        const keys = Object.keys(weatherData[param]).sort().reverse();
        return keys.length > 0 ? weatherData[param][keys[0]] : null;
    };

    const temp = getLatest('T2M') ?? getLatest('T2M_MAX') ?? 25;
    const humidity = getLatest('RH2M') ?? 50;
    const wind = getLatest('WS2M') ?? 5;
    const precip = getLatest('PRECTOTCORR') ?? 0;
    const solarRad = getLatest('ALLSKY_SFC_SW_DWN') ?? 5;
    const soilWetness = getLatest('GWETROOT') ?? 0.3;

    const tempScore = Math.min(1, Math.max(0, (temp - 15) / 25));
    const humidityScore = Math.min(1, Math.max(0, (70 - humidity) / 50));
    const windScore = Math.min(1, Math.max(0, (wind - 2) / 18));
    const precipScore = Math.min(1, Math.max(0, 1 - precip / 5));
    const solarScore = Math.min(1, Math.max(0, (solarRad - 2) / 6));
    const drynessScore = Math.min(1, Math.max(0, (0.5 - soilWetness) / 0.5));

    const weightedScore = (
        tempScore * 0.30 +
        humidityScore * 0.25 +
        windScore * 0.15 +
        precipScore * 0.10 +
        solarScore * 0.10 +
        drynessScore * 0.10
    );

    const score = Math.round(weightedScore * 100);
    let level;
    if (score >= 80) level = 'extreme';
    else if (score >= 60) level = 'very_high';
    else if (score >= 40) level = 'high';
    else if (score >= 25) level = 'moderate';
    else level = 'low';

    return {
        level,
        score,
        factors: {
            temperature: { value: temp, score: Math.round(tempScore * 100), label: WEATHER_PARAMS.T2M },
            humidity: { value: humidity, score: Math.round(humidityScore * 100), label: WEATHER_PARAMS.RH2M },
            wind: { value: wind, score: Math.round(windScore * 100), label: WEATHER_PARAMS.WS2M },
            precipitation: { value: precip, score: Math.round(precipScore * 100), label: WEATHER_PARAMS.PRECTOTCORR },
            solarRadiation: { value: solarRad, score: Math.round(solarScore * 100), label: WEATHER_PARAMS.ALLSKY_SFC_SW_DWN },
            soilMoisture: { value: soilWetness, score: Math.round(drynessScore * 100), label: WEATHER_PARAMS.GWETROOT }
        },
        timestamp: new Date().toISOString()
    };
}

async function fetchWorldviewEONETEvents() {
    try {
        const url = `${NASA_API.EONET_URL}?category=wildfires&limit=100&status=closed&start=${WORLDVIEW_CONFIG.DATE_START}&end=${WORLDVIEW_CONFIG.DATE_END}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const events = (data.events || []).filter(event => {
            return event.geometry && event.geometry.some(geo => {
                const [lng, lat] = geo.coordinates;
                return (
                    lat >= WORLDVIEW_CONFIG.BBOX[1] &&
                    lat <= WORLDVIEW_CONFIG.BBOX[3] &&
                    lng >= WORLDVIEW_CONFIG.BBOX[0] &&
                    lng <= WORLDVIEW_CONFIG.BBOX[2]
                );
            });
        });
        return { success: true, source: 'NASA_EONET', count: events.length, events };
    } catch (err) {
        console.warn('NASA EONET API unavailable, generating simulated events:', err.message);
        return { success: false, source: 'simulated', count: 0, events: generateSimulatedEONETEvents() };
    }
}

function generateSimulatedEONETEvents() {
    const algerianRegions = [
        { name: 'Tizi Ouzou', lat: 36.71, lng: 4.05 },
        { name: 'Bejaia', lat: 36.75, lng: 5.08 },
        { name: 'Jijel', lat: 36.82, lng: 5.76 },
        { name: 'Skikda', lat: 36.88, lng: 6.91 },
        { name: 'El Tarf', lat: 36.77, lng: 8.31 },
        { name: 'Blida', lat: 36.47, lng: 2.83 },
        { name: 'Medea', lat: 36.27, lng: 2.75 },
        { name: 'Tlemcen', lat: 34.88, lng: -1.31 },
        { name: 'Batna', lat: 35.56, lng: 6.17 },
        { name: 'Setif', lat: 36.19, lng: 5.41 },
        { name: 'Guelma', lat: 36.46, lng: 7.43 },
        { name: 'Constantine', lat: 36.37, lng: 6.61 },
        { name: 'Annaba', lat: 36.90, lng: 7.77 },
        { name: 'Biskra', lat: 34.85, lng: 5.73 },
        { name: 'Djelfa', lat: 34.67, lng: 3.25 }
    ];
    const events = [];
    const now = new Date();
    const count = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
        const region = algerianRegions[Math.floor(Math.random() * algerianRegions.length)];
        const latOffset = (Math.random() - 0.5) * 0.3;
        const lngOffset = (Math.random() - 0.5) * 0.3;
        const date = new Date(now);
        date.setDate(date.getDate() - Math.floor(Math.random() * 30));
        events.push({
            id: `sim-eonet-${Date.now()}-${i}`,
            title: `Wildfire near ${region.name}`,
            description: `Simulated wildfire event in ${region.name} region, Algeria`,
            categories: [{ id: 'Wildfires', title: 'Wildfires' }],
            sources: [{ id: 'In situ', url: '' }],
            geometry: [{
                date: date.toISOString(),
                type: 'Point',
                coordinates: [+(region.lng + lngOffset).toFixed(4), +(region.lat + latOffset).toFixed(4)]
            }]
        });
    }
    return events;
}

async function fetchFIRMSFireData() {
    try {
        const url = `${NASA_API.FIRMS_URL}/VIIRS_SNPP_NRT/worldwide/1/2026-08-28`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const lines = text.trim().split('\n');
        if (lines.length < 2) throw new Error('No data rows');
        const headers = lines[0].split(',');
        const fires = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length < headers.length) continue;
            const row = {};
            headers.forEach((h, idx) => { row[h.trim()] = values[idx]?.trim(); });
            const lat = parseFloat(row.latitude || row.LATITUDE);
            const lng = parseFloat(row.longitude || row.LONGITUDE);
            if (isNaN(lat) || isNaN(lng)) continue;
            if (
                lat >= WORLDVIEW_CONFIG.BBOX[1] &&
                lat <= WORLDVIEW_CONFIG.BBOX[3] &&
                lng >= WORLDVIEW_CONFIG.BBOX[0] &&
                lng <= WORLDVIEW_CONFIG.BBOX[2]
            ) {
                fires.push({
                    latitude: lat,
                    longitude: lng,
                    brightness: parseFloat(row.bright_ti4 || row.BRIGHT_TI4 || row.brightness || 0),
                    scan: parseFloat(row.scan || row.SCAN || 1),
                    track: parseFloat(row.track || row.TRACK || 1),
                    acq_date: row.acq_date || row.ACQ_DATE || '',
                    acq_time: row.acq_time || row.ACQ_TIME || '',
                    satellite: row.satellite || row.SATELLITE || 'N',
                    confidence: row.confidence || row.CONFIDENCE || 'nom',
                    frp: parseFloat(row.frp || row.FRP || 0),
                    daynight: row.daynight || row.DAYNIGHT || 'D'
                });
            }
        }
        return { success: true, source: 'NASA_FIRMS', count: fires.length, fires };
    } catch (err) {
        console.warn('NASA FIRMS API unavailable, generating simulated fire data:', err.message);
        return { success: false, source: 'simulated', count: 0, fires: generateSimulatedFIRMSData() };
    }
}

function generateSimulatedFIRMSData() {
    const algerianRegions = [
        { name: 'Tizi Ouzou', lat: 36.71, lng: 4.05, risk: 0.85 },
        { name: 'Bejaia', lat: 36.75, lng: 5.08, risk: 0.80 },
        { name: 'Jijel', lat: 36.82, lng: 5.76, risk: 0.75 },
        { name: 'Skikda', lat: 36.88, lng: 6.91, risk: 0.70 },
        { name: 'El Tarf', lat: 36.77, lng: 8.31, risk: 0.65 },
        { name: 'Blida', lat: 36.47, lng: 2.83, risk: 0.72 },
        { name: 'Medea', lat: 36.27, lng: 2.75, risk: 0.68 },
        { name: 'Tlemcen', lat: 34.88, lng: -1.31, risk: 0.60 },
        { name: 'Batna', lat: 35.56, lng: 6.17, risk: 0.55 },
        { name: 'Setif', lat: 36.19, lng: 5.41, risk: 0.58 },
        { name: 'Guelma', lat: 36.46, lng: 7.43, risk: 0.62 },
        { name: 'Constantine', lat: 36.37, lng: 6.61, risk: 0.57 },
        { name: 'Annaba', lat: 36.90, lng: 7.77, risk: 0.63 },
        { name: 'Biskra', lat: 34.85, lng: 5.73, risk: 0.45 },
        { name: 'Djelfa', lat: 34.67, lng: 3.25, risk: 0.40 }
    ];
    const fires = [];
    const count = 5 + Math.floor(Math.random() * 10);
    const now = new Date();
    for (let i = 0; i < count; i++) {
        const region = algerianRegions[Math.floor(Math.random() * algerianRegions.length)];
        const riskFactor = region.risk * (0.7 + Math.random() * 0.6);
        if (riskFactor < 0.5) continue;
        const latOffset = (Math.random() - 0.5) * 0.2;
        const lngOffset = (Math.random() - 0.5) * 0.2;
        const date = new Date(now);
        date.setDate(date.getDate() - Math.floor(Math.random() * 3));
        const hours = Math.floor(Math.random() * 24);
        const minutes = Math.floor(Math.random() * 60);
        fires.push({
            latitude: +(region.lat + latOffset).toFixed(4),
            longitude: +(region.lng + lngOffset).toFixed(4),
            brightness: +(280 + Math.random() * 150).toFixed(0),
            scan: +(0.5 + Math.random() * 1.5).toFixed(1),
            track: +(0.5 + Math.random() * 1.5).toFixed(1),
            acq_date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
            acq_time: `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`,
            satellite: Math.random() > 0.5 ? 'N' : '1',
            confidence: riskFactor > 0.7 ? 'high' : riskFactor > 0.5 ? 'nom' : 'low',
            frp: +(10 + Math.random() * 200).toFixed(1),
            daynight: hours >= 6 && hours < 18 ? 'D' : 'N',
            region: region.name
        });
    }
    return fires;
}

function generateFireHotspots(fireData, existingHotspots = []) {
    if (!fireData || fireData.length === 0) return existingHotspots;
    const newHotspots = fireData.map((fire, idx) => ({
        id: `firms-hotspot-${Date.now()}-${idx}`,
        lat: fire.latitude,
        lng: fire.longitude,
        brightness: fire.brightness || 320,
        confidence: fire.confidence || 'nom',
        frp: fire.frp || 50,
        acq_date: fire.acq_date || new Date().toISOString().split('T')[0],
        acq_time: fire.acq_time || '1200',
        satellite: fire.satellite || 'N',
        daynight: fire.daynight || 'D',
        source: fire.region ? 'simulated' : 'NASA_FIRMS',
        region: fire.region || null,
        type: 'fire_hotspot'
    }));
    const merged = [...existingHotspots];
    newHotspots.forEach(hs => {
        const existing = merged.find(
            m => Math.abs(m.lat - hs.lat) < 0.01 && Math.abs(m.lng - hs.lng) < 0.01
        );
        if (!existing) merged.push(hs);
        else if (hs.brightness > existing.brightness) Object.assign(existing, hs);
    });
    return merged;
}

function generateEONETFireEvents(eonetData) {
    if (!eonetData || eonetData.length === 0) return [];
    return eonetData.map((event, idx) => {
        const geo = event.geometry && event.geometry[0];
        if (!geo) return null;
        const [lng, lat] = geo.coordinates || [0, 0];
        return {
            id: event.id || `eonet-event-${idx}`,
            lat,
            lng,
            title: event.title || 'Wildfire Event',
            description: event.description || '',
            category: event.categories?.[0]?.title || 'Wildfires',
            date: geo.date || new Date().toISOString(),
            source: 'NASA_EONET',
            type: 'eonet_event'
        };
    }).filter(Boolean);
}

function filterFiresByRegion(fires, region) {
    if (!region || !region.bounds) return fires;
    const { north, south, east, west } = region.bounds;
    return fires.filter(fire => {
        return fire.lat >= south && fire.lat <= north && fire.lng >= west && fire.lng <= east;
    });
}

function calculateFireIntensity(fire) {
    const brightness = fire.brightness || 300;
    const frp = fire.frp || 0;
    const confidence = fire.confidence === 'high' ? 1 : fire.confidence === 'nom' ? 0.6 : 0.3;
    const brightnessScore = Math.min(1, Math.max(0, (brightness - 280) / 200));
    const frpScore = Math.min(1, Math.max(0, frp / 250));
    const intensity = (brightnessScore * 0.4 + frpScore * 0.4 + confidence * 0.2) * 100;
    let level;
    if (intensity >= 80) level = 'critical';
    else if (intensity >= 60) level = 'high';
    else if (intensity >= 40) level = 'moderate';
    else level = 'low';
    return { intensity: Math.round(intensity), level };
}

function buildWorldviewURL(options = {}) {
    const bbox = options.bbox || WORLDVIEW_CONFIG.BBOX;
    const layers = options.layers || WORLDVIEW_CONFIG.LAYERS;
    const date = options.date || new Date().toISOString().split('T')[0];
    const baselayers = layers.join(',');
    return `${NASA_API.GIBS_URL}?v=${bbox.join(',')}&l=${baselayers}&ts=${date}&t=${Date.now()}`;
}

function getFireColor(intensity) {
    if (intensity >= 80) return '#ff0000';
    if (intensity >= 60) return '#ff6600';
    if (intensity >= 40) return '#ffcc00';
    return '#ffff00';
}

function formatFireDataForDisplay(fires) {
    return fires.map(fire => ({
        ...fire,
        intensity: calculateFireIntensity(fire),
        displayDate: fire.acq_date ? new Date(fire.acq_date).toLocaleDateString('en-GB') : 'N/A',
        displayTime: fire.acq_time ? `${fire.acq_time.slice(0, 2)}:${fire.acq_time.slice(2)}` : 'N/A',
        markerColor: getFireColor(calculateFireIntensity(fire).intensity)
    }));
}
