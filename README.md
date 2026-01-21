# Waymo Motion Dataset Visualizer

웹 브라우저에서 Waymo Open Motion Dataset을 시각화하는 Flask 기반 웹 애플리케이션입니다.

![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)
![Flask](https://img.shields.io/badge/Flask-2.0+-green.svg)
![TensorFlow](https://img.shields.io/badge/TensorFlow-2.x-orange.svg)

---

## ✨ 주요 특징

### 🗺️ 시나리오 시각화
- **Map Features**: Lanes(차로), Road Lines(도로선), Road Edges(도로경계), Crosswalks(횡단보도), Stop Signs(정지표지), Traffic Lights(신호등)
- **Agents**: SDC(자율주행차), Vehicles(차량), Pedestrians(보행자), Cyclists(자전거)
- **Trajectory**: 각 객체의 미래 이동 경로를 밝은 점선으로 시각화

### 🎮 재생 컨트롤
| 모드 | 동작 |
|------|------|
| 1번 재생 | 9.1초 도달 시 자동 정지 |
| 반복 재생 | 동일 시나리오 무한 반복 (기본값) |
| 연속 재생 | 시나리오 종료 시 다음 시나리오 자동 전환 |

### 🔍 파일 검색
- TFRecord 파일명 키워드로 실시간 검색
- 드롭다운 선택 시 자동 로드
- "더 보기" 버튼으로 페이지네이션 (50개씩)

### 🖱️ 인터랙티브 기능
- **마우스 호버**: 객체에 붉은색 테두리 강조 표시
- **클릭**: 객체 상세 정보 팝업 (위치, 속도, 타입 등)
- **드래그**: 맵 이동
- **휠**: 줌 인/아웃

### 🌐 서버 모드
- **개발 모드**: localhost:5000 (디버그 활성화)
- **공개 모드**: 0.0.0.0:12345 (외부 접속 가능)

---

## 🚀 설치 및 실행

### 설치
```bash
pip install flask tensorflow numpy
```

### 실행
```bash
# 개발 서버 (localhost:5000)
python app.py

# 공개 서버 (0.0.0.0:12345)
python app.py --mode public

# 커스텀 포트
python app.py --mode public --port 8080
```

> ⚠️ 공개 서버 모드 시 방화벽에서 해당 포트를 열어야 합니다.

---

## 📁 파일 구조

```
waymo_visualizer/
├── app.py              # Flask 웹서버 (API 엔드포인트)
├── data_loader.py      # TFRecord 파싱 및 데이터 로딩
├── requirements.txt    # Python 의존성
├── README.md           # 프로젝트 설명서
├── templates/
│   └── index.html      # 웹 UI 템플릿
└── static/
    ├── css/style.css   # 스타일시트
    └── js/visualizer.js # Canvas 렌더링 및 인터랙션
```

---

## 🔌 API 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|------------|--------|------|
| `/` | GET | 메인 페이지 |
| `/api/datasets` | GET | 데이터셋 폴더 목록 |
| `/api/dataset/<folder>/files` | GET | 폴더 내 TFRecord 파일 목록 |
| `/api/load` | POST | TFRecord 파일 로드 |
| `/api/scenario/<idx>` | GET | 시나리오 데이터 조회 |
| `/api/search?q=<query>` | GET | 파일명 검색 |

---

## ⚙️ 환경 설정

`app.py`에서 데이터셋 경로 설정:
```python
DATASET_ROOT = r"I:\WaymoOpenDataset\waymo_open_dataset_motion_v_1_3_1\uncompressed\scenario"
```

---

## 📋 타입 레퍼런스

### Lane Types (차로 타입)
| 값 | 설명 |
|----|------|
| 1 | FREEWAY (고속도로) |
| 2 | SURFACE_STREET (일반도로) |
| 3 | BIKE_LANE (자전거도로) |

### Road Line Types (도로선 타입)
| 값 | 설명 |
|----|------|
| 1 | BROKEN_SINGLE_WHITE (흰색 점선) |
| 2 | SOLID_SINGLE_WHITE (흰색 실선) |
| 6 | SOLID_SINGLE_YELLOW (노란색 실선) |
| 7 | SOLID_DOUBLE_YELLOW (노란색 이중실선) |
