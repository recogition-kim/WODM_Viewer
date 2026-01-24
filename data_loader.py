"""
Waymo Motion Dataset 데이터 로더
TFRecord 파일을 파싱하여 시각화에 필요한 데이터를 추출합니다.
"""

import tensorflow as tf
import numpy as np
from typing import Dict, List, Any, Optional


class WaymoDataLoader:
    """Waymo Motion Dataset TFRecord 로더"""
    
    def __init__(self, tfrecord_path: str):
        self.tfrecord_path = tfrecord_path
        self.scenarios = []
        self._load_scenarios()
    
    def _load_scenarios(self, max_scenarios: int = 100):
        """TFRecord에서 시나리오들을 로드합니다."""
        try:
            # 로컬 proto 파일 사용 (waymo_open_dataset 패키지 불필요)
            from protos import scenario_pb2
            
            dataset = tf.data.TFRecordDataset(self.tfrecord_path)
            
            for i, record in enumerate(dataset):
                if i >= max_scenarios:
                    break
                    
                scenario = scenario_pb2.Scenario()
                scenario.ParseFromString(record.numpy())
                self.scenarios.append(scenario)
                
            print(f"로드된 시나리오 수: {len(self.scenarios)}")
            
        except ImportError as e:
            print(f"protos 모듈 로드 실패: {e}")
            raise
    
    def get_scenario_list(self) -> List[Dict[str, Any]]:
        """시나리오 목록을 반환합니다."""
        return [
            {
                'index': i,
                'scenario_id': s.scenario_id,
                'num_tracks': len(s.tracks),
                'num_timesteps': len(s.timestamps_seconds)
            }
            for i, s in enumerate(self.scenarios)
        ]
    
    def get_scenario_data(self, scenario_index: int) -> Dict[str, Any]:
        """특정 시나리오의 전체 데이터를 반환합니다."""
        if scenario_index >= len(self.scenarios):
            return None
            
        scenario = self.scenarios[scenario_index]
        
        # tracks_to_predict 추출
        tracks_to_predict = []
        for pred in scenario.tracks_to_predict:
            tracks_to_predict.append({
                'track_index': pred.track_index,
                'difficulty': pred.difficulty
            })
        
        return {
            'scenario_id': scenario.scenario_id,
            'timestamps': list(scenario.timestamps_seconds),
            'current_time_index': scenario.current_time_index,
            'sdc_track_index': scenario.sdc_track_index,
            'objects_of_interest': list(scenario.objects_of_interest),
            'tracks_to_predict': tracks_to_predict,
            'map_features': self._extract_map_features(scenario),
            'tracks': self._extract_tracks(scenario),
            'traffic_lights': self._extract_traffic_lights(scenario)
        }
    
    def _extract_map_features(self, scenario) -> Dict[str, List]:
        """지도 요소들을 추출합니다."""
        features = {
            'lanes': [],
            'road_lines': [],
            'road_edges': [],
            'crosswalks': [],
            'stop_signs': [],
            'speed_bumps': [],
            'driveways': []
        }
        
        for feature in scenario.map_features:
            feature_id = feature.id
            
            if feature.HasField('lane'):
                lane = feature.lane
                polyline = [[pt.x, pt.y, pt.z] for pt in lane.polyline]
                
                # 경계 세그먼트 추출
                left_boundaries = []
                for seg in lane.left_boundaries:
                    left_boundaries.append({
                        'lane_start_index': seg.lane_start_index,
                        'lane_end_index': seg.lane_end_index,
                        'boundary_feature_id': seg.boundary_feature_id,
                        'boundary_type': seg.boundary_type
                    })
                
                right_boundaries = []
                for seg in lane.right_boundaries:
                    right_boundaries.append({
                        'lane_start_index': seg.lane_start_index,
                        'lane_end_index': seg.lane_end_index,
                        'boundary_feature_id': seg.boundary_feature_id,
                        'boundary_type': seg.boundary_type
                    })
                
                # 인접 차선 추출
                left_neighbors = []
                for neighbor in lane.left_neighbors:
                    left_neighbors.append({
                        'feature_id': neighbor.feature_id,
                        'self_start_index': neighbor.self_start_index,
                        'self_end_index': neighbor.self_end_index,
                        'neighbor_start_index': neighbor.neighbor_start_index,
                        'neighbor_end_index': neighbor.neighbor_end_index
                    })
                
                right_neighbors = []
                for neighbor in lane.right_neighbors:
                    right_neighbors.append({
                        'feature_id': neighbor.feature_id,
                        'self_start_index': neighbor.self_start_index,
                        'self_end_index': neighbor.self_end_index,
                        'neighbor_start_index': neighbor.neighbor_start_index,
                        'neighbor_end_index': neighbor.neighbor_end_index
                    })
                
                features['lanes'].append({
                    'id': feature_id,
                    'polyline': polyline,
                    'type': lane.type if hasattr(lane, 'type') else 0,
                    'speed_limit_mph': lane.speed_limit_mph if lane.HasField('speed_limit_mph') else None,
                    'interpolating': lane.interpolating if lane.HasField('interpolating') else False,
                    'entry_lanes': list(lane.entry_lanes) if hasattr(lane, 'entry_lanes') else [],
                    'exit_lanes': list(lane.exit_lanes) if hasattr(lane, 'exit_lanes') else [],
                    'left_boundaries': left_boundaries,
                    'right_boundaries': right_boundaries,
                    'left_neighbors': left_neighbors,
                    'right_neighbors': right_neighbors
                })
                
            elif feature.HasField('road_line'):
                road_line = feature.road_line
                polyline = [[pt.x, pt.y, pt.z] for pt in road_line.polyline]
                features['road_lines'].append({
                    'id': feature_id,
                    'polyline': polyline,
                    'type': road_line.type if hasattr(road_line, 'type') else 0
                })
                
            elif feature.HasField('road_edge'):
                road_edge = feature.road_edge
                polyline = [[pt.x, pt.y, pt.z] for pt in road_edge.polyline]
                features['road_edges'].append({
                    'id': feature_id,
                    'polyline': polyline,
                    'type': road_edge.type if hasattr(road_edge, 'type') else 0
                })
                
            elif feature.HasField('crosswalk'):
                crosswalk = feature.crosswalk
                polygon = [[pt.x, pt.y, pt.z] for pt in crosswalk.polygon]
                features['crosswalks'].append({
                    'id': feature_id,
                    'polygon': polygon
                })
                
            elif feature.HasField('stop_sign'):
                stop_sign = feature.stop_sign
                features['stop_signs'].append({
                    'id': feature_id,
                    'position': [stop_sign.position.x, stop_sign.position.y, stop_sign.position.z],
                    'lane_ids': list(stop_sign.lane)
                })
                
            elif feature.HasField('speed_bump'):
                speed_bump = feature.speed_bump
                polygon = [[pt.x, pt.y, pt.z] for pt in speed_bump.polygon]
                features['speed_bumps'].append({
                    'id': feature_id,
                    'polygon': polygon
                })
                
            elif feature.HasField('driveway'):
                driveway = feature.driveway
                polygon = [[pt.x, pt.y, pt.z] for pt in driveway.polygon]
                features['driveways'].append({
                    'id': feature_id,
                    'polygon': polygon
                })
        
        return features
    
    def _extract_tracks(self, scenario) -> Dict[str, List]:
        """객체 궤적들을 추출합니다."""
        tracks = {
            'sdc': None,
            'vehicles': [],
            'pedestrians': [],
            'cyclists': []
        }
        
        object_type_map = {
            1: 'vehicles',
            2: 'pedestrians',
            3: 'cyclists'
        }
        
        sdc_index = scenario.sdc_track_index
        
        for track_idx, track in enumerate(scenario.tracks):
            track_data = {
                'id': track.id,
                'object_type': track.object_type,
                'states': []
            }
            
            for state in track.states:
                if state.valid:
                    track_data['states'].append({
                        'x': state.center_x,
                        'y': state.center_y,
                        'z': state.center_z,
                        'heading': state.heading,
                        'velocity_x': state.velocity_x,
                        'velocity_y': state.velocity_y,
                        'length': state.length,
                        'width': state.width,
                        'height': state.height,
                        'valid': True
                    })
                else:
                    track_data['states'].append({
                        'valid': False
                    })
            
            if track_idx == sdc_index:
                tracks['sdc'] = track_data
            elif track.object_type in object_type_map:
                category = object_type_map[track.object_type]
                tracks[category].append(track_data)
        
        return tracks
    
    def _extract_traffic_lights(self, scenario) -> List[List[Dict]]:
        """신호등 상태를 추출합니다 (타임스텝별)."""
        traffic_lights = []
        
        state_names = {
            0: 'UNKNOWN',
            1: 'ARROW_STOP',
            2: 'ARROW_CAUTION',
            3: 'ARROW_GO',
            4: 'STOP',
            5: 'CAUTION',
            6: 'GO',
            7: 'FLASHING_STOP',
            8: 'FLASHING_CAUTION'
        }
        
        for dynamic_state in scenario.dynamic_map_states:
            timestep_lights = []
            for lane_state in dynamic_state.lane_states:
                timestep_lights.append({
                    'lane_id': lane_state.lane,
                    'state': lane_state.state,
                    'state_name': state_names.get(lane_state.state, 'UNKNOWN'),
                    'stop_point': [lane_state.stop_point.x, lane_state.stop_point.y] 
                        if lane_state.HasField('stop_point') else None
                })
            traffic_lights.append(timestep_lights)
        
        return traffic_lights


# 테스트용 코드
if __name__ == '__main__':
    import os
    
    tfrecord_path = r"i:\WaymoOpenDataset\waymo_open_dataset_motion_v_1_3_1\uncompressed\scenario\testing\testing.tfrecord-00000-of-00150"
    
    if os.path.exists(tfrecord_path):
        loader = WaymoDataLoader(tfrecord_path)
        scenarios = loader.get_scenario_list()
        print(f"시나리오 목록: {scenarios[:3]}")
        
        if scenarios:
            data = loader.get_scenario_data(0)
            print(f"첫 번째 시나리오 ID: {data['scenario_id']}")
            print(f"차선 수: {len(data['map_features']['lanes'])}")
            print(f"차량 수: {len(data['tracks']['vehicles'])}")
    else:
        print(f"파일이 존재하지 않습니다: {tfrecord_path}")
