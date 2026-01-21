"""
Waymo Motion Dataset 웹 시각화 서버
Flask 기반 웹 서버로 데이터를 제공하고 시각화 UI를 호스팅합니다.
"""

import os
import glob
import argparse
import threading
from flask import Flask, render_template, jsonify, request
from data_loader import WaymoDataLoader

app = Flask(__name__)

# 전역 데이터 로더
data_loader = None
current_tfrecord_path = None

# 시나리오 인덱스 (검색용)
scenario_index = []  # [{'scenario_id': ..., 'tfrecord_path': ..., 'scenario_index': ...}, ...]
index_building = False
index_built = False

# 기본 데이터셋 루트 경로
DATASET_ROOT = r"I:\WaymoOpenDataset\waymo_open_dataset_motion_v_1_3_1\uncompressed\scenario"


def get_data_loader(tfrecord_path=None):
    """데이터 로더를 반환합니다."""
    global data_loader, current_tfrecord_path
    
    if tfrecord_path and tfrecord_path != current_tfrecord_path:
        # 새 파일 로드
        print(f"TFRecord 파일 로딩 중: {tfrecord_path}")
        data_loader = WaymoDataLoader(tfrecord_path)
        current_tfrecord_path = tfrecord_path
    elif data_loader is None:
        raise ValueError("TFRecord 파일이 선택되지 않았습니다.")
    
    return data_loader


@app.route('/')
def index():
    """메인 페이지를 렌더링합니다."""
    return render_template('index.html')


@app.route('/api/datasets')
def get_datasets():
    """데이터셋 폴더 목록을 반환합니다."""
    try:
        datasets = []
        
        if os.path.exists(DATASET_ROOT):
            for folder in sorted(os.listdir(DATASET_ROOT)):
                folder_path = os.path.join(DATASET_ROOT, folder)
                if os.path.isdir(folder_path):
                    # 폴더 내 TFRecord 파일 개수 확인
                    tfrecords = glob.glob(os.path.join(folder_path, "*.tfrecord*"))
                    if tfrecords:
                        datasets.append({
                            'name': folder,
                            'path': folder_path,
                            'file_count': len(tfrecords)
                        })
        
        return jsonify({
            'success': True,
            'datasets': datasets,
            'root_path': DATASET_ROOT
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dataset/<path:folder_name>/files')
def get_dataset_files(folder_name):
    """특정 데이터셋 폴더의 TFRecord 파일 목록을 반환합니다."""
    try:
        folder_path = os.path.join(DATASET_ROOT, folder_name)
        offset = int(request.args.get('offset', 0))
        limit = 50
        
        if not os.path.exists(folder_path):
            return jsonify({
                'success': False,
                'error': f'폴더를 찾을 수 없습니다: {folder_name}'
            }), 404
        
        files = []
        tfrecords = sorted(glob.glob(os.path.join(folder_path, "*.tfrecord*")))
        total_count = len(tfrecords)
        
        # 페이지네이션 적용
        paginated_tfrecords = tfrecords[offset:offset + limit]
        
        for tfrecord in paginated_tfrecords:
            file_name = os.path.basename(tfrecord)
            file_size = os.path.getsize(tfrecord) / (1024 * 1024)  # MB
            files.append({
                'name': file_name,
                'path': tfrecord,
                'size_mb': round(file_size, 1)
            })
        
        has_more = (offset + limit) < total_count
        
        return jsonify({
            'success': True,
            'folder': folder_name,
            'files': files,
            'total_count': total_count,
            'offset': offset,
            'has_more': has_more
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/load', methods=['POST'])
def load_tfrecord():
    """TFRecord 파일을 로드합니다."""
    try:
        data = request.get_json()
        tfrecord_path = data.get('path')
        
        if not tfrecord_path or not os.path.exists(tfrecord_path):
            return jsonify({
                'success': False,
                'error': '유효하지 않은 파일 경로입니다.'
            }), 400
        
        loader = get_data_loader(tfrecord_path)
        scenarios = loader.get_scenario_list()
        
        return jsonify({
            'success': True,
            'path': tfrecord_path,
            'scenarios': scenarios
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/scenario/<int:scenario_index>')
def get_scenario(scenario_index: int):
    """특정 시나리오의 전체 데이터를 반환합니다."""
    try:
        if data_loader is None:
            return jsonify({
                'success': False,
                'error': 'TFRecord 파일이 로드되지 않았습니다.'
            }), 400
        
        data = data_loader.get_scenario_data(scenario_index)
        
        if data is None:
            return jsonify({
                'success': False,
                'error': f'시나리오 {scenario_index}를 찾을 수 없습니다.'
            }), 404
        
        return jsonify({
            'success': True,
            'data': data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/health')
def health_check():
    """서버 상태를 확인합니다."""
    return jsonify({
        'status': 'ok',
        'current_file': current_tfrecord_path,
        'dataset_root': DATASET_ROOT,
        'index_built': index_built,
        'index_building': index_building,
        'index_count': len(scenario_index)
    })


def build_scenario_index_task():
    """백그라운드에서 시나리오 인덱스를 빌드합니다."""
    global scenario_index, index_building, index_built
    
    try:
        import tensorflow as tf
        from protos import scenario_pb2
        
        new_index = []
        
        # 모든 하위 폴더에서 TFRecord 파일 검색
        for folder in os.listdir(DATASET_ROOT):
            folder_path = os.path.join(DATASET_ROOT, folder)
            if not os.path.isdir(folder_path):
                continue
            
            tfrecords = glob.glob(os.path.join(folder_path, "*.tfrecord*"))
            
            for tfrecord_path in tfrecords:
                try:
                    dataset = tf.data.TFRecordDataset(tfrecord_path)
                    
                    for idx, record in enumerate(dataset):
                        scenario = scenario_pb2.Scenario()
                        scenario.ParseFromString(record.numpy())
                        
                        new_index.append({
                            'scenario_id': scenario.scenario_id,
                            'tfrecord_path': tfrecord_path,
                            'scenario_index': idx,
                            'folder': folder
                        })
                except Exception as e:
                    print(f"Error reading {tfrecord_path}: {e}")
                    continue
        
        # 정렬
        new_index.sort(key=lambda x: x['scenario_id'])
        scenario_index = new_index
        index_built = True
        print(f"시나리오 인덱스 빌드 완료: {len(scenario_index)} 개")
        
    except Exception as e:
        print(f"인덱스 빌드 오류: {e}")
    finally:
        index_building = False


@app.route('/api/build-index', methods=['POST'])
def build_index():
    """시나리오 인덱스를 빌드합니다."""
    global index_building
    
    if index_building:
        return jsonify({
            'success': False,
            'error': '인덱스 빌드가 이미 진행 중입니다.'
        })
    
    if index_built:
        return jsonify({
            'success': True,
            'message': '인덱스가 이미 빌드되었습니다.',
            'count': len(scenario_index)
        })
    
    index_building = True
    thread = threading.Thread(target=build_scenario_index_task)
    thread.start()
    
    return jsonify({
        'success': True,
        'message': '인덱스 빌드가 시작되었습니다.'
    })


@app.route('/api/index-status')
def index_status():
    """인덱스 빌드 상태를 반환합니다."""
    return jsonify({
        'building': index_building,
        'built': index_built,
        'count': len(scenario_index)
    })


@app.route('/api/search')
def search_files():
    """TFRecord 파일명으로 검색합니다."""
    query = request.args.get('q', '').strip().lower()
    offset = int(request.args.get('offset', 0))
    limit = 50
    
    if not query:
        return jsonify({
            'success': True,
            'results': []
        })
    
    try:
        results = []
        
        # DATASET_ROOT 내 모든 폴더 검색
        if os.path.exists(DATASET_ROOT):
            for folder in sorted(os.listdir(DATASET_ROOT)):
                folder_path = os.path.join(DATASET_ROOT, folder)
                if not os.path.isdir(folder_path):
                    continue
                
                # 해당 폴더 내 TFRecord 파일 검색
                tfrecords = glob.glob(os.path.join(folder_path, "*.tfrecord*"))
                for tfrecord_path in tfrecords:
                    file_name = os.path.basename(tfrecord_path)
                    # 파일명에 쿼리가 포함되어 있으면 결과에 추가
                    if query in file_name.lower():
                        results.append({
                            'file_name': file_name,
                            'folder': folder,
                            'path': tfrecord_path
                        })
        
        # 정렬
        results.sort(key=lambda x: x['file_name'])
        total = len(results)
        
        # 페이지네이션 적용
        paginated_results = results[offset:offset + limit]
        has_more = (offset + limit) < total
        
        return jsonify({
            'success': True,
            'results': paginated_results,
            'total': total,
            'offset': offset,
            'has_more': has_more
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })


@app.route('/api/load-scenario', methods=['POST'])
def load_scenario_direct():
    """특정 시나리오를 직접 로드합니다."""
    global data_loader, current_tfrecord_path
    
    try:
        data = request.get_json()
        tfrecord_path = data.get('tfrecord_path')
        scenario_idx = data.get('scenario_index')
        
        if not tfrecord_path or scenario_idx is None:
            return jsonify({
                'success': False,
                'error': '필수 파라미터가 누락되었습니다.'
            }), 400
        
        # 새 파일이면 로더 생성
        if tfrecord_path != current_tfrecord_path:
            data_loader = WaymoDataLoader(tfrecord_path)
            current_tfrecord_path = tfrecord_path
        
        # 시나리오 데이터 로드
        scenario_data = data_loader.get_scenario_data(scenario_idx)
        
        if scenario_data is None:
            return jsonify({
                'success': False,
                'error': f'시나리오 인덱스 {scenario_idx}를 찾을 수 없습니다.'
            }), 404
        
        return jsonify({
            'success': True,
            'data': scenario_data,
            'tfrecord_path': tfrecord_path,
            'scenario_index': scenario_idx
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Waymo Motion Dataset 웹 시각화 서버')
    parser.add_argument('--mode', type=str, choices=['dev', 'public'], default='dev',
                        help='서버 모드: dev(개발용, localhost:5000), public(공개용, 0.0.0.0:12345)')
    parser.add_argument('--port', type=int, default=None,
                        help='포트 번호 (지정하지 않으면 dev=5000, public=12345)')
    args = parser.parse_args()
    
    print("=" * 60)
    print("🚗 Waymo Motion Dataset 웹 시각화 서버")
    print("=" * 60)
    print(f"데이터셋 경로: {DATASET_ROOT}")
    
    if args.mode == 'public':
        # 공개 서버 모드
        port = args.port or 12345
        print(f"\n[공개 서버 모드]")
        print(f"모든 네트워크 인터페이스에서 접속 가능")
        print(f"접속 주소: http://<서버 IP 주소>:{port}")
        print(f"\n⚠️  주의: 방화벽에서 TCP 포트 {port}을 열어야 합니다.\n")
        app.run(debug=False, host='0.0.0.0', port=port, threaded=True)
    else:
        # 개발 서버 모드
        port = args.port or 5000
        print(f"\n[개발 서버 모드]")
        print(f"브라우저에서 http://localhost:{port} 으로 접속하세요.\n")
        app.run(debug=True, host='127.0.0.1', port=port)
