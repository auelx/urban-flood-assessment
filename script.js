    // Initialize map with default controls disabled
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([14.1122, 122.9553], 13);

    // Initialize Lucide Icons
    lucide.createIcons();

    // Populate Layer Panel
    const layerList = document.getElementById('layer-list');
    const basemapList = document.getElementById('basemap-list');
    const basemapInputs = [];
    const layerPanel = document.getElementById('layer-panel');
    const btnLayers = document.getElementById('btn-layers');

    function isSet(value) {
      return value !== undefined && value !== null && value !== '';
    }

    function setupLayerRow(def) {
      const isBasemap = def.target === 'basemap';
      const row = document.createElement('label');
      row.className = 'layer-row' + (isBasemap ? ' basemap-row' : '');

      const name = document.createElement('span');
      name.textContent = def.label;

      const input = document.createElement('input');
      input.type = isBasemap ? 'radio' : 'checkbox';
      if (isBasemap) input.name = 'basemap';
      input.id = 'layer-' + def.id;
      input.checked = def.visible;

      let control;
      if (isBasemap) {
        control = document.createElement('span');
        control.className = 'basemap-check';
        control.innerHTML = '<i data-lucide="check" width="20" height="20"></i>';
        if (input.checked) control.classList.add('checked');
        row.appendChild(input);
      } else {
        control = document.createElement('span');
        control.className = 'switch';
        const track = document.createElement('span');
        track.className = 'track';
        control.appendChild(input);
        control.appendChild(track);
      }

      input.addEventListener('change', () => {
        if (isBasemap) {
          if (input.checked) {
            basemapInputs.forEach(other => {
              if (other !== input) {
                other.checked = false;
                other.dispatchEvent(new Event('change'));
              }
            });
          }
          control.classList.toggle('checked', input.checked);
          row.classList.toggle('checked', input.checked);
        }
        if (input.checked) {
          map.addLayer(def.layer);
        } else {
          map.removeLayer(def.layer);
        }
        if (def.onToggle) def.onToggle(input.checked);
      });

      row.appendChild(name);
      row.appendChild(control);
      const list = isBasemap ? basemapList : layerList;
      list.appendChild(row);
      if (isBasemap) basemapInputs.push(input);

      if (def.visible) {
        map.addLayer(def.layer);
        if (def.onToggle) def.onToggle(true);
      }
    }

    // Base Tile Layers (radio: only one visible at a time)
    setupLayerRow({
      id: 'street',
      target: 'basemap',
      label: 'Street Map',
      layer: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }),
      visible: true
    });

    setupLayerRow({
      id: 'topo',
      target: 'basemap',
      label: 'Topographic',
      layer: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17
      }),
      visible: false
    });

    setupLayerRow({
      id: 'satellite',
      target: 'basemap',
      label: 'Esri Satellite',
      layer: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 17
      }),
      visible: false
    });

    setupLayerRow({
      id: 'google-satellite',
      target: 'basemap',
      label: 'Google Satellite',
      layer: L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20
      }),
      visible: false
    });

    // Render dynamically added basemap check icons
    lucide.createIcons();

    // Assessment Data Layers

    function esc(value) {
      return String(value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[ch]);
    }

    function typeDashArray(pct) {
      if (['bank protection', 'legal easement'].includes(pct)) return '10, 5';
      return 'none';
    }

    function typeColor(pct) {
      if (['creek', 'depression', 'irrigation', 'lagoon', 'river', 'salvage zone', 'swamp'].includes(pct)) return '#9ccdee';
      if (['bank protection', 'legal easement'].includes(pct)) return '#facc15';
      return '#22c55e';
    }

    function barangayBoundariesStyle() {
      return {
        color: '#374151',
        weight: 1,
        dashArray: '5, 5',
        fillColor: '#a3e635',
        fillOpacity: 0.5
      }
    }

    function waterwaysStyle(feature) {
      return {
        color: '#2563eb',
        weight: 1,
        fillOpacity: 0.4,
        dashArray: typeDashArray(feature.properties.desc),
        fillColor: typeColor(feature.properties.desc)
      };
    }

    let barangayByCode = {};
    let nameToCode = {};

    function normalizeName(s) {
      return String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    }

    async function loadGeoData() {
      try {
        const ASSETS_URL = 'https://raw.githubusercontent.com/auelx/urban-flood-assessment/main/assets/';
        const [daetBoundaryRes, boundaryRes, landmarkRes, cadastralRes, namriaRes] = await Promise.all([
          fetch(ASSETS_URL + 'geojson/daet_administrative_boundary.geojson'),
          fetch(ASSETS_URL + 'geojson/barangay_boundaries.geojson'),
          fetch(ASSETS_URL + 'geojson/landmarks.geojson'),
          fetch(ASSETS_URL + 'geojson/waterways_cadastral.geojson'),
          fetch(ASSETS_URL + 'geojson/waterways_namria.geojson'),
        ]);
        fetch(ASSETS_URL + 'images/images.json')
          .then(r => r.status !== 200 ? { barangay: [] } : r.json())
          .then(data => {
            (data && data.barangay || []).forEach(b => {
              barangayByCode[b.code] = b;
              if (b.name) nameToCode[normalizeName(b.name)] = b.code;
            });
          })
          .catch(() => {});
        if (!boundaryRes.ok || !landmarkRes.ok || !cadastralRes.ok || !namriaRes.ok) {
          throw new Error('HTTP ' + boundaryRes.status + ' / ' + landmarkRes.status + ' / ' + cadastralRes.status + ' / ' + namriaRes.status);
        }
        const [daetBoundaryData, boundaryData, landmarkData, cadastralData, namriaData] = await Promise.all([
          daetBoundaryRes.json(),
          boundaryRes.json(),
          landmarkRes.json(),
          cadastralRes.json(),
          namriaRes.json()
        ]);

        landmarkData.features.forEach(f => {
          const nm = f.properties.BARANGAY;
          if (nm) nameToCode[normalizeName(nm)] = f.properties.image || f.properties.code;
        });

        const BASE_MARKER_STYLE = { radius: 7, color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1, bubblingMouseEvents: false };
        const HIGHLIGHT_MARKER_STYLE = { radius: 10, color: '#1d4ed8', weight: 2, fillColor: '#f97316', fillOpacity: 1, interactive: false };
        const HIGHLIGHT_POLYGON_STYLE = {
            color: '#ffffff',      // Color of the extra border
            weight: 5,             // Make it thicker than the original border
            opacity: 1,
            fillColor: '#ffffff',  // Transparent fill
            fillOpacity: 0,
            pane: 'overlayPane',   // Ensure it sits on top
            interactive: false     // Never intercept pointer events
          };

        let selectedLayer = null;

        function select(latLngs) {
          deselect();
          selectedLayer = L.polygon(latLngs, HIGHLIGHT_POLYGON_STYLE).addTo(map);
        }

        function selectMarker(latLngs) {
          selectedLayer = L.circleMarker(latLngs, HIGHLIGHT_MARKER_STYLE).addTo(map);
        }

        function deselect() {
          if (selectedLayer) {
            map.removeLayer(selectedLayer);
          }
        }

        function assetUrl(path) {
          if (!path) return null;
          return /^https?:\/\//i.test(path) ? path : ASSETS_URL + path.replace(/^assets\//, '');
        }

        function getBarangayByCode(code) {
          return code ? barangayByCode[code] : null;
        }

        function getBarangayByName(name) {
          const code = name ? nameToCode[normalizeName(name)] : null;
          return code ? barangayByCode[code] : null;
        }

        function showFeatureInfo({ title, rows, barangay }) {
          const record = barangay || null;
          const panel = document.getElementById('info-panel');
          document.getElementById('info-title').textContent = (record ? record.name : title).toUpperCase();

          const logoEl = document.getElementById('info-logo');
          logoEl.classList.remove('info-panel__logo--empty');
          const logoUrl = assetUrl(record && record.logo ? record.logo : '');
          if (logoUrl) {
            const logoImg = document.createElement('img');
            logoImg.src = logoUrl;
            logoImg.alt = record.name;
            logoEl.innerHTML = '';
            logoEl.appendChild(logoImg);
          } else {
            logoEl.innerHTML = '<i data-lucide="building-2" width="26" height="26"></i>';
            logoEl.classList.add('info-panel__logo--empty');
            lucide.createIcons();
          }

          const content = document.getElementById('info-content');
          content.innerHTML = '';
          if (record) {
            const mapWrap = document.createElement('div');
            mapWrap.className = 'info-panel__map';
            const mapUrl = assetUrl(record.map);
            const showMapPlaceholder = () => {
              mapWrap.classList.add('info-panel__map--empty');
              mapWrap.innerHTML = '<i data-lucide="map" width="24" height="24"></i><span>Map not available</span>';
              lucide.createIcons();
            };
            if (mapUrl) {
              const img = document.createElement('img');
              img.className = 'info-panel__map-img';
              img.src = mapUrl;
              img.alt = 'Map of ' + record.name;
              img.addEventListener('error', showMapPlaceholder);
              img.addEventListener('click', () => openImageModal(mapUrl));
              mapWrap.appendChild(img);
            } else {
              showMapPlaceholder();
            }
            content.appendChild(mapWrap);
          }
          rows.forEach(([k, v]) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'info-panel__row';
            const keyEl = document.createElement('span');
            keyEl.className = 'info-panel__key';
            keyEl.textContent = k;
            const valEl = document.createElement('span');
            valEl.className = 'info-panel__val';
            valEl.textContent = v;
            rowEl.appendChild(keyEl);
            rowEl.appendChild(valEl);
            content.appendChild(rowEl);
          });

          if (record && record.activities && record.activities.length) {
            const section = document.createElement('div');
            section.className = 'info-panel__section';
            const heading = document.createElement('div');
            heading.className = 'info-panel__section-heading';
            heading.textContent = 'Activities';
            section.appendChild(heading);
            record.activities.forEach(act => {
              const row = document.createElement('div');
              row.className = 'info-panel__activity';
              row.textContent = act.name;
              section.appendChild(row);
              if (act.image && act.image.length) {
                const thumbs = document.createElement('div');
                thumbs.className = 'info-panel__thumbs';
                const urls = act.image.map(assetUrl).filter(Boolean);
                const visible = urls.slice(0, MAX_ACTIVITY_THUMBS);
                visible.forEach((url, i) => {
                  const img = document.createElement('img');
                  img.className = 'info-panel__thumb';
                  img.src = url;
                  img.alt = act.name;
                  img.addEventListener('click', () => openImageModal(urls, i));
                  thumbs.appendChild(img);
                });
                if (urls.length > visible.length) {
                  const more = document.createElement('div');
                  more.className = 'info-panel__thumb info-panel__more';
                  more.textContent = '+' + (urls.length - visible.length);
                  more.title = 'Show all images';
                  more.addEventListener('click', () => openImageModal(urls, visible.length));
                  thumbs.appendChild(more);
                }
                section.appendChild(thumbs);
              }
            });
            content.appendChild(section);
          }

          panel.classList.add('show');
        }

        function closeFeatureInfo() {
          document.getElementById('info-panel').classList.remove('show');
          deselect();
        }

        document.getElementById('info-close').addEventListener('click', closeFeatureInfo);
        map.on('click', closeFeatureInfo);

        const daetBoundaryLayer = L.geoJSON(daetBoundaryData, {
          bubblingMouseEvents: false,
          style: {
            color: '#374151',
            weight: 1,
            fillOpacity: 0,
          }
        });

        const boundariesLayer = L.geoJSON(boundaryData, {
          bubblingMouseEvents: false,
          style: barangayBoundariesStyle,
          onEachFeature: (feature, layer) => {
            const p = feature.properties;
            const population = p.Househol_1 ? String(p.Househol_1).replace(/,/g, '') : p.Brgy_Pop;
            const under5 = isSet(p.below5) ? p.below5 + ' (' + p.below5_pro + '%)' : null;
            const over60 = isSet(p.above60) ? p.above60 + ' (' + p['60_pro'] + '%)' : null;
            const rows = [
              ['Population', population],
              ['Households', p.Household],
              ['Under 5', under5],
              ['Over 60', over60]
            ].filter(([, v]) => isSet(v));
            layer.on('click', () => {
              select(layer.getLatLngs());
              showFeatureInfo({
                title: p.REMARK || p.ADM_NM || 'Unknown',
                rows,
                barangay: getBarangayByName(p.REMARK || p.ADM_NM)
              });
            });
            layer.on('mouseover', (e) => {
              const latlngs = e.target.getLatLngs();
              
              select(latlngs);
            })
            layer.on('mouseout', () => {
              deselect();
            });
          }
        });

        const landmarksLayer = L.geoJSON(landmarkData, {
          bubblingMouseEvents: false,
          pointToLayer: (feature, latlng) => {
            return L.circleMarker(latlng, BASE_MARKER_STYLE);
          },
          onEachFeature: (feature, layer) => {
            layer.on('click', () => {
              deselect();
              selectMarker(layer.getLatLng());
              showFeatureInfo({
                title: feature.properties.BARANGAY || 'Unknown',
                rows: [['Code', feature.properties.code]],
                barangay: getBarangayByCode(feature.properties.image || feature.properties.code)
              });
            });
          }
        });

        const cadastralLayer = L.geoJSON(cadastralData, {
         bubblingMouseEvents: false,
         style: waterwaysStyle,
          onEachFeature: (feature, layer) => {
            layer.on('click', () => {
              showFeatureInfo({
                title: feature.properties.NAME || 'Waterway',
                rows: [['Type', feature.properties.desc]],
                barangay: null
              });
            });
          }
        });

        const namriaLayer = L.geoJSON(namriaData, {
         bubblingMouseEvents: false,
         style: waterwaysStyle,
          onEachFeature: (feature, layer) => {
            layer.on('click', () => {
              showFeatureInfo({
                title: feature.properties.NAME || 'Waterway',
                rows: [['Type', feature.properties.desc]],
                barangay: null
              });
            });
          }
        });

        setupLayerRow({
          id: 'daet',
          label: 'Daet Boundaries',
          layer: daetBoundaryLayer,
          visible: true
        });

        setupLayerRow({
          id: 'boundaries',
          label: 'Barangay Boundaries',
          layer: boundariesLayer,
          visible: true
        });

        setupLayerRow({
          id: 'landmarks',
          label: 'Barangay Halls',
          layer: landmarksLayer,
          visible: true
        });

        setupLayerRow({
          id: 'cadastral',
          label: 'Waterways (Cadastral)',
          layer: cadastralLayer,
          visible: false
        });

        setupLayerRow({
          id: 'namria',
          label: 'Waterways (NAMRIA)',
          layer: namriaLayer,
          visible: false
        });

      } catch (err) {
        const banner = document.getElementById('data-error');
        banner.textContent = 'Could not load assessment data from GitHub. Check your connection and reload.';
        banner.classList.add('show');
      }
    }

    loadGeoData();

    // Control Event Listeners
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      map.zoomIn();
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      map.zoomOut();
    });

    btnLayers.addEventListener('click', () => {
      const active = layerPanel.classList.toggle('active');
      btnLayers.setAttribute('aria-pressed', String(active));
    });

    // Image Preview Modal
    let modalImages = [];
    let modalIndex = 0;
    const MAX_ACTIVITY_THUMBS = 3;

    function openImageModal(sources, index) {
      const list = Array.isArray(sources) && sources.length ? sources : [sources];
      modalImages = list;
      modalIndex = Math.min(Math.max(index || 0, 0), list.length - 1);
      renderModalImage();
      document.getElementById('image-modal').classList.add('show');
    }

    function renderModalImage() {
      document.getElementById('image-modal-img').src = modalImages[modalIndex];
      const single = modalImages.length <= 1;
      const prevBtn = document.getElementById('image-modal-prev');
      const nextBtn = document.getElementById('image-modal-next');
      prevBtn.style.display = single ? 'none' : '';
      nextBtn.style.display = single ? 'none' : '';
      prevBtn.disabled = modalIndex <= 0;
      nextBtn.disabled = modalIndex >= modalImages.length - 1;
    }

    function prevImage() {
      if (modalIndex > 0) {
        modalIndex--;
        renderModalImage();
      }
    }

    function nextImage() {
      if (modalIndex < modalImages.length - 1) {
        modalIndex++;
        renderModalImage();
      }
    }

    function closeImageModal() {
      document.getElementById('image-modal').classList.remove('show');
      document.getElementById('image-modal-img').src = '';
      modalImages = [];
      modalIndex = 0;
    }

    document.getElementById('image-modal-close').addEventListener('click', closeImageModal);
    document.getElementById('image-modal-prev').addEventListener('click', prevImage);
    document.getElementById('image-modal-next').addEventListener('click', nextImage);
    document.getElementById('image-modal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('image-modal')) {
        closeImageModal();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeImageModal();
      } else if (e.key === 'ArrowLeft') {
        prevImage();
      } else if (e.key === 'ArrowRight') {
        nextImage();
      }
    });
