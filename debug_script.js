            alert("Script loaded OK!");
            // Camelot Helper
            function getCamelotKey(key, mode) {
                // Exportify usually gives Key as integer (0-11) and Mode as integer (0 or 1)
                // Sometimes it gives text. We assume standard Spotify integer format first.
                const k = parseInt(key);
                const m = parseInt(mode);

                if (isNaN(k) || isNaN(m) || k === -1) return "N/A";

                // Camelot Major (Mode 1): 0=8B, 1=3B, 2=10B, 3=5B, 4=12B, 5=7B, 6=2B, 7=9B, 8=4B, 9=11B, 10=6B, 11=1B
                const majorMap = { 0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B", 6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B" };
                // Camelot Minor (Mode 0): 0=5A, 1=12A, 2=7A, 3=2A, 4=9A, 5=4A, 6=11A, 7=6A, 8=1A, 9=8A, 10=3A, 11=10A
                const minorMap = { 0: "5A", 1: "12A", 2: "7A", 3: "2A", 4: "9A", 5: "4A", 6: "11A", 7: "6A", 8: "1A", 9: "8A", 10: "3A", 11: "10A" };

                return m === 1 ? majorMap[k] : minorMap[k];
            }

            function getAggregatedGenre(genreString) {
                if (!genreString) return "Unknown";
                const g = genreString.toLowerCase();

                if (g.match(/hip hop|rap|trap|drill|grime/)) return "Hip Hop / Rap";
                if (g.match(/house|techno|edm|dance|electronic|trance|dubstep|disco/)) return "Electronic / Dance";
                if (g.match(/rock|metal|punk|indie|grunge|alternative/)) return "Rock / Indie";
                if (g.match(/pop|r&b|soul|funk/)) return "Pop / R&B";
                if (g.match(/jazz|blues/)) return "Jazz / Blues";
                if (g.match(/classical|score|soundtrack|orchestral/)) return "Classical / Cinematic";
                if (g.match(/reggae|dancehall/)) return "Reggae / Dancehall";
                if (g.match(/latin|reggaeton|salsa/)) return "Latin";
            }

            // Duration Calculation Logic
            const startTimeEl = document.getElementById('startTime');
            const endTimeEl = document.getElementById('endTime');
            const durationDisplay = document.getElementById('calculatedDuration');

            function updateDuration() {
                const start = startTimeEl.value;
                const end = endTimeEl.value;
                if (!start || !end) return 0;

                const [startH, startM] = start.split(':').map(Number);
                const [endH, endM] = end.split(':').map(Number);

                let startMin = startH * 60 + startM;
                let endMin = endH * 60 + endM;

                if (endMin < startMin) {
                    endMin += 24 * 60; // Handle overnight
                }

                const diffMin = endMin - startMin;
                const h = Math.floor(diffMin / 60);
                const m = diffMin % 60;
                durationDisplay.textContent = `Durée: ${h}h ${m.toString().padStart(2, '0')}m`;

                // Store the calculated duration globally or in an accessible element for drawGraph
                // For now, let's assume drawGraph can access it or we'll pass it.
                // A hidden input or a global variable might be needed if drawGraph doesn't get it from the DOM.
                // Let's add a hidden input for targetDuration as it's referenced in drawGraph.
                let targetDurationInput = document.getElementById('targetDuration');
                if (!targetDurationInput) {
                    targetDurationInput = document.createElement('input');
                    targetDurationInput.type = 'hidden';
                    targetDurationInput.id = 'targetDuration';
                    document.body.appendChild(targetDurationInput); // Append to body or a suitable parent
                }
                targetDurationInput.value = diffMin;

                drawGraph(); // Redraw graph with new duration
                return diffMin;
            }

            startTimeEl.addEventListener('change', updateDuration);
            endTimeEl.addEventListener('change', updateDuration);
            // Initial call to set duration on load
            updateDuration();

            // CSV Handling
            let csvData = []; // Global variable to store parsed CSV data

            document.getElementById('csvFile').addEventListener('change', handleFileSelect, false);

            function handleFileSelect(evt) {
                alert("File selected! Starting parse...");
                const file = evt.target.files[0];
                if (!file) return;

                const importStatsEl = document.getElementById('importStats');
                importStatsEl.textContent = "Lecture du fichier...";
                importStatsEl.style.color = "#2196F3"; // Reset color

                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    complete: function (results) {
                        if (results.errors.length > 0) {
                            console.error("CSV Errors:", results.errors);
                        }
                        let data = results.data;
                        console.log("Parsed Data:", data);

                        if (data.length === 0) {
                            importStatsEl.textContent = "⚠️ Le fichier semble vide.";
                            importStatsEl.className = "error";
                            return;
                        }

                        // Process Data: Add Aggregated Genre
                        data = data.map(row => {
                            const rawGenre = row["Genres"] || "";
                            const aggGenre = getAggregatedGenre(rawGenre);

                            // Create a new object to control order (put Aggregated Genre FIRST)
                            return {
                                "Aggregated Genre": aggGenre,
                                ...row
                            };
                        });

                        // Store global data for the algorithm
                        window.allTracks = data;

                        displayResults(data);
                        importStatsEl.textContent = `✅ ${data.length} morceaux chargés !`;
                        importStatsEl.className = "success";

                        // Show Phase Config
                        try {
                            document.getElementById('phaseConfigStep').style.display = 'block';
                            initGraph(); // Initialize Graph
                        } catch (e) {
                            console.error("Error initializing graph:", e);
                            alert("Erreur lors de l'initialisation du graphique: " + e.message);
                        }
                    },
                    error: function (err) {
                        console.error("PapaParse Error:", err);
                        importStatsEl.textContent = "❌ Erreur critique de parsing.";
                        importStatsEl.className = "error";
                    }
                });
            }

            // --- PHASE ALGORITHM UI & LOGIC (GRAPH VERSION) ---

            let graphData = [];
            const canvas = document.getElementById('flowGraph');
            const ctx = canvas.getContext('2d');
            let isDragging = false;
            let dragPoint = null; // { phaseIndex, type }

            // Initialize Graph Data
            document.getElementById('numPhases').addEventListener('change', initGraph);
            document.getElementById('flowMode').addEventListener('change', initGraph);
            document.getElementById('startTime').addEventListener('change', drawGraph); // Redraw on time change

            function initGraph() {
                const numPhases = parseInt(document.getElementById('numPhases').value) || 5;
                const mode = document.getElementById('flowMode').value;
                graphData = [];

                const defaultDur = 1 / numPhases;

                if (mode === 'party') {
                    // DJ Party Curve Standards (Warmup -> Build -> Peak -> Sustain -> Cool Down)
                    if (numPhases === 5) {
                        graphData = [
                            { name: "Warm-up", energy: 0.4, dance: 0.5, valence: 0.6, tempo: 0.35, duration: 0.15 },
                            { name: "Build", energy: 0.6, dance: 0.7, valence: 0.7, tempo: 0.45, duration: 0.25 },
                            { name: "Peak", energy: 0.9, dance: 0.9, valence: 0.8, tempo: 0.55, duration: 0.20 },
                            { name: "Sustain", energy: 0.85, dance: 0.95, valence: 0.9, tempo: 0.5, duration: 0.25 },
                            { name: "Cool Down", energy: 0.5, dance: 0.6, valence: 0.5, tempo: 0.35, duration: 0.15 }
                        ];
                    } else {
                        // Generic Build-Up for Party
                        for (let i = 0; i < numPhases; i++) {
                            const progress = i / (numPhases - 1);
                            let intensity = 0.4 + (Math.sin(progress * Math.PI * 0.8) * 0.5);
                            graphData.push({
                                name: `Phase ${i + 1}`,
                                energy: intensity,
                                dance: Math.min(1, intensity + 0.1),
                                valence: 0.5 + (intensity * 0.3),
                                tempo: 0.3 + (intensity * 0.3),
                                duration: defaultDur
                            });
                        }
                    }
                } else if (mode === 'apero') {
                    // Apéro Curve: Chill, consistent, happy but low energy
                    const aperoNames = ["Welcome", "Chill", "Groove", "Deep", "Sunset", "Vibe", "Lounge", "Relax", "Mood", "End"];
                    for (let i = 0; i < numPhases; i++) {
                        // Slight wave but mostly flat
                        const wave = Math.sin(i * 0.5) * 0.1;
                        graphData.push({
                            name: aperoNames[i] || `Phase ${i + 1}`,
                            energy: 0.3 + wave,       // Low Energy (0.3 - 0.4)
                            dance: 0.4 + wave,        // Moderate Dance (groove)
                            valence: 0.7,             // High Valence (Happy/Chill)
                            tempo: 0.3 + (wave * 0.5), // Low Tempo (~100 BPM)
                            duration: defaultDur
                        });
                    }
                }

                // Fallback if length mismatch (e.g. switching numPhases manually)
                // We ensure graphData matches numPhases
                while (graphData.length < numPhases) {
                    graphData.push({ name: `Phase ${graphData.length + 1}`, energy: 0.5, dance: 0.5, valence: 0.5, tempo: 0.5, duration: defaultDur });
                }
                while (graphData.length > numPhases) {
                    graphData.pop();
                }

                // Normalize durations to ensure sum is 1.0
                const totalDur = graphData.reduce((sum, p) => sum + (p.duration || 0), 0);
                if (Math.abs(totalDur - 1.0) > 0.01) {
                    graphData.forEach(p => p.duration = p.duration / totalDur);
                }

                drawGraph();
            }

            // Draw the Graph
            function drawGraph() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const padding = 40;
                const w = canvas.width - padding * 2;
                const h = canvas.height - padding * 2;
                const numPhases = graphData.length;

                // Time Calculation
                const startTimeInput = document.getElementById('startTime').value || "21:00";
                const [startH, startM] = startTimeInput.split(':').map(Number);
                const startTotalMinutes = startH * 60 + startM;

                // Use the calculated duration from our global function/state if possible, 
                // or re-calculate it here to be safe.
                // We can read the text content of calculatedDuration or just re-run the logic.
                // Let's re-run logic for safety.
                const endTimeInput = document.getElementById('endTime').value || "22:00";
                const [endH, endM] = endTimeInput.split(':').map(Number);
                let sMin = startH * 60 + startM;
                let eMin = endH * 60 + endM;
                if (eMin < sMin) eMin += 24 * 60;
                const totalDurationMin = eMin - sMin;

                // Calculate X positions for each phase (center) and separators
                let currentX = padding;
                let currentMinutes = 0;
                const phaseCenters = [];
                const separators = []; // { x, timeLabel }

                graphData.forEach((p, i) => {
                    const phaseWidth = p.duration * w;
                    phaseCenters.push(currentX + (phaseWidth / 2));

                    currentX += phaseWidth;
                    currentMinutes += p.duration * totalDurationMin;

                    if (i < numPhases - 1) {
                        // Calculate time label for separator
                        const timeMins = startTotalMinutes + currentMinutes;
                        const h = Math.floor((timeMins / 60) % 24);
                        const m = Math.floor(timeMins % 60);
                        const timeLabel = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                        separators.push({ x: currentX, label: timeLabel });
                    }
                });

                // Draw Grid & Axes
                ctx.strokeStyle = '#eee';
                ctx.lineWidth = 1;
                ctx.beginPath();
                // Horizontal lines
                for (let i = 0; i <= 4; i++) {
                    const y = padding + h - (h * (i / 4));
                    ctx.moveTo(padding, y);
                    ctx.lineTo(canvas.width - padding, y);
                    ctx.fillStyle = '#999';
                    ctx.fillText(`${i * 25}%`, 5, y + 4);
                }
                ctx.stroke();

                // Draw Separators (Vertical Lines)
                ctx.beginPath();
                separators.forEach(sep => {
                    ctx.moveTo(sep.x, padding);
                    ctx.lineTo(sep.x, canvas.height - padding);
                });
                ctx.strokeStyle = '#ddd';
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw Separator Handles & Time Labels
                separators.forEach(sep => {
                    // Handle
                    ctx.fillStyle = '#ccc';
                    ctx.fillRect(sep.x - 2, canvas.height - padding + 5, 4, 10);

                    // Time Label
                    ctx.fillStyle = '#666';
                    ctx.font = '11px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(sep.label, sep.x, padding - 10); // Top label
                });

                // Draw Start/End Time Labels
                ctx.fillStyle = '#666';
                ctx.font = '11px monospace';
                ctx.textAlign = 'center';
                // Start
                ctx.fillText(startTimeInput, padding, padding - 10);
                // End
                const endMins = startTotalMinutes + totalDurationMin;
                const finalEndH = Math.floor((endMins / 60) % 24);
                const finalEndM = Math.floor(endMins % 60);
                ctx.fillText(`${finalEndH.toString().padStart(2, '0')}:${finalEndM.toString().padStart(2, '0')}`, canvas.width - padding, padding - 10);


                // Draw Phase Labels
                graphData.forEach((p, i) => {
                    const x = phaseCenters[i];
                    ctx.fillStyle = '#333';
                    ctx.textAlign = 'center';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.fillText(p.name || `P${i + 1}`, x, canvas.height - 10);

                    ctx.fillStyle = '#999';
                    ctx.font = '10px Arial';
                    ctx.fillText(`${Math.round(p.duration * 100)}%`, x, canvas.height - 25);
                    ctx.font = '12px sans-serif'; // Reset font
                });

                // Helper to draw line
                const drawLine = (prop, color) => {
                    ctx.beginPath();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;
                    graphData.forEach((p, i) => {
                        const x = phaseCenters[i];
                        const y = padding + h - (p[prop] * h);
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    });
                    ctx.stroke();

                    // Draw points
                    graphData.forEach((p, i) => {
                        const x = phaseCenters[i];
                        const y = padding + h - (p[prop] * h);
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(x, y, 6, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = 'white';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    });
                };

                drawLine('energy', '#FF5722');
                drawLine('dance', '#2196F3');
                drawLine('valence', '#4CAF50');
                drawLine('tempo', '#FFC107');
            }

            // Interaction Logic
            canvas.addEventListener('mousedown', (e) => {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                const mouseX = (e.clientX - rect.left) * scaleX;
                const mouseY = (e.clientY - rect.top) * scaleY;

                const padding = 40;
                const w = canvas.width - padding * 2;
                const h = canvas.height - padding * 2;
                const numPhases = graphData.length;

                // 1. Check Separators (Resizing)
                let currentX = padding;
                for (let i = 0; i < numPhases - 1; i++) {
                    currentX += graphData[i].duration * w;
                    if (Math.abs(mouseX - currentX) < 10) { // Hit radius 10px
                        isDragging = true;
                        dragPoint = { type: 'separator', index: i }; // Index i is between Phase i and i+1
                        return;
                    }
                }

                // 2. Check Points (Values)
                currentX = padding;
                const phaseCenters = graphData.map(p => {
                    const center = currentX + (p.duration * w / 2);
                    currentX += p.duration * w;
                    return center;
                });

                const props = ['energy', 'dance', 'valence', 'tempo'];
                for (let i = 0; i < numPhases; i++) {
                    const x = phaseCenters[i];
                    for (const prop of props) {
                        const y = padding + h - (graphData[i][prop] * h);
                        const dist = Math.sqrt((mouseX - x) ** 2 + (mouseY - y) ** 2);
                        if (dist < 15) {
                            isDragging = true;
                            dragPoint = { type: 'point', phaseIndex: i, prop: prop };
                            return;
                        }
                    }
                }
            });

            canvas.addEventListener('mousemove', (e) => {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const mouseX = (e.clientX - rect.left) * scaleX;

                // Cursor hint
                const padding = 40;
                const w = canvas.width - padding * 2;
                let currentX = padding;
                let hoveringSeparator = false;
                for (let i = 0; i < graphData.length - 1; i++) {
                    currentX += graphData[i].duration * w;
                    if (Math.abs(mouseX - currentX) < 10) {
                        hoveringSeparator = true;
                        break;
                    }
                }
                canvas.style.cursor = hoveringSeparator ? 'col-resize' : 'default';

                if (!isDragging || !dragPoint) return;

                const scaleY = canvas.height / rect.height;
                const mouseY = (e.clientY - rect.top) * scaleY;
                const h = canvas.height - padding * 2;

                if (dragPoint.type === 'point') {
                    // Update Value
                    let val = 1 - ((mouseY - padding) / h);
                    val = Math.max(0, Math.min(1, val));
                    graphData[dragPoint.phaseIndex][dragPoint.prop] = val;
                } else if (dragPoint.type === 'separator') {
                    // Update Duration
                    // Dragging separator i affects phase i and i+1
                    const i = dragPoint.index;

                    // Calculate current separator X based on previous phases
                    let startX = padding;
                    for (let j = 0; j < i; j++) startX += graphData[j].duration * w;

                    // New width for phase i
                    const newWidth = mouseX - startX;
                    let newDur = newWidth / w;

                    // Constraints
                    const minDur = 0.05; // 5% minimum
                    const combinedDur = graphData[i].duration + graphData[i + 1].duration;

                    if (newDur < minDur) newDur = minDur;
                    if (newDur > combinedDur - minDur) newDur = combinedDur - minDur;

                    const delta = newDur - graphData[i].duration;
                    graphData[i].duration = newDur;
                    graphData[i + 1].duration -= delta;
                }

                drawGraph();
            });

            canvas.addEventListener('mouseup', () => {
                isDragging = false;
                dragPoint = null; // Reset drag point on mouse up
                // Re-normalize durations after a drag operation
                const totalDur = graphData.reduce((sum, p) => sum + (p.duration || 0), 0);
                if (Math.abs(totalDur - 1.0) > 0.01) {
                    graphData.forEach(p => p.duration = p.duration / totalDur);
                    drawGraph(); // Redraw to reflect normalized durations
                }
            });

            canvas.addEventListener('mouseleave', () => {
                isDragging = false;
                dragPoint = null;
            });

            function generateFlow() {
                alert(`✅ Playlist générée avec succès !\n${finalPlaylist.length} titres sélectionnés.`);
            }

            function displayResults(data) {
                const resultsContainer = document.getElementById('resultsContainer');
                const table = document.getElementById('tracksTable');
                const thead = table.querySelector('thead');
                const tbody = document.getElementById('tracksTableBody');

                // Clear existing
                thead.innerHTML = "";
                tbody.innerHTML = "";

                if (data.length === 0) return;

                // Get all headers from the first row
                const headers = Object.keys(data[0]);

                // Create Header Row
                const headerRow = document.createElement('tr');
                // Add an index column header
                const thIndex = document.createElement('th');
                thIndex.textContent = "#";
                headerRow.appendChild(thIndex);

                headers.forEach(header => {
                    const th = document.createElement('th');
                    th.textContent = header;
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);

                // Create Data Rows
                data.forEach((row, index) => {
                    const tr = document.createElement('tr');

                    // Index cell
                    const tdIndex = document.createElement('td');
                    tdIndex.textContent = index + 1;
                    tr.appendChild(tdIndex);

                    headers.forEach(header => {
                        const td = document.createElement('td');
                        let value = row[header];

                        // Formatting for specific columns
                        const lowerHeader = header.toLowerCase();

                        td.textContent = value;
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });

                resultsContainer.style.display = 'block';

                // Setup Re-export
                document.getElementById('exportBtn').onclick = () => {
                    const csv = Papa.unparse(data);
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.setAttribute("href", url);
                    link.setAttribute("download", "playlist_sorted.csv");
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                };
            }
