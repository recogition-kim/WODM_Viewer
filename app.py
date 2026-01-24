"""
Waymo Motion Dataset 웹 시각화 서버
Flask 기반 웹 서버로 데이터를 제공하고 시각화 UI를 호스팅합니다.
"""

import os
import glob
import argparse
import threading
import subprocess
import sys
import socket
from flask import Flask, render_template, jsonify, request
from data_loader import WaymoDataLoader


def is_port_open(port: int, host: str = '0.0.0.0', timeout: float = 1.0) -> bool:
    """
    지정된 포트가 외부에서 접근 가능한지 확인합니다.
    방화벽이 열려 있으면 True, 닫혀 있으면 False를 반환합니다.
    
    Args:
        port: 확인할 포트 번호
        host: 바인딩할 호스트 (기본값: 0.0.0.0)
        timeout: 타임아웃 시간 (초)
    
    Returns:
        포트가 사용 가능하면 True, 그렇지 않으면 False
    """
    try:
        # 소켓을 열어 포트가 바인딩 가능한지 확인
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        sock.close()
        return True
    except socket.error:
        return False


def is_firewall_port_open(port: int) -> bool:
    """
    방화벽에서 해당 포트가 열려 있는지 확인합니다.
    
    Args:
        port: 확인할 포트 번호
    
    Returns:
        방화벽 규칙이 존재하면 True, 없으면 False
    """
    if sys.platform == 'win32':
        try:
            # Windows: netsh로 방화벽 규칙 확인
            result = subprocess.run(
                ['netsh', 'advfirewall', 'firewall', 'show', 'rule', 
                 f'name=Waymo Visualizer Port {port}'],
                capture_output=True,
                text=True,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            # 규칙이 존재하면 "규칙 이름:" 또는 "Rule Name:"이 출력됨
            return '규칙 이름:' in result.stdout or 'Rule Name:' in result.stdout
        except Exception:
            return False
    elif sys.platform == 'linux':
        try:
            # Linux: ufw status로 확인
            result = subprocess.run(
                ['sudo', 'ufw', 'status'],
                capture_output=True,
                text=True
            )
            return f'{port}/tcp' in result.stdout and 'ALLOW' in result.stdout
        except Exception:
            return False
    else:
        return False


def open_firewall_port(port: int, rule_name: str = None) -> bool:
    """
    방화벽에서 TCP 포트를 엽니다.
    Windows는 netsh, Ubuntu/Linux는 ufw를 사용합니다.
    
    Args:
        port: 열 포트 번호
        rule_name: 방화벽 규칙 이름 (Windows 전용, 기본값: 'Waymo Visualizer Port {port}')
    
    Returns:
        성공 여부 (True/False)
    """
    if sys.platform == 'win32':
        return _open_firewall_port_windows(port, rule_name)
    elif sys.platform == 'linux':
        return _open_firewall_port_linux(port)
    else:
        print(f"⚠️  방화벽 자동 설정이 지원되지 않는 OS입니다: {sys.platform}")
        print(f"   수동으로 TCP 포트 {port}을 열어주세요.")
        return False


def _open_firewall_port_windows(port: int, rule_name: str = None) -> bool:
    """Windows 방화벽에서 TCP 포트를 엽니다."""
    if rule_name is None:
        rule_name = f"Waymo Visualizer Port {port}"
    
    try:
        # 기존 규칙 삭제 (있으면)
        delete_cmd = [
            'netsh', 'advfirewall', 'firewall', 'delete', 'rule',
            f'name={rule_name}'
        ]
        subprocess.run(delete_cmd, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
        
        # 인바운드 규칙 추가
        add_cmd = [
            'netsh', 'advfirewall', 'firewall', 'add', 'rule',
            f'name={rule_name}',
            'dir=in',
            'action=allow',
            'protocol=TCP',
            f'localport={port}',
            'profile=any'
        ]
        result = subprocess.run(add_cmd, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        
        if result.returncode == 0:
            print(f"✅ Windows 방화벽 규칙 추가 완료: TCP 포트 {port}")
            return True
        else:
            print(f"❌ Windows 방화벽 규칙 추가 실패: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"❌ Windows 방화벽 설정 오류: {e}")
        print("   관리자 권한으로 실행하거나 수동으로 방화벽을 설정하세요.")
        return False


def _open_firewall_port_linux(port: int) -> bool:
    """Ubuntu/Linux 방화벽(ufw)에서 TCP 포트를 엽니다."""
    try:
        # ufw 사용 가능한지 확인
        check_ufw = subprocess.run(['which', 'ufw'], capture_output=True)
        
        if check_ufw.returncode == 0:
            # ufw로 포트 열기
            result = subprocess.run(
                ['sudo', 'ufw', 'allow', f'{port}/tcp'],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                print(f"✅ ufw 방화벽 규칙 추가 완료: TCP 포트 {port}")
                return True
            else:
                print(f"❌ ufw 방화벽 규칙 추가 실패: {result.stderr}")
                print("   sudo 권한으로 실행하거나 수동으로 설정하세요:")
                print(f"   sudo ufw allow {port}/tcp")
                return False
        else:
            # ufw가 없으면 iptables 시도
            print("ℹ️  ufw를 찾을 수 없습니다. iptables를 시도합니다...")
            result = subprocess.run(
                ['sudo', 'iptables', '-A', 'INPUT', '-p', 'tcp', '--dport', str(port), '-j', 'ACCEPT'],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                print(f"✅ iptables 방화벽 규칙 추가 완료: TCP 포트 {port}")
                return True
            else:
                print(f"❌ iptables 방화벽 규칙 추가 실패: {result.stderr}")
                print("   sudo 권한으로 실행하거나 수동으로 설정하세요:")
                print(f"   sudo iptables -A INPUT -p tcp --dport {port} -j ACCEPT")
                return False
                
    except Exception as e:
        print(f"❌ Linux 방화벽 설정 오류: {e}")
        print("   sudo 권한으로 실행하거나 수동으로 방화벽을 설정하세요.")
        return False

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
        
        # 방화벽 포트가 닫혀 있을 때만 열기 시도
        if is_firewall_port_open(port):
            print(f"\n✅ 방화벽 포트 {port}이(가) 이미 열려 있습니다.")
        else:
            print(f"\n🔓 방화벽 포트 열기 시도 중...")
            open_firewall_port(port)
        
        print()
        app.run(debug=False, host='0.0.0.0', port=port, threaded=True)
    else:
        # 개발 서버 모드
        port = args.port or 5000
        print(f"\n[개발 서버 모드]")
        print(f"브라우저에서 http://localhost:{port} 으로 접속하세요.\n")
        app.run(debug=True, host='127.0.0.1', port=port)
