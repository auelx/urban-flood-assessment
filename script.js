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
    const basemapCheckboxes = [];
    const layerPanel = document.getElementById('layer-panel');
    const btnLayers = document.getElementById('btn-layers');

    function isSet(value) {
      return value !== undefined && value !== null && value !== '';
    }

    function setupLayerRow(def) {
      const row = document.createElement('div');
      row.className = 'layer-row';

      const label = document.createElement('label');
      label.textContent = def.label;
      label.setAttribute('for', 'layer-' + def.id);

      const toggle = document.createElement('label');
      toggle.className = 'switch';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'layer-' + def.id;
      checkbox.checked = def.visible;
      const track = document.createElement('span');
      track.className = 'track';
      toggle.appendChild(checkbox);
      toggle.appendChild(track);

      checkbox.addEventListener('change', () => {
        if (def.target === 'basemap') {
          if (checkbox.checked) {
            basemapCheckboxes.forEach(other => {
              if (other !== checkbox) {
                other.checked = false;
                other.dispatchEvent(new Event('change'));
              }
            });
          }
        }
        if (checkbox.checked) {
          map.addLayer(def.layer);
        } else {
          map.removeLayer(def.layer);
        }
        if (def.onToggle) def.onToggle(checkbox.checked);
      });

      row.appendChild(label);
      row.appendChild(toggle);
      const list = def.target === 'basemap' ? basemapList : layerList;
      list.appendChild(row);
      if (def.target === 'basemap') basemapCheckboxes.push(checkbox);

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

    async function loadGeoData() {
      try {
        const [daetBoundaryRes, boundaryRes, landmarkRes, cadastralRes, namriaRes] = await Promise.all([
          fetch('https://raw.githubusercontent.com/auelx/urban-flood-assessment/main/assets/daet_administrative_boundary.geojson'),
          fetch('https://raw.githubusercontent.com/auelx/urban-flood-assessment/main/assets/barangay_boundaries.geojson'),
          fetch('https://raw.githubusercontent.com/auelx/urban-flood-assessment/main/assets/landmarks.geojson'),
          fetch('https://raw.githubusercontent.com/auelx/urban-flood-assessment/main/assets/waterways_cadastral.geojson'),
          fetch('https://raw.githubusercontent.com/auelx/urban-flood-assessment/main/assets/waterways_namria.geojson'),
        ]);
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

        const BASE_MARKER_STYLE = { radius: 7, color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 };
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

        const daetBoundaryLayer = L.geoJSON(daetBoundaryData, {
          style: {
            color: '#374151',
            weight: 1,
            fillOpacity: 0,
          }
        });

        const boundariesLayer = L.geoJSON(boundaryData, {
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
            layer.bindPopup(
              '<strong>' + esc(p.REMARK || p.ADM_NM || 'Unknown') + '</strong><br>' +
              rows.map(([k, v]) => esc(k) + ': <b>' + esc(v) + '</b>').join('<br>')
            );
            layer.on('mouseover', (e) => {
              const latlngs = e.target.getLatLngs();
              
              select(latlngs);
            })
            layer.on('mouseout', () => {
              deselect();
            });
            layer.on('popupclose', () => {
              deselect();
            });
          }
        });

        const landmarksLayer = L.geoJSON(landmarkData, {
          pointToLayer: (feature, latlng) => {
            const logo = feature.properties.logo;
            if (logo) {
              return L.marker(latlng, {
                icon: L.divIcon({
                  className: 'hall-marker',
                  html: '<img src="' + esc(logo) + '" alt="">',
                  iconSize: [34, 34],
                  iconAnchor: [17, 17]
                })
              });
            }
            return L.circleMarker(latlng, BASE_MARKER_STYLE);
          },
          onEachFeature: (feature, layer) => {
            layer.bindPopup('<strong>' + esc(feature.properties.BARANGAY) + '</strong>');
            layer.on('click', () => {
              deselect();
              selectMarker(layer.getLatLng());
            });
            layer.on('popupclose', () => {
              deselect();
            });
          }
        });

        const cadastralLayer = L.geoJSON(cadastralData, {
         style: waterwaysStyle,
          onEachFeature: (feature, layer) => {
            layer.bindPopup('<strong>' + esc(feature.properties.NAME || 'Waterway') + '</strong>');
          }
        });

        const namriaLayer = L.geoJSON(namriaData, {
         style: waterwaysStyle,
          onEachFeature: (feature, layer) => {
            layer.bindPopup('<strong>' + esc(feature.properties.NAME || 'Waterway') + '</strong>');
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
          visible: true
        });

        setupLayerRow({
          id: 'namria',
          label: 'Waterways (NAMRIA)',
          layer: namriaLayer,
          visible: true
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
