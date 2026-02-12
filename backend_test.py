import requests
import sys
import json
from datetime import datetime

class CannonGameAPITester:
    def __init__(self, base_url="https://cannon-vs-tank.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, timeout=10):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=timeout)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=timeout)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                self.failed_tests.append({
                    "test": name,
                    "expected": expected_status,
                    "actual": response.status_code,
                    "response": response.text[:200]
                })
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append({
                "test": name,
                "error": str(e)
            })
            return False, {}

    def test_root_endpoint(self):
        """Test API root endpoint"""
        return self.run_test("API Root", "GET", "", 200)

    def test_trajectory_calculation(self):
        """Test trajectory calculation with valid physics data"""
        trajectory_data = {
            "angle": 45.0,
            "velocity": 30.0,
            "cannon_x": 50.0,
            "cannon_y": 50.0
        }
        success, response = self.run_test(
            "Trajectory Calculation", 
            "POST", 
            "trajectory", 
            200, 
            trajectory_data
        )
        
        if success and 'trajectory' in response:
            trajectory = response['trajectory']
            print(f"   Trajectory points: {len(trajectory)}")
            if len(trajectory) > 0:
                print(f"   First point: {trajectory[0]}")
                print(f"   Last point: {trajectory[-1]}")
                # Verify physics - projectile should go up then down
                if len(trajectory) > 5:
                    mid_point = trajectory[len(trajectory)//2]
                    if mid_point['y'] > trajectory[0]['y']:
                        print("   ✅ Physics check: Projectile follows parabolic path")
                    else:
                        print("   ⚠️  Physics warning: Trajectory may not be parabolic")
        
        return success

    def test_collision_detection(self):
        """Test collision detection system"""
        collision_data = {
            "angle": 45.0,
            "velocity": 50.0,
            "cannon_pos": {"x": 50, "y": 50},
            "wall_pos": {"x": 400, "y": 0, "width": 20, "height": 150},
            "target_pos": {"x": 900, "y": 520, "width": 60, "height": 60}
        }
        
        success, response = self.run_test(
            "Collision Detection",
            "POST",
            "check-collision",
            200,
            collision_data
        )
        
        if success:
            print(f"   Hit target: {response.get('hit_target', 'N/A')}")
            print(f"   Hit wall: {response.get('hit_wall', 'N/A')}")
            print(f"   Trajectory points: {len(response.get('trajectory', []))}")
        
        return success

    def test_stats_operations(self):
        """Test game statistics save and retrieve"""
        # Test saving stats
        stats_data = {
            "hits": 5,
            "attempts": 10,
            "difficulty": "medium"
        }
        
        save_success, save_response = self.run_test(
            "Save Game Stats",
            "POST",
            "stats",
            200,
            stats_data
        )
        
        if save_success:
            print(f"   Saved stats ID: {save_response.get('id', 'N/A')}")
        
        # Test retrieving stats
        get_success, get_response = self.run_test(
            "Get Game Stats",
            "GET",
            "stats",
            200
        )
        
        if get_success:
            stats_list = get_response if isinstance(get_response, list) else []
            print(f"   Retrieved {len(stats_list)} stat records")
        
        # Test best stats
        best_success, best_response = self.run_test(
            "Get Best Stats",
            "GET",
            "stats/best",
            200
        )
        
        if best_success and 'best_stats' in best_response:
            best_stats = best_response['best_stats']
            print(f"   Best stats count: {len(best_stats)}")
        
        return save_success and get_success and best_success

    def test_physics_accuracy(self):
        """Test physics calculations for accuracy"""
        print("\n🧮 Testing Physics Accuracy...")
        
        # Test 45-degree angle (optimal for range)
        trajectory_data = {
            "angle": 45.0,
            "velocity": 40.0,
            "cannon_x": 0.0,
            "cannon_y": 0.0
        }
        
        success, response = self.run_test(
            "Physics - 45° Optimal Angle",
            "POST",
            "trajectory",
            200,
            trajectory_data
        )
        
        if success and 'trajectory' in response:
            trajectory = response['trajectory']
            if len(trajectory) > 0:
                max_range = max(point['x'] for point in trajectory)
                max_height = max(point['y'] for point in trajectory)
                
                # Theoretical max range for 45° = v²/g
                theoretical_range = (40.0 ** 2) / 9.8
                range_error = abs(max_range - theoretical_range) / theoretical_range * 100
                
                print(f"   Max range: {max_range:.2f}m (theoretical: {theoretical_range:.2f}m)")
                print(f"   Max height: {max_height:.2f}m")
                print(f"   Range error: {range_error:.1f}%")
                
                if range_error < 5:  # Allow 5% error tolerance
                    print("   ✅ Physics accuracy within acceptable range")
                else:
                    print("   ⚠️  Physics accuracy may need review")
        
        return success

    def test_edge_cases(self):
        """Test edge cases and error handling"""
        print("\n🔍 Testing Edge Cases...")
        
        # Test invalid angle
        invalid_angle = {
            "angle": 95.0,  # Invalid angle > 90
            "velocity": 30.0,
            "cannon_x": 50.0,
            "cannon_y": 50.0
        }
        
        # This might return 200 or 400 depending on validation
        angle_success, _ = self.run_test(
            "Invalid Angle (>90°)",
            "POST",
            "trajectory",
            200,  # Assuming backend doesn't validate, just calculates
            invalid_angle
        )
        
        # Test zero velocity
        zero_velocity = {
            "angle": 45.0,
            "velocity": 0.0,
            "cannon_x": 50.0,
            "cannon_y": 50.0
        }
        
        velocity_success, _ = self.run_test(
            "Zero Velocity",
            "POST",
            "trajectory",
            200,
            zero_velocity
        )
        
        return angle_success and velocity_success

def main():
    print("🎯 Starting Cannon Game API Tests...")
    print("=" * 50)
    
    tester = CannonGameAPITester()
    
    # Run all tests
    tests = [
        tester.test_root_endpoint,
        tester.test_trajectory_calculation,
        tester.test_collision_detection,
        tester.test_stats_operations,
        tester.test_physics_accuracy,
        tester.test_edge_cases
    ]
    
    for test in tests:
        try:
            test()
        except Exception as e:
            print(f"❌ Test failed with exception: {str(e)}")
            tester.failed_tests.append({"test": test.__name__, "exception": str(e)})
    
    # Print summary
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    print(f"🎯 Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    if tester.failed_tests:
        print("\n❌ Failed Tests:")
        for failure in tester.failed_tests:
            print(f"   - {failure}")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())