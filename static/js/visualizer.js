/**
 * Waymo Motion Dataset Visualizer
 * Canvas 기반 시각화 및 사용자 인터랙션 처리
 */

const COLORS = {
    sdc: '#00FF00',
    vehicles: '#4A90D9',
    pedestrians: '#FF9500',
    cyclists: '#AF52DE',
    lanes: '#8E8E93',
    road_lines: '#00BFFF',  // 밝은 파랑색 (Deep Sky Blue)
    road_edges: '#FFCC00',
    crosswalks: '#5AC8FA',
    stop_signs: '#FF3B30',
    speed_bumps: '#FF6B6B',
    driveways: '#9B59B6',
    tracks_to_predict: '#FF00FF',  // 예측 대상 하이라이트
    objects_of_interest: '#00FFFF',  // 관심 객체 하이라이트
    traffic_lights: {
        STOP: '#FF3B30',
        CAUTION: '#FFCC00',
        GO: '#34C759',
        UNKNOWN: '#8E8E93',
        ARROW_STOP: '#FF3B30',
        ARROW_CAUTION: '#FFCC00',
        ARROW_GO: '#34C759',
        FLASHING_STOP: '#FF6B6B',
        FLASHING_CAUTION: '#FFE066'
    }
};

// 난이도 레벨 매핑
const DIFFICULTY_LEVELS = {
    0: 'NONE',
    1: 'LEVEL_1',
    2: 'LEVEL_2'
};

// ===== 타입 매핑 (정수 → 문자열) =====
const LANE_TYPES = {
    0: 'UNDEFINED',
    1: 'FREEWAY',
    2: 'SURFACE_STREET',
    3: 'BIKE_LANE'
};

const ROAD_LINE_TYPES = {
    0: 'UNKNOWN',
    1: 'BROKEN_SINGLE_WHITE',
    2: 'SOLID_SINGLE_WHITE',
    3: 'SOLID_DOUBLE_WHITE',
    4: 'BROKEN_SINGLE_YELLOW',
    5: 'BROKEN_DOUBLE_YELLOW',
    6: 'SOLID_SINGLE_YELLOW',
    7: 'SOLID_DOUBLE_YELLOW',
    8: 'PASSING_DOUBLE_YELLOW'
};

const ROAD_EDGE_TYPES = {
    0: 'UNKNOWN',
    1: 'ROAD_EDGE_BOUNDARY',
    2: 'ROAD_EDGE_MEDIAN'
};

// ===== 전역 상태 =====
let scenarioData = null;
let currentStep = 0;
let maxStep = 90;
let isPlaying = false;
let playbackInterval = null;
let playbackSpeed = 1;
let playbackMode = 'loop'; // 'once', 'loop', 'continuous'

// 시나리오 인덱스 추적
let currentScenarioIndex = 0;
let totalScenarios = 0;

// 뷰포트 상태
let viewState = {
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0
};

let layerVisibility = {
    sdc: true,
    vehicles: true,
    pedestrians: true,
    cyclists: true,
    lanes: true,
    road_lines: true,
    road_edges: true,
    crosswalks: true,
    stop_signs: true,
    speed_bumps: true,
    driveways: true,
    traffic_lights: true,
    trajectories: true,
    tracks_to_predict: true,
    objects_of_interest: true
};

// ===== DOM 요소 =====
let canvas, ctx;
let datasetSelect, fileSelect, btnLoad, scenarioSelect;
let timelineSlider, stepDisplay, timeDisplay, timeType;
let loadingOverlay;
let objectInfoPopup, popupTitle, popupContent, popupClose;

// 검색 관련 DOM
let searchInput, searchResults;
let searchTimeout = null;

// 선택/호버된 객체
let selectedObject = null;
let hoveredObject = null;

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
    initializeDOM();
    initializeCanvas();
    initializeEventListeners();
    initializeSearch();
    loadDatasetList();
});

function initializeDOM() {
    canvas = document.getElementById('main-canvas');
    ctx = canvas.getContext('2d');
    datasetSelect = document.getElementById('dataset-select');
    fileSelect = document.getElementById('file-select');
    btnLoad = document.getElementById('btn-load');
    scenarioSelect = document.getElementById('scenario-select');
    timelineSlider = document.getElementById('timeline-slider');
    stepDisplay = document.getElementById('step-display');
    timeDisplay = document.getElementById('time-display');
    timeType = document.getElementById('time-type');
    loadingOverlay = document.getElementById('loading-overlay');
}

function initializeCanvas() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    // getBoundingClientRect로 정확한 display 크기 가져오기
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    render();
}

function initializeEventListeners() {
    // 데이터셋/파일 선택
    datasetSelect.addEventListener('change', onDatasetChange);
    fileSelect.addEventListener('change', onFileChange);
    btnLoad.addEventListener('click', onLoadClick);
    scenarioSelect.addEventListener('change', onScenarioChange);

    // 타임라인 슬라이더
    timelineSlider.addEventListener('input', onTimelineChange);

    // 재생 컨트롤 - 시나리오 네비게이션 포함
    document.getElementById('btn-first').addEventListener('click', onBtnFirstClick);
    document.getElementById('btn-prev').addEventListener('click', () => setStep(currentStep - 1));
    document.getElementById('btn-play').addEventListener('click', togglePlayback);
    document.getElementById('btn-next').addEventListener('click', () => setStep(currentStep + 1));
    document.getElementById('btn-last').addEventListener('click', onBtnLastClick);

    // 재생 속도
    document.getElementById('playback-speed').addEventListener('change', (e) => {
        playbackSpeed = parseFloat(e.target.value);
        if (isPlaying) {
            stopPlayback();
            startPlayback();
        }
    });

    // 재생 모드
    document.getElementById('playback-mode').addEventListener('change', (e) => {
        playbackMode = e.target.value;
    });

    // 레이어 체크박스
    document.querySelectorAll('.layer-checkbox input').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const layer = e.target.dataset.layer;
            layerVisibility[layer] = e.target.checked;
            render();
        });
    });

    // 캔버스 마우스 이벤트
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('wheel', onMouseWheel);
    canvas.addEventListener('click', onCanvasClick);

    // 팝업 초기화
    objectInfoPopup = document.getElementById('object-info-popup');
    popupTitle = document.getElementById('popup-title');
    popupContent = document.getElementById('popup-content');
    popupClose = document.getElementById('popup-close');
    popupClose.addEventListener('click', hideObjectInfo);
}

// ===== 데이터셋 API 호출 =====
async function loadDatasetList() {
    try {
        const response = await fetch('/api/datasets');
        const result = await response.json();

        if (result.success) {
            populateDatasetSelect(result.datasets);
        } else {
            console.error('데이터셋 목록 로드 실패:', result.error);
        }
    } catch (error) {
        console.error('API 호출 오류:', error);
    }
}

function populateDatasetSelect(datasets) {
    datasetSelect.innerHTML = '<option value="">폴더 선택...</option>';
    datasets.forEach(dataset => {
        const option = document.createElement('option');
        option.value = dataset.name;
        option.textContent = `${dataset.name} (${dataset.file_count} files)`;
        datasetSelect.appendChild(option);
    });
}

// 파일 목록 페이지네이션 상태
let currentFileListFolder = '';
let currentFileListOffset = 0;

async function loadFileList(folderName, offset = 0, append = false) {
    try {
        currentFileListFolder = folderName;
        const response = await fetch(`/api/dataset/${folderName}/files?offset=${offset}`);
        const result = await response.json();

        if (result.success) {
            populateFileSelect(result.files, result.total_count, result.has_more, offset, append);
            currentFileListOffset = offset + result.files.length;
        } else {
            console.error('파일 목록 로드 실패:', result.error);
        }
    } catch (error) {
        console.error('API 호출 오류:', error);
    }
}

function populateFileSelect(files, totalCount, hasMore, offset, append = false) {
    if (!append) {
        fileSelect.innerHTML = '<option value="">파일 선택...</option>';
    } else {
        // 기존 "더보기" 옵션 제거
        const loadMoreOption = fileSelect.querySelector('option[value="__load_more__"]');
        if (loadMoreOption) loadMoreOption.remove();
    }

    const startIndex = offset;
    files.forEach((file, index) => {
        const option = document.createElement('option');
        option.value = file.path;
        option.textContent = `${startIndex + index + 1}. ${file.name} (${file.size_mb}MB)`;
        fileSelect.appendChild(option);
    });

    if (hasMore) {
        const option = document.createElement('option');
        option.value = '__load_more__';
        option.textContent = `📁 더 보기 (+${totalCount - offset - files.length} more files)`;
        option.style.color = '#00d9ff';
        fileSelect.appendChild(option);
    }

    fileSelect.disabled = false;
}

async function loadTFRecord(filePath) {
    showLoading(true);

    try {
        const response = await fetch('/api/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
        });
        const result = await response.json();

        if (result.success) {
            populateScenarioSelect(result.scenarios);
            scenarioSelect.disabled = false;

            // 첫 번째 시나리오 자동 로드
            if (result.scenarios.length > 0) {
                scenarioSelect.value = 0;
                loadScenario(0);
            }
        } else {
            console.error('TFRecord 로드 실패:', result.error);
            alert('TFRecord 로드 실패: ' + result.error);
        }
    } catch (error) {
        console.error('API 호출 오류:', error);
    } finally {
        showLoading(false);
    }
}

function populateScenarioSelect(scenarios) {
    scenarioSelect.innerHTML = '';
    totalScenarios = scenarios.length;
    scenarios.forEach((scenario, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${index + 1}. ${scenario.scenario_id.substring(0, 12)}... (${scenario.num_tracks} tracks, ${scenario.num_timesteps} steps)`;
        scenarioSelect.appendChild(option);
    });
}

async function loadScenario(index) {
    showLoading(true);

    try {
        const response = await fetch(`/api/scenario/${index}`);
        const result = await response.json();

        if (result.success) {
            scenarioData = result.data;
            maxStep = scenarioData.timestamps.length - 1;
            timelineSlider.max = maxStep;
            currentScenarioIndex = index;

            // 뷰포트 초기화
            resetViewport();

            // 0초부터 시작
            setStep(0);

            document.getElementById('scenario-info').textContent =
                `(${scenarioData.tracks.vehicles.length} vehicles, ${scenarioData.tracks.pedestrians.length} peds)`;
        } else {
            console.error('시나리오 로드 실패:', result.error);
        }
    } catch (error) {
        console.error('API 호출 오류:', error);
    } finally {
        showLoading(false);
    }
}

// ===== 이벤트 핸들러 =====
function onDatasetChange(e) {
    const folderName = e.target.value;

    // 리셋
    fileSelect.innerHTML = '<option value="">파일 선택...</option>';
    fileSelect.disabled = true;
    btnLoad.disabled = true;
    scenarioSelect.innerHTML = '<option value="">시나리오 선택...</option>';
    scenarioSelect.disabled = true;
    scenarioData = null;
    render();

    if (folderName) {
        loadFileList(folderName);
    }
}

function onFileChange(e) {
    btnLoad.disabled = !e.target.value;
}

function onLoadClick() {
    const filePath = fileSelect.value;
    if (filePath) {
        loadTFRecord(filePath);
    }
}

function onScenarioChange(e) {
    const index = parseInt(e.target.value);
    loadScenario(index);
}

function onTimelineChange(e) {
    setStep(parseInt(e.target.value));
}

function setStep(step) {
    currentStep = Math.max(0, Math.min(step, maxStep));
    timelineSlider.value = currentStep;
    updateTimeDisplay();
    render();
}

function updateTimeDisplay() {
    if (!scenarioData) return;

    const time = scenarioData.timestamps[currentStep];
    const currentTimeIndex = scenarioData.current_time_index;

    stepDisplay.textContent = `Step: ${currentStep} / ${maxStep}`;
    timeDisplay.textContent = `Time: ${time.toFixed(1)}s`;

    if (currentStep < currentTimeIndex) {
        timeType.textContent = 'PAST';
        timeType.className = 'past';
    } else if (currentStep === currentTimeIndex) {
        timeType.textContent = 'CURRENT';
        timeType.className = 'current';
    } else {
        timeType.textContent = 'FUTURE';
        timeType.className = 'future';
    }
}

function togglePlayback() {
    if (isPlaying) {
        stopPlayback();
    } else {
        startPlayback();
    }
}

function startPlayback() {
    isPlaying = true;
    document.getElementById('btn-play').textContent = '⏸';

    const intervalMs = 100 / playbackSpeed;
    playbackInterval = setInterval(() => {
        if (currentStep >= maxStep) {
            // 모드별 동작
            if (playbackMode === 'once') {
                // 1번만 재생: 멈춤
                stopPlayback();
            } else if (playbackMode === 'loop') {
                // 반복 재생: 처음으로
                setStep(0);
            } else if (playbackMode === 'continuous') {
                // 연속 재생: 다음 시나리오
                stopPlayback();
                loadNextScenario(true); // autoPlay = true
            }
        } else {
            setStep(currentStep + 1);
        }
    }, intervalMs);
}

function stopPlayback() {
    isPlaying = false;
    document.getElementById('btn-play').textContent = '▶';

    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
}

// ===== 시나리오 네비게이션 =====
function onBtnFirstClick() {
    // 0초 + 일시정지 상태에서 누르면 이전 시나리오
    if (currentStep === 0 && !isPlaying) {
        loadPreviousScenario();
    } else {
        setStep(0);
    }
}

function onBtnLastClick() {
    // 1번만 재생 모드 + 마지막 스텝 + 일시정지면 다음 시나리오
    if (playbackMode === 'once' && currentStep >= maxStep && !isPlaying) {
        loadNextScenario(false);
    } else {
        setStep(maxStep);
    }
}

async function loadNextScenario(autoPlay = false) {
    if (currentScenarioIndex >= totalScenarios - 1) {
        alert('마지막 시나리오입니다.');
        return;
    }

    const nextIndex = currentScenarioIndex + 1;
    scenarioSelect.value = nextIndex;
    await loadScenarioInternal(nextIndex, autoPlay);
}

async function loadPreviousScenario() {
    if (currentScenarioIndex <= 0) {
        alert('첫 시나리오입니다.');
        return;
    }

    const prevIndex = currentScenarioIndex - 1;
    scenarioSelect.value = prevIndex;
    await loadScenarioInternal(prevIndex, false);
}

async function loadScenarioInternal(index, autoPlay = false) {
    showLoading(true);

    try {
        const response = await fetch(`/api/scenario/${index}`);
        const result = await response.json();

        if (result.success) {
            scenarioData = result.data;
            maxStep = scenarioData.timestamps.length - 1;
            timelineSlider.max = maxStep;
            currentScenarioIndex = index;

            resetViewport();
            setStep(0);

            document.getElementById('scenario-info').textContent =
                `(${scenarioData.tracks.vehicles.length} vehicles, ${scenarioData.tracks.pedestrians.length} peds)`;

            if (autoPlay) {
                startPlayback();
            }
        } else {
            console.error('시나리오 로드 실패:', result.error);
        }
    } catch (error) {
        console.error('API 호출 오류:', error);
    } finally {
        showLoading(false);
    }
}

// ===== 마우스 이벤트 =====
function onMouseDown(e) {
    viewState.isDragging = true;
    viewState.lastMouseX = e.clientX;
    viewState.lastMouseY = e.clientY;
}

function onMouseMove(e) {
    // 마우스 위치 표시
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // 월드 좌표로 변환 (display 크기 기준)
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (canvasX - centerX - viewState.offsetX) / viewState.scale;
    const worldY = -(canvasY - centerY - viewState.offsetY) / viewState.scale;

    document.getElementById('mouse-position').textContent =
        `X: ${worldX.toFixed(1)}, Y: ${worldY.toFixed(1)}`;

    // 드래그
    if (viewState.isDragging) {
        const deltaX = e.clientX - viewState.lastMouseX;
        const deltaY = e.clientY - viewState.lastMouseY;

        viewState.offsetX += deltaX;
        viewState.offsetY += deltaY;

        viewState.lastMouseX = e.clientX;
        viewState.lastMouseY = e.clientY;

        render();
    } else if (scenarioData) {
        // 호버 감지 (드래그 중이 아닐 때만)
        const newHoveredObject = findObjectAtPosition(worldX, worldY);
        if (newHoveredObject !== hoveredObject) {
            hoveredObject = newHoveredObject;
            render();
        }
    }
}

function onMouseUp() {
    viewState.isDragging = false;
}

function onMouseWheel(e) {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 현재 마우스가 가리키는 월드 좌표 (줌 전, display 크기 기준)
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (mouseX - centerX - viewState.offsetX) / viewState.scale;
    const worldY = -(mouseY - centerY - viewState.offsetY) / viewState.scale;

    // 줌 적용
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const oldScale = viewState.scale;
    viewState.scale *= zoomFactor;
    viewState.scale = Math.max(0.1, Math.min(viewState.scale, 10));
    const newScale = viewState.scale;

    // 줌 후 동일한 월드 좌표가 마우스 위치에 오도록 offset 조정
    viewState.offsetX = mouseX - centerX - worldX * newScale;
    viewState.offsetY = mouseY - centerY + worldY * newScale;

    document.getElementById('zoom-level').textContent =
        `Zoom: ${Math.round(viewState.scale * 100)}%`;
    updateScaleBar();

    render();
}

function updateScaleBar() {
    // 화면에서 50px이 실제로 몇 미터인지 계산
    const pixelsForBar = 50;
    const metersForBar = pixelsForBar / viewState.scale;

    // 보기 좋은 단위로 반올림 (1, 2, 5, 10, 20, 50, 100...)
    const niceValues = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    let niceValue = niceValues[0];
    for (const v of niceValues) {
        if (v <= metersForBar * 1.5) niceValue = v;
        else break;
    }

    // 해당 거리에 맞게 바 너비 조정
    const barWidth = niceValue * viewState.scale;
    document.querySelector('.scale-bar-line').style.width = `${barWidth}px`;

    // 단위 표시
    let label;
    if (niceValue >= 1000) {
        label = `${niceValue / 1000} km`;
    } else {
        label = `${niceValue} m`;
    }
    document.getElementById('scale-value').textContent = label;
}

function resetViewport() {
    if (!scenarioData || !scenarioData.tracks.sdc) return;

    // SDC 위치로 중심 이동
    const sdcState = scenarioData.tracks.sdc.states[currentStep];
    if (sdcState && sdcState.valid) {
        viewState.scale = 3;
        viewState.offsetX = -sdcState.x * viewState.scale;
        viewState.offsetY = sdcState.y * viewState.scale;
    }

    document.getElementById('zoom-level').textContent =
        `Zoom: ${Math.round(viewState.scale * 100)}%`;
    updateScaleBar();
}

// ===== 렌더링 =====
function render() {
    if (!ctx) return;

    // 배경 초기화
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!scenarioData) {
        // 안내 메시지 표시
        ctx.fillStyle = '#8892b0';
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Dataset와 File을 선택한 후 Load 버튼을 클릭하세요', canvas.width / 2, canvas.height / 2);
        return;
    }

    // 좌표 변환 설정
    ctx.save();
    ctx.translate(canvas.width / 2 + viewState.offsetX, canvas.height / 2 + viewState.offsetY);
    ctx.scale(viewState.scale, -viewState.scale);

    // 레이어 순서대로 그리기
    if (layerVisibility.lanes) drawLanes();
    if (layerVisibility.road_lines) drawRoadLines();
    if (layerVisibility.road_edges) drawRoadEdges();
    if (layerVisibility.crosswalks) drawCrosswalks();
    if (layerVisibility.speed_bumps) drawSpeedBumps();
    if (layerVisibility.driveways) drawDriveways();
    if (layerVisibility.stop_signs) drawStopSigns();
    if (layerVisibility.traffic_lights) drawTrafficLights();

    // 궤적 그리기 (에이전트 뒤에 그려야 보임)
    if (layerVisibility.trajectories) {
        drawTrajectories();
    }

    if (layerVisibility.vehicles) drawAgents('vehicles');
    if (layerVisibility.pedestrians) drawAgents('pedestrians');
    if (layerVisibility.cyclists) drawAgents('cyclists');
    if (layerVisibility.sdc) drawSDC();

    // 예측 대상 및 관심 객체 하이라이트
    if (layerVisibility.tracks_to_predict) drawTracksToPredict();
    if (layerVisibility.objects_of_interest) drawObjectsOfInterest();

    // 선택된 객체 강조 표시
    drawSelectedHighlight();

    ctx.restore();
}

function drawLanes() {
    ctx.strokeStyle = COLORS.lanes;
    ctx.lineWidth = 0.3 / viewState.scale;
    ctx.globalAlpha = 0.5;

    scenarioData.map_features.lanes.forEach(lane => {
        if (lane.polyline.length > 1) {
            ctx.beginPath();
            ctx.moveTo(lane.polyline[0][0], lane.polyline[0][1]);
            lane.polyline.slice(1).forEach(pt => {
                ctx.lineTo(pt[0], pt[1]);
            });
            ctx.stroke();
        }
    });

    ctx.globalAlpha = 1;
}

function drawRoadLines() {
    ctx.lineWidth = 0.2 / viewState.scale;
    ctx.globalAlpha = 0.8;

    scenarioData.map_features.road_lines.forEach(line => {
        if (line.polyline.length > 1) {
            // 타입별 색상 및 스타일 설정
            const type = line.type || 0;
            let color = COLORS.road_lines;
            let dashPattern = [];

            switch (type) {
                case 1: // BROKEN_SINGLE_WHITE
                    color = '#FFFFFF';
                    dashPattern = [1, 0.5];
                    break;
                case 2: // SOLID_SINGLE_WHITE
                    color = '#FFFFFF';
                    break;
                case 3: // SOLID_DOUBLE_WHITE
                    color = '#FFFFFF';
                    ctx.lineWidth = 0.4 / viewState.scale;
                    break;
                case 4: // BROKEN_SINGLE_YELLOW
                    color = '#FFCC00';
                    dashPattern = [1, 0.5];
                    break;
                case 5: // BROKEN_DOUBLE_YELLOW
                    color = '#FFCC00';
                    dashPattern = [1, 0.5];
                    ctx.lineWidth = 0.4 / viewState.scale;
                    break;
                case 6: // SOLID_SINGLE_YELLOW
                    color = '#FFCC00';
                    break;
                case 7: // SOLID_DOUBLE_YELLOW
                    color = '#FFCC00';
                    ctx.lineWidth = 0.4 / viewState.scale;
                    break;
                case 8: // PASSING_DOUBLE_YELLOW
                    color = '#FFCC00';
                    ctx.lineWidth = 0.4 / viewState.scale;
                    break;
                default:
                    color = COLORS.road_lines;
            }

            ctx.strokeStyle = color;
            ctx.setLineDash(dashPattern);

            ctx.beginPath();
            ctx.moveTo(line.polyline[0][0], line.polyline[0][1]);
            line.polyline.slice(1).forEach(pt => {
                ctx.lineTo(pt[0], pt[1]);
            });
            ctx.stroke();

            // 선 두께와 dash 패턴 리셋
            ctx.lineWidth = 0.2 / viewState.scale;
            ctx.setLineDash([]);
        }
    });

    ctx.globalAlpha = 1;
}

function drawRoadEdges() {
    ctx.strokeStyle = COLORS.road_edges;
    ctx.lineWidth = 0.3 / viewState.scale;
    ctx.globalAlpha = 0.6;

    scenarioData.map_features.road_edges.forEach(edge => {
        if (edge.polyline.length > 1) {
            ctx.beginPath();
            ctx.moveTo(edge.polyline[0][0], edge.polyline[0][1]);
            edge.polyline.slice(1).forEach(pt => {
                ctx.lineTo(pt[0], pt[1]);
            });
            ctx.stroke();
        }
    });

    ctx.globalAlpha = 1;
}

function drawCrosswalks() {
    ctx.fillStyle = COLORS.crosswalks;
    ctx.globalAlpha = 0.3;

    scenarioData.map_features.crosswalks.forEach(cw => {
        if (cw.polygon.length > 2) {
            ctx.beginPath();
            ctx.moveTo(cw.polygon[0][0], cw.polygon[0][1]);
            cw.polygon.slice(1).forEach(pt => {
                ctx.lineTo(pt[0], pt[1]);
            });
            ctx.closePath();
            ctx.fill();
        }
    });

    ctx.globalAlpha = 1;
}

function drawStopSigns() {
    ctx.fillStyle = COLORS.stop_signs;

    scenarioData.map_features.stop_signs.forEach(sign => {
        ctx.beginPath();
        ctx.arc(sign.position[0], sign.position[1], 1, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawTrafficLights() {
    if (!scenarioData.traffic_lights || currentStep >= scenarioData.traffic_lights.length) return;

    const lights = scenarioData.traffic_lights[currentStep];

    lights.forEach(light => {
        if (light.stop_point) {
            const color = COLORS.traffic_lights[light.state_name] || COLORS.traffic_lights.UNKNOWN;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(light.stop_point[0], light.stop_point[1], 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function drawSpeedBumps() {
    if (!scenarioData.map_features.speed_bumps) return;

    ctx.fillStyle = COLORS.speed_bumps;
    ctx.globalAlpha = 0.5;

    scenarioData.map_features.speed_bumps.forEach(bump => {
        if (bump.polygon && bump.polygon.length > 2) {
            ctx.beginPath();
            ctx.moveTo(bump.polygon[0][0], bump.polygon[0][1]);
            bump.polygon.slice(1).forEach(pt => {
                ctx.lineTo(pt[0], pt[1]);
            });
            ctx.closePath();
            ctx.fill();
        }
    });

    ctx.globalAlpha = 1;
}

function drawDriveways() {
    if (!scenarioData.map_features.driveways) return;

    ctx.fillStyle = COLORS.driveways;
    ctx.globalAlpha = 0.4;

    scenarioData.map_features.driveways.forEach(driveway => {
        if (driveway.polygon && driveway.polygon.length > 2) {
            ctx.beginPath();
            ctx.moveTo(driveway.polygon[0][0], driveway.polygon[0][1]);
            driveway.polygon.slice(1).forEach(pt => {
                ctx.lineTo(pt[0], pt[1]);
            });
            ctx.closePath();
            ctx.fill();
        }
    });

    ctx.globalAlpha = 1;
}

function drawTracksToPredict() {
    if (!scenarioData.tracks_to_predict || scenarioData.tracks_to_predict.length === 0) return;

    scenarioData.tracks_to_predict.forEach(pred => {
        const trackIndex = pred.track_index;
        const difficulty = pred.difficulty;

        // 해당 트랙 찾기
        let track = null;
        let allTracks = [
            ...(scenarioData.tracks.vehicles || []),
            ...(scenarioData.tracks.pedestrians || []),
            ...(scenarioData.tracks.cyclists || [])
        ];

        // SDC도 포함
        if (scenarioData.tracks.sdc) {
            allTracks.push(scenarioData.tracks.sdc);
        }

        // 트랙 인덱스로 찾기 (원본 시나리오의 tracks 배열 인덱스 기준)
        // 모든 트랙을 순회하면서 해당 인덱스의 트랙 찾기
        for (const t of allTracks) {
            if (t.id === trackIndex || allTracks.indexOf(t) === trackIndex) {
                track = t;
                break;
            }
        }

        if (!track) return;

        const state = track.states[currentStep];
        if (!state || !state.valid) return;

        // 난이도에 따른 색상
        let color = COLORS.tracks_to_predict;
        if (difficulty === 2) {
            color = '#FF0000';  // LEVEL_2: 빨강
        } else if (difficulty === 1) {
            color = '#FF00FF';  // LEVEL_1: 마젠타
        }

        // 다이아몬드 마커 그리기
        ctx.save();
        ctx.translate(state.x, state.y);

        const size = 2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.4 / viewState.scale;
        ctx.beginPath();
        ctx.moveTo(0, size);
        ctx.lineTo(size, 0);
        ctx.lineTo(0, -size);
        ctx.lineTo(-size, 0);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    });
}

function drawObjectsOfInterest() {
    if (!scenarioData.objects_of_interest || scenarioData.objects_of_interest.length === 0) return;

    scenarioData.objects_of_interest.forEach(trackIndex => {
        // 해당 트랙 찾기
        let track = null;
        let allTracks = [
            ...(scenarioData.tracks.vehicles || []),
            ...(scenarioData.tracks.pedestrians || []),
            ...(scenarioData.tracks.cyclists || [])
        ];

        if (scenarioData.tracks.sdc) {
            allTracks.push(scenarioData.tracks.sdc);
        }

        for (const t of allTracks) {
            if (t.id === trackIndex) {
                track = t;
                break;
            }
        }

        if (!track) return;

        const state = track.states[currentStep];
        if (!state || !state.valid) return;

        // 원형 하이라이트 그리기
        ctx.strokeStyle = COLORS.objects_of_interest;
        ctx.lineWidth = 0.3 / viewState.scale;
        ctx.setLineDash([0.5, 0.3]);

        const radius = Math.max(state.length || 4, state.width || 2) / 2 + 1.5;
        ctx.beginPath();
        ctx.arc(state.x, state.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([]);
    });
}

function drawAgents(type) {
    const agents = scenarioData.tracks[type];
    const color = COLORS[type];

    agents.forEach(agent => {
        const state = agent.states[currentStep];
        if (!state || !state.valid) return;

        drawVehicleBox(state.x, state.y, state.length, state.width, state.heading, color);
    });
}

function drawSDC() {
    const sdc = scenarioData.tracks.sdc;
    if (!sdc) return;

    const state = sdc.states[currentStep];
    if (!state || !state.valid) return;

    drawVehicleBox(state.x, state.y, state.length, state.width, state.heading, COLORS.sdc, true);

    // 방향 화살표
    ctx.save();
    ctx.translate(state.x, state.y);
    ctx.rotate(state.heading);

    ctx.fillStyle = COLORS.sdc;
    ctx.beginPath();
    ctx.moveTo(state.length / 2 + 1, 0);
    ctx.lineTo(state.length / 2 - 0.5, 0.8);
    ctx.lineTo(state.length / 2 - 0.5, -0.8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

// ===== 궤적 그리기 =====
function drawTrajectories() {
    // SDC 궤적
    if (layerVisibility.sdc && scenarioData.tracks.sdc) {
        drawAgentTrajectory(scenarioData.tracks.sdc, COLORS.sdc);
    }

    // 차량 궤적
    if (layerVisibility.vehicles) {
        scenarioData.tracks.vehicles.forEach(agent => {
            drawAgentTrajectory(agent, COLORS.vehicles);
        });
    }

    // 보행자 궤적
    if (layerVisibility.pedestrians) {
        scenarioData.tracks.pedestrians.forEach(agent => {
            drawAgentTrajectory(agent, COLORS.pedestrians);
        });
    }

    // 자전거 궤적
    if (layerVisibility.cyclists) {
        scenarioData.tracks.cyclists.forEach(agent => {
            drawAgentTrajectory(agent, COLORS.cyclists);
        });
    }
}

function drawAgentTrajectory(agent, color) {
    const states = agent.states;
    if (!states || states.length === 0) return;

    // 현재 위치가 유효하지 않으면 스킵
    const currentState = states[currentStep];
    if (!currentState || !currentState.valid) return;

    // 미래 궤적 그리기 (현재 스텝부터 끝까지)
    ctx.strokeStyle = brightenColor(color, 1.3);  // 밝은 색상 사용
    ctx.lineWidth = 0.6 / viewState.scale;  // 두께 증가
    ctx.globalAlpha = 0.8;  // 투명도 증가
    ctx.setLineDash([0.8, 0.4]);  // 점선 패턴 조정

    ctx.beginPath();
    let started = false;

    for (let i = currentStep; i < states.length; i++) {
        const state = states[i];
        if (state && state.valid) {
            if (!started) {
                ctx.moveTo(state.x, state.y);
                started = true;
            } else {
                ctx.lineTo(state.x, state.y);
            }
        }
    }

    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
}

// 색상을 밝게 만드는 유틸리티 함수
function brightenColor(hex, factor) {
    // hex를 RGB로 변환
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);

    // 밝기 증가
    r = Math.min(255, Math.floor(r * factor));
    g = Math.min(255, Math.floor(g * factor));
    b = Math.min(255, Math.floor(b * factor));

    return `rgb(${r}, ${g}, ${b})`;
}

// 호버된 객체 강조 표시
function drawSelectedHighlight() {
    const objectToHighlight = hoveredObject || selectedObject;
    if (!objectToHighlight) return;

    ctx.strokeStyle = '#FF0000';  // 붉은색 테두리
    ctx.lineWidth = 0.5 / viewState.scale;
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    if (objectToHighlight.isMapFeature) {
        // Map Feature 강조 (polyline 또는 polygon)
        const feature = objectToHighlight.feature;

        if (feature.polyline && feature.polyline.length > 1) {
            ctx.lineWidth = 0.8 / viewState.scale;
            ctx.beginPath();
            ctx.moveTo(feature.polyline[0][0], feature.polyline[0][1]);
            feature.polyline.slice(1).forEach(pt => {
                ctx.lineTo(pt[0], pt[1]);
            });
            ctx.stroke();
        } else if (feature.polygon && feature.polygon.length > 2) {
            ctx.lineWidth = 0.8 / viewState.scale;
            ctx.beginPath();
            ctx.moveTo(feature.polygon[0][0], feature.polygon[0][1]);
            feature.polygon.slice(1).forEach(pt => {
                ctx.lineTo(pt[0], pt[1]);
            });
            ctx.closePath();
            ctx.stroke();
        } else if (feature.position) {
            // Stop sign 등 점 위치
            ctx.beginPath();
            ctx.arc(feature.position[0], feature.position[1], 2.5, 0, Math.PI * 2);
            ctx.stroke();
        }
    } else {
        // Agent 강조 (bounding box)
        const state = objectToHighlight.state;
        if (!state || !state.valid) return;

        ctx.save();
        ctx.translate(state.x, state.y);
        ctx.rotate(state.heading);

        const length = state.length || 4;
        const width = state.width || 2;

        ctx.strokeRect(-length / 2 - 0.3, -width / 2 - 0.3, length + 0.6, width + 0.6);

        ctx.restore();
    }
}

function drawVehicleBox(x, y, length, width, heading, color, isSDC = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);

    ctx.fillStyle = color;
    ctx.globalAlpha = isSDC ? 0.9 : 0.7;
    ctx.fillRect(-length / 2, -width / 2, length, width);

    ctx.strokeStyle = isSDC ? '#FFFFFF' : color;
    ctx.lineWidth = isSDC ? 0.3 / viewState.scale : 0.1 / viewState.scale;
    ctx.globalAlpha = 1;
    ctx.strokeRect(-length / 2, -width / 2, length, width);

    ctx.restore();
}

// ===== 유틸리티 =====
function showLoading(show) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

// ===== 객체 클릭 및 정보 표시 =====
function onCanvasClick(e) {
    if (viewState.isDragging) return;
    if (!scenarioData) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 월드 좌표로 변환 (display 크기 기준)
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (mouseX - centerX - viewState.offsetX) / viewState.scale;
    const worldY = -(mouseY - centerY - viewState.offsetY) / viewState.scale;

    // 클릭한 위치의 객체 찾기
    const clickedObject = findObjectAtPosition(worldX, worldY);

    if (clickedObject) {
        selectedObject = clickedObject;
        showObjectInfo(clickedObject);
    } else {
        hideObjectInfo();
    }
}

function findObjectAtPosition(worldX, worldY) {
    // SDC 체크
    if (scenarioData.tracks.sdc && layerVisibility.sdc) {
        const state = scenarioData.tracks.sdc.states[currentStep];
        if (state && state.valid && isPointInVehicle(worldX, worldY, state)) {
            return {
                type: 'SDC',
                typeKo: '자율주행차',
                color: '#00FF00',
                id: scenarioData.tracks.sdc.id,
                state: state
            };
        }
    }

    // 일반 차량 체크
    if (layerVisibility.vehicles) {
        for (const vehicle of scenarioData.tracks.vehicles) {
            const state = vehicle.states[currentStep];
            if (state && state.valid && isPointInVehicle(worldX, worldY, state)) {
                return {
                    type: 'Vehicle',
                    typeKo: '차량',
                    color: '#4A90D9',
                    id: vehicle.id,
                    state: state
                };
            }
        }
    }

    // 보행자 체크
    if (layerVisibility.pedestrians) {
        for (const ped of scenarioData.tracks.pedestrians) {
            const state = ped.states[currentStep];
            if (state && state.valid && isPointInVehicle(worldX, worldY, state)) {
                return {
                    type: 'Pedestrian',
                    typeKo: '보행자',
                    color: '#FF9500',
                    id: ped.id,
                    state: state
                };
            }
        }
    }

    // 자전거 체크
    if (layerVisibility.cyclists) {
        for (const cyclist of scenarioData.tracks.cyclists) {
            const state = cyclist.states[currentStep];
            if (state && state.valid && isPointInVehicle(worldX, worldY, state)) {
                return {
                    type: 'Cyclist',
                    typeKo: '자전거',
                    color: '#AF52DE',
                    id: cyclist.id,
                    state: state
                };
            }
        }
    }

    // MAP 객체 체크 (클릭 허용 범위)
    const clickRadius = 2.0 / viewState.scale; // 줌 레벨에 따라 조정

    // Road Lines 체크
    if (layerVisibility.road_lines && scenarioData.map_features.road_lines) {
        for (const line of scenarioData.map_features.road_lines) {
            if (isPointNearPolyline(worldX, worldY, line.polyline, clickRadius)) {
                return {
                    type: 'RoadLine',
                    typeKo: '도로 라인',
                    color: COLORS.road_lines,
                    isMapFeature: true,
                    feature: line
                };
            }
        }
    }

    // Lanes 체크
    if (layerVisibility.lanes && scenarioData.map_features.lanes) {
        for (const lane of scenarioData.map_features.lanes) {
            if (isPointNearPolyline(worldX, worldY, lane.polyline, clickRadius)) {
                return {
                    type: 'Lane',
                    typeKo: '차로',
                    color: COLORS.lanes,
                    isMapFeature: true,
                    feature: lane
                };
            }
        }
    }

    // Road Edges 체크
    if (layerVisibility.road_edges && scenarioData.map_features.road_edges) {
        for (const edge of scenarioData.map_features.road_edges) {
            if (isPointNearPolyline(worldX, worldY, edge.polyline, clickRadius)) {
                return {
                    type: 'RoadEdge',
                    typeKo: '도로 경계',
                    color: COLORS.road_edges,
                    isMapFeature: true,
                    feature: edge
                };
            }
        }
    }

    // Crosswalks 체크
    if (layerVisibility.crosswalks && scenarioData.map_features.crosswalks) {
        for (const cw of scenarioData.map_features.crosswalks) {
            if (isPointInPolygon(worldX, worldY, cw.polygon)) {
                return {
                    type: 'Crosswalk',
                    typeKo: '횡단보도',
                    color: COLORS.crosswalks,
                    isMapFeature: true,
                    feature: cw
                };
            }
        }
    }

    // Stop Signs 체크
    if (layerVisibility.stop_signs && scenarioData.map_features.stop_signs) {
        for (const sign of scenarioData.map_features.stop_signs) {
            const dist = Math.sqrt((worldX - sign.position[0]) ** 2 + (worldY - sign.position[1]) ** 2);
            if (dist < 2.0) {
                return {
                    type: 'StopSign',
                    typeKo: '정지 표지판',
                    color: COLORS.stop_signs,
                    isMapFeature: true,
                    feature: sign
                };
            }
        }
    }

    // Speed Bumps 체크
    if (layerVisibility.speed_bumps && scenarioData.map_features.speed_bumps) {
        for (const bump of scenarioData.map_features.speed_bumps) {
            if (bump.polygon && isPointInPolygon(worldX, worldY, bump.polygon)) {
                return {
                    type: 'SpeedBump',
                    typeKo: '과속방지턱',
                    color: COLORS.speed_bumps,
                    isMapFeature: true,
                    feature: bump
                };
            }
        }
    }

    // Driveways 체크
    if (layerVisibility.driveways && scenarioData.map_features.driveways) {
        for (const driveway of scenarioData.map_features.driveways) {
            if (driveway.polygon && isPointInPolygon(worldX, worldY, driveway.polygon)) {
                return {
                    type: 'Driveway',
                    typeKo: '진입로',
                    color: COLORS.driveways,
                    isMapFeature: true,
                    feature: driveway
                };
            }
        }
    }

    return null;
}

// 점이 폴리라인 근처에 있는지 체크
function isPointNearPolyline(px, py, polyline, radius) {
    if (!polyline || polyline.length < 2) return false;

    for (let i = 0; i < polyline.length - 1; i++) {
        const x1 = polyline[i][0], y1 = polyline[i][1];
        const x2 = polyline[i + 1][0], y2 = polyline[i + 1][1];

        const dist = pointToSegmentDistance(px, py, x1, y1, x2, y2);
        if (dist < radius) return true;
    }
    return false;
}

// 점에서 선분까지의 거리
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
        return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;

    return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
}

// 점이 폴리곤 내부에 있는지 체크 (ray casting)
function isPointInPolygon(px, py, polygon) {
    if (!polygon || polygon.length < 3) return false;

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];

        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

function isPointInVehicle(px, py, state) {
    // 객체 중심 기준 상대 좌표로 변환
    const dx = px - state.x;
    const dy = py - state.y;

    // heading 방향으로 회전 (역회전)
    const cos = Math.cos(-state.heading);
    const sin = Math.sin(-state.heading);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    // 바운딩 박스 내부인지 체크 (10% 여유 추가)
    const halfLength = (state.length || 4) / 2 * 1.1;
    const halfWidth = (state.width || 2) / 2 * 1.1;

    return Math.abs(localX) <= halfLength && Math.abs(localY) <= halfWidth;
}

function showObjectInfo(obj) {
    // MAP 객체인 경우
    if (obj.isMapFeature) {
        showMapFeatureInfo(obj);
        return;
    }

    // Agent 객체인 경우
    const state = obj.state;
    const speed = Math.sqrt(state.velocity_x ** 2 + state.velocity_y ** 2) * 3.6; // m/s -> km/h
    const headingDeg = (state.heading * 180 / Math.PI).toFixed(1);

    popupTitle.innerHTML = `<span style="color: ${obj.color}">●</span> ${obj.typeKo} (ID: ${obj.id})`;

    let infoHtml = `
        <div class="info-row"><span class="info-label">타입</span><span class="info-value">${obj.type}</span></div>
        <div class="info-row"><span class="info-label">위치 X</span><span class="info-value">${state.x.toFixed(2)} m</span></div>
        <div class="info-row"><span class="info-label">위치 Y</span><span class="info-value">${state.y.toFixed(2)} m</span></div>
    `;

    // Z 좌표 추가
    if (state.z !== undefined) {
        infoHtml += `<div class="info-row"><span class="info-label">위치 Z</span><span class="info-value">${state.z.toFixed(2)} m</span></div>`;
    }

    infoHtml += `
        <div class="info-row"><span class="info-label">속도</span><span class="info-value">${speed.toFixed(1)} km/h</span></div>
        <div class="info-row"><span class="info-label">방향</span><span class="info-value">${headingDeg}°</span></div>
        <div class="info-row"><span class="info-label">크기 (L×W)</span><span class="info-value">${state.length?.toFixed(1) || '-'} × ${state.width?.toFixed(1) || '-'} m</span></div>
    `;

    // 높이 추가
    if (state.height !== undefined) {
        infoHtml += `<div class="info-row"><span class="info-label">높이</span><span class="info-value">${state.height.toFixed(2)} m</span></div>`;
    }

    popupContent.innerHTML = infoHtml;
    objectInfoPopup.classList.remove('hidden');
}

function showMapFeatureInfo(obj) {
    const feature = obj.feature;

    popupTitle.innerHTML = `<span style="color: ${obj.color}">●</span> ${obj.typeKo}`;

    let contentHtml = `<div class="info-row"><span class="info-label">타입</span><span class="info-value">${obj.type}</span></div>`;

    // ID가 있으면 표시
    if (feature.id !== undefined) {
        contentHtml += `<div class="info-row"><span class="info-label">ID</span><span class="info-value">${feature.id}</span></div>`;
    }

    // 타입별 추가 정보
    if (obj.type === 'Lane') {
        contentHtml += `<div class="info-row"><span class="info-label">포인트 수</span><span class="info-value">${feature.polyline?.length || 0}</span></div>`;
        if (feature.type !== undefined) {
            const typeName = LANE_TYPES[feature.type] || `UNKNOWN(${feature.type})`;
            contentHtml += `<div class="info-row"><span class="info-label">차로 타입</span><span class="info-value">${typeName}</span></div>`;
        }
        // 제한 속도
        if (feature.speed_limit_mph !== undefined && feature.speed_limit_mph !== null) {
            const speedKmh = (feature.speed_limit_mph * 1.60934).toFixed(0);
            contentHtml += `<div class="info-row"><span class="info-label">제한속도</span><span class="info-value">${feature.speed_limit_mph} mph (${speedKmh} km/h)</span></div>`;
        }
        // 보간 여부
        if (feature.interpolating !== undefined) {
            contentHtml += `<div class="info-row"><span class="info-label">보간</span><span class="info-value">${feature.interpolating ? 'Yes' : 'No'}</span></div>`;
        }
        // 연결 차로 정보 (entry/exit lanes)
        if (feature.entry_lanes && feature.entry_lanes.length > 0) {
            contentHtml += `<div class="info-row"><span class="info-label">진입 차로</span><span class="info-value">${feature.entry_lanes.join(', ')}</span></div>`;
        }
        if (feature.exit_lanes && feature.exit_lanes.length > 0) {
            contentHtml += `<div class="info-row"><span class="info-label">진출 차로</span><span class="info-value">${feature.exit_lanes.join(', ')}</span></div>`;
        }
        // 인접 차선
        if (feature.left_neighbors && feature.left_neighbors.length > 0) {
            const neighborIds = feature.left_neighbors.map(n => n.feature_id).join(', ');
            contentHtml += `<div class="info-row"><span class="info-label">좌측 인접</span><span class="info-value">${neighborIds}</span></div>`;
        }
        if (feature.right_neighbors && feature.right_neighbors.length > 0) {
            const neighborIds = feature.right_neighbors.map(n => n.feature_id).join(', ');
            contentHtml += `<div class="info-row"><span class="info-label">우측 인접</span><span class="info-value">${neighborIds}</span></div>`;
        }
    } else if (obj.type === 'RoadLine') {
        contentHtml += `<div class="info-row"><span class="info-label">포인트 수</span><span class="info-value">${feature.polyline?.length || 0}</span></div>`;
        if (feature.type !== undefined) {
            const typeName = ROAD_LINE_TYPES[feature.type] || `UNKNOWN(${feature.type})`;
            contentHtml += `<div class="info-row"><span class="info-label">라인 타입</span><span class="info-value">${typeName}</span></div>`;
        }
    } else if (obj.type === 'RoadEdge') {
        contentHtml += `<div class="info-row"><span class="info-label">포인트 수</span><span class="info-value">${feature.polyline?.length || 0}</span></div>`;
        if (feature.type !== undefined) {
            const typeName = ROAD_EDGE_TYPES[feature.type] || `UNKNOWN(${feature.type})`;
            contentHtml += `<div class="info-row"><span class="info-label">경계 타입</span><span class="info-value">${typeName}</span></div>`;
        }
    } else if (obj.type === 'Crosswalk') {
        contentHtml += `<div class="info-row"><span class="info-label">꼭짓점 수</span><span class="info-value">${feature.polygon?.length || 0}</span></div>`;
    } else if (obj.type === 'StopSign') {
        if (feature.position) {
            contentHtml += `<div class="info-row"><span class="info-label">위치 X</span><span class="info-value">${feature.position[0].toFixed(2)} m</span></div>`;
            contentHtml += `<div class="info-row"><span class="info-label">위치 Y</span><span class="info-value">${feature.position[1].toFixed(2)} m</span></div>`;
            if (feature.position[2] !== undefined) {
                contentHtml += `<div class="info-row"><span class="info-label">위치 Z</span><span class="info-value">${feature.position[2].toFixed(2)} m</span></div>`;
            }
        }
        if (feature.lane_ids && feature.lane_ids.length > 0) {
            contentHtml += `<div class="info-row"><span class="info-label">연결 차선</span><span class="info-value">${feature.lane_ids.join(', ')}</span></div>`;
        }
    } else if (obj.type === 'SpeedBump') {
        contentHtml += `<div class="info-row"><span class="info-label">꼭짓점 수</span><span class="info-value">${feature.polygon?.length || 0}</span></div>`;
        // 중심 좌표 계산
        if (feature.polygon && feature.polygon.length > 0) {
            const centerX = feature.polygon.reduce((sum, pt) => sum + pt[0], 0) / feature.polygon.length;
            const centerY = feature.polygon.reduce((sum, pt) => sum + pt[1], 0) / feature.polygon.length;
            contentHtml += `<div class="info-row"><span class="info-label">중심 X</span><span class="info-value">${centerX.toFixed(2)} m</span></div>`;
            contentHtml += `<div class="info-row"><span class="info-label">중심 Y</span><span class="info-value">${centerY.toFixed(2)} m</span></div>`;
        }
    } else if (obj.type === 'Driveway') {
        contentHtml += `<div class="info-row"><span class="info-label">꼭짓점 수</span><span class="info-value">${feature.polygon?.length || 0}</span></div>`;
        // 중심 좌표 계산
        if (feature.polygon && feature.polygon.length > 0) {
            const centerX = feature.polygon.reduce((sum, pt) => sum + pt[0], 0) / feature.polygon.length;
            const centerY = feature.polygon.reduce((sum, pt) => sum + pt[1], 0) / feature.polygon.length;
            contentHtml += `<div class="info-row"><span class="info-label">중심 X</span><span class="info-value">${centerX.toFixed(2)} m</span></div>`;
            contentHtml += `<div class="info-row"><span class="info-label">중심 Y</span><span class="info-value">${centerY.toFixed(2)} m</span></div>`;
        }
    }

    popupContent.innerHTML = contentHtml;
    objectInfoPopup.classList.remove('hidden');
}

function hideObjectInfo() {
    objectInfoPopup.classList.add('hidden');
    selectedObject = null;
}

// ===== 시나리오 검색 =====
function initializeSearch() {
    searchInput = document.getElementById('search-input');
    searchResults = document.getElementById('search-results');

    searchInput.addEventListener('input', onSearchInput);
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim()) {
            searchResults.classList.remove('hidden');
        }
    });

    // 외부 클릭 시 드롭다운 닫기
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) {
            searchResults.classList.add('hidden');
        }
    });
}

// 검색 상태 추적
let currentSearchQuery = '';
let currentSearchOffset = 0;

function onSearchInput(e) {
    const query = e.target.value.trim();

    // 디바운스
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    if (!query) {
        searchResults.classList.add('hidden');
        searchResults.innerHTML = '';
        currentSearchQuery = '';
        currentSearchOffset = 0;
        return;
    }

    searchTimeout = setTimeout(() => {
        currentSearchQuery = query;
        currentSearchOffset = 0;
        performSearch(query, 0, false);
    }, 300);
}

async function performSearch(query, offset = 0, append = false) {
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&offset=${offset}`);
        const result = await response.json();

        if (result.success) {
            displaySearchResults(result.results, result.total, result.has_more, offset, append);
            currentSearchOffset = offset + result.results.length;
        } else {
            searchResults.innerHTML = `<div class="search-result-item" style="color: #FF3B30;">${result.error}</div>`;
            searchResults.classList.remove('hidden');
        }
    } catch (error) {
        console.error('검색 오류:', error);
    }
}

function displaySearchResults(results, total, hasMore, offset, append = false) {
    if (results.length === 0 && offset === 0) {
        searchResults.innerHTML = '<div class="search-result-item" style="color: #8892b0;">결과 없음</div>';
        searchResults.classList.remove('hidden');
        return;
    }

    let html = results.map(r => `
        <div class="search-result-item" 
             data-path="${r.path}" 
             data-folder="${r.folder}"
             data-filename="${r.file_name}">
            <span class="file-name">${r.file_name}</span>
            <span class="folder-name">[${r.folder}]</span>
        </div>
    `).join('');

    if (hasMore) {
        const remaining = total - offset - results.length;
        html += `<div class="search-result-item load-more-btn" style="color: #00d9ff; text-align: center; cursor: pointer;">📁 더 보기 (+${remaining} files)</div>`;
    }

    if (append) {
        // 기존 load-more 버튼 제거 후 추가
        const loadMoreBtn = searchResults.querySelector('.load-more-btn');
        if (loadMoreBtn) loadMoreBtn.remove();
        searchResults.insertAdjacentHTML('beforeend', html);
    } else {
        searchResults.innerHTML = html;
    }

    searchResults.classList.remove('hidden');

    // 파일 클릭 이벤트
    searchResults.querySelectorAll('.search-result-item[data-path]').forEach(item => {
        item.addEventListener('click', () => {
            loadFileFromSearch(
                item.dataset.path,
                item.dataset.folder,
                item.dataset.filename
            );
        });
    });

    // 더 보기 버튼 클릭 이벤트
    const loadMoreBtn = searchResults.querySelector('.load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            performSearch(currentSearchQuery, currentSearchOffset, true);
        });
    }
}

async function loadFileFromSearch(filePath, folder, fileName) {
    showLoading(true);
    searchResults.classList.add('hidden');
    searchInput.value = fileName;

    try {
        // 파일 로드
        const response = await fetch('/api/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
        });
        const result = await response.json();

        if (result.success) {
            populateScenarioSelect(result.scenarios);
            scenarioSelect.disabled = false;

            // 드롭다운 UI 업데이트
            datasetSelect.value = folder;

            // 첫 번째 시나리오 자동 로드
            if (result.scenarios.length > 0) {
                scenarioSelect.value = 0;
                await loadScenario(0);
            }
        } else {
            alert('파일 로드 실패: ' + result.error);
        }
    } catch (error) {
        console.error('파일 로드 오류:', error);
    } finally {
        showLoading(false);
    }
}

